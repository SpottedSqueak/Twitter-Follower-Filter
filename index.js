import puppeteer, { Locator } from 'puppeteer-core';
import { getChromiumPath, getFirefoxPath } from 'browser-paths';
import open from 'open';
/**@import { Browser, Page, ElementHandle } from 'puppeteer-core' */

import fs from 'fs-extra';
import path from 'node:path';
import * as db from './js/database.js';
import { DEFAULT_BROWSER_PARAMS, IGNORE_DEFAULT_PARAMS, PEDO_CHECK, UNDERAGE_CHECK, ZOO_CHECK } from './js/constants.js';
import { sleep, getRandom, closeLogs, setupUtils, writeFollowersToCSV, getVersion, hideConsole } from './js/utils.js';

const __dirname = import.meta.dirname;
const userPath = path.resolve(__dirname, './data/user-data');
const defaultPath = path.resolve(__dirname, './data/default');
const userSettings = path.resolve(__dirname, './data/user-settings.json');
const cssPath = path.resolve(__dirname, './content/css/userChrome.css');
const browserChoice = path.resolve(__dirname, './browser.json');
const loadOpts = { waitUntil: 'load' };
// Selectors
const followerContainerSel = 'h1[id*="accessible-list"] + div';
const profileSel = 'a[data-testid="AppTabBar_Profile_Link"]';
const fSelector = 'button[data-testid="UserCell"]';
const accountMenuSel = 'button[data-testid="SideNav_AccountSwitcher_Button"]';
const loginSel = 'a[href="/login"]';

let browserSettings = {};
let tBrowserSettings = {};
let filters = null;
let isRunning = false;
let isAccountAction = false;
// Values provided by login
let profileURL = '';
// let currentFollowerCount = 0;
let totalFollowerCount = 0;

/**@type Browser */
let browser = null;
/**@type Browser */
let tBrowser = null;
/** @type Page */
export let page = null;
export let userAccount = '';
export async function closeAll() {
  console.log('Closing everything...');
  await db.close();
  await closeLogs();
  await tBrowser?.close();
}

let followers = [];

async function saveSettings(newSettings) {
  console.log('Saving settings...');
  filters = newSettings;
  await fs.writeJson(userSettings, newSettings);
  return sleep(500);
}

async function loadSettings() {
  return fs.readJson(userSettings)
  .then(d => {
    return { ...d, userAccount, totalFollowerCount, isRunning };
  })
  .catch(() => {
    return { userAccount, totalFollowerCount, isRunning };
  });
}

async function getbrowserInfo() {
  const { browser: choice } = await fs.readJson(browserChoice).catch(() => ({}));
  const FFBrowserInfo = {
    executablePath: getFirefoxPath(),
    product: 'firefox',
    protocol: 'webDriverBiDi',
  };
  const ChromeBrowserInfo = {
    executablePath: getChromiumPath(),
    product: 'chrome',
  }
  if (!choice || /^f/i.test(choice)) {
    return FFBrowserInfo.executablePath ? FFBrowserInfo : ChromeBrowserInfo;
  } else {
    return ChromeBrowserInfo.executablePath ? ChromeBrowserInfo : FFBrowserInfo;
  }
}

// Setup browser
async function setupBrowser() {
  const browserInfo = await getbrowserInfo();
  console.log(`Path to browser: ${browserInfo.executablePath}`);
  // Make sure the User profiles exist
  await fs.ensureDir(userPath);
  await fs.ensureDir(defaultPath);
  // Update chrome.css file (for Firefox)
  await fs.copy(cssPath, path.join(userPath, '/chrome/userChrome.css'));
  await fs.copy(cssPath, path.join(defaultPath, '/chrome/userChrome.css'));
  // Set up browser
  browserSettings = {
    ...browserInfo,
    headless: false,
    defaultViewport: {
      width: 1600,
      height: 900,
    },
    extraPrefsFirefox: {
      'toolkit.legacyUserProfileCustomizations.stylesheets': true,
      'toolkit.legacyUserProfileCustomizations.windowIcon': true,
      'browser.tabs.inTitlebar': 0,
    },
    args: DEFAULT_BROWSER_PARAMS,
    ignoreDefaultArgs: IGNORE_DEFAULT_PARAMS,
    userDataDir: defaultPath,
  };
  browser = await puppeteer.launch(browserSettings).catch(console.error);
  if (!browser?.connected) return Promise.reject('Browser setup failed!');
  // Setup Twitter browser settings
  tBrowserSettings = { ...browserSettings, ...{ headless: true, userDataDir: userPath } };
  // Setup disconnect for browser closing
  browser.on('disconnected', closeAll);

  page = (await browser.pages())[0] || await browser.newPage();
}

async function setupTwitterBrowser(headless = true, userDataDir = tBrowserSettings.userDataDir, tries = 0) {
  tBrowser?.off('disconnected');
  await tBrowser?.close();
  tBrowser = await puppeteer.launch({ ...tBrowserSettings, ...{ headless, userDataDir } }).catch((e) => {
    console.log(e);
    if (tries < 2)
      return setupTwitterBrowser(headless, userDataDir, tries++);
  });
  if (!tBrowser?.connected) return Promise.reject('Browser setup failed!');
  const aController = new AbortController();
  tBrowser.once('disconnected', () => aController.abort());
  return aController.signal;
}

// Open settings page
async function openSettings() {
  // Setup page functions
  page.exposeFunction('gather-followers', gatherFollowers);
  page.exposeFunction('save-settings', saveSettings);
  page.exposeFunction('load-settings', loadSettings);
  page.exposeFunction('load-followers', loadFollowers);
  page.exposeFunction('get-follower-count', db.getEntriesCount);
  page.exposeFunction('stop-query', stopQuery);
  page.exposeFunction('open-url', (url) => open(url));
  page.exposeFunction('export-to-csv', writeFollowersToCSV);
  page.exposeFunction('user-login', userLogin);
  page.exposeFunction('user-logout', userLogout);
  page.exposeFunction('remove-follower', removeFollower);
  page.exposeFunction('get-version', getVersion);
  page.exposeFunction('clear-db', db.clearEntries);

  // Load settings page
  const url = path.join('file://', path.resolve(__dirname, 'content/html/settings.html'));
  await page.goto(url);
}

/**
 * Queries a given elementHandle to get the appropriate follower data.
 * 
 * @param {ElementHandle} handle 
 * @returns 
 */
async function getDataFromElement(handle) {
  const data = await handle.evaluate((el, userAccount) => {
    let eData = {
      url: el.querySelector('a').href.trim(),
      img: el.querySelector('img').src.trim(),
      username: el.querySelector('div > div:last-child > div:first-child > div:first-child > div > div:first-child')?.textContent.trim() || '',
      account: el.querySelector('div > div:last-child > div:first-child > div:first-child > div > div:last-child > div:first-child').textContent.trim(),
      bio: el.querySelector('div > div[dir="auto"]:not([id])')?.textContent.trim() || '',
    };
    eData = {
      followerid: `${eData.url}_${userAccount}`,
      ...eData,
      allText: [eData.username, eData.account, eData.bio].join(' '),
      userAccount,
    };
    return eData;
  }, userAccount);
  return data;
}

async function setUsername(profileLink) {
  profileURL = profileLink;
  userAccount = profileLink.split('/').pop().toLowerCase();
  console.log(`Logged in as: ${userAccount}`);
}

async function forceLogin() {
  // Not logged in, show window
  console.log('Asking user to log in...');
  const signal = await setupTwitterBrowser(false);
  const loginPage = (await tBrowser.pages())[0];
  await loginPage.goto('https://www.x.com', { ...loadOpts, timeout: 0, signal }).catch(console.error);
  if (!tBrowser?.connected) return false;
  const profileLink = await loginPage.locator(profileSel).setTimeout(0).map(el => el.href).wait({ signal })
    .catch(() => {
      console.log('Canceling login...');
      return false;
    });
  if (profileLink) {
    await setUsername(profileLink);
    await scrapeFollowerCount();
  }
  return profileLink;
}

async function checkLogin(skipForceLogin = false) {
  userAccount = '';
  const signal = await setupTwitterBrowser();
  //Log in to Twitter
  let loginPage = await tBrowser.newPage();
  console.log('Checking login...');
  await loginPage.goto('https://www.x.com', { ...loadOpts, signal })
    .catch(() => {});
  if (!tBrowser?.connected) return false;
  // Check for login...
  let profileLink = await Locator.race([
    loginPage.locator(profileSel),
    loginPage.locator(loginSel)
  ]).map(el => {
    if (el.dataset.testid === 'loginButton') return false;
    return el.href;
  }).wait();
  if (!skipForceLogin && !profileLink) profileLink = await forceLogin();
  else if (profileLink) {
    await setUsername(profileLink);
    await scrapeFollowerCount({ signal });
  }
  if (!profileLink) {
    console.log('Not logged in!');
    await tBrowser?.close();
    return false;
  }
  // Close login page
  await tBrowser?.close();
  return true;
}

async function loopRetryLogic(retryCount, twitterPage) {
  // Height didn't change? Retry 3 times to give it time to change
  console.log('Height not matching! Retrying...');
  if (retryCount < 3) {
    if (retryCount > 1) {
      if (!tBrowser.connected) return false;
      await twitterPage.evaluate(() => {
        const div = document.querySelector('html');
        div.scrollTo({ top: div.scrollTop - 500, behavior: 'smooth' });
        setTimeout(() => {
          div.scrollTo({ top: div.scrollTop + 1000, behavior: 'smooth' });
        }, 500);
      });
    }
    retryCount++;
    console.log(`No new data? Retrying in: ${retryCount * 10} seconds`);
    await sleep(retryCount * 10 * 1000);
    return true;
  } else return false;
}

/**
 * 
 * @param {ElementHandle} followerContainer 
 */
async function rateLimitedCheck(followerContainer) {
  let limited = null;
  let count = 0;
  do {
    if (!tBrowser?.connected || !isRunning || count > 9) break;
    limited = await followerContainer.$('button ::-p-text(Retry)').catch((e) => console.error(e));
    count++;
    // If retry button, wait before clicking
    if (limited) {
      console.log(`Rate limited! Waiting ${count} minutes before continuing...`);
      // Doubles each attempt
      await sleep(count * 60 * 1000);
      limited.click();
      await sleep(10 * 1000);
    }
    if (!isRunning) break;
  } while (limited);
}
/**
 * 
 * @param {String} path 
 * @param {AbortSignal} signal 
 * @returns 
 */
async function setupforTwitterQuery(path, signal) {
  // Open headless browser to scrape followers
  if (!signal || !tBrowser?.connected) {
    signal = await setupTwitterBrowser();
  }
  const pages = await tBrowser.pages();
  let twitterPage = await tBrowser.newPage();
  pages.forEach(p => p.close());

  const followerUrl = `${profileURL}/${path}`;
  // Go to the follower page
  console.log(`Loading follower page for: ${userAccount}`);
  await twitterPage.goto(followerUrl, { ...loadOpts, signal, timeout: 5 * 60 * 1000}).catch(() => console.log('Page loaded??'));
  if (!tBrowser.connected || !twitterPage) return Promise.reject('Couldn\'t load page');
  console.log(`Loading ${path} list!`);
  await sleep(5000);
  if (!isRunning) return Promise.reject('User canceled');
  // Query necessary containers
  const followerContainer = await twitterPage.locator(followerContainerSel).waitHandle()
    .catch(console.error);
  if (!followerContainer) {
    await twitterPage.close();
    return Promise.reject('Couldn\'t load page');
  }
  const heightDiv = await followerContainer.$('div');
  tBrowser.once('disconnected', () => isRunning = false);
  
  return ({ twitterPage, followerContainer, heightDiv });
}

async function queryTwitter({ path = 'followers', signal }) {
  let { twitterPage, followerContainer, heightDiv } = await setupforTwitterQuery(path, signal);
  // Loop through list on page and scroll down when complete
  console.log('Beginning follower scraping...');
  // Wait for results to load...
  let currFollowers = null;
  let newData = null;
  let newMinHeight = null;
  let minHeight = null;
  let retryCount = 0;
  // let prevFollowers = [];
  followerLoop: do {
    if (!isRunning || !tBrowser?.connected) break followerLoop;
    newMinHeight = await heightDiv.evaluate(el => Number(el.style.minHeight.replace('px', '')));
    // Check minheight change, which shows that the page has loaded new followers
    if (newMinHeight && minHeight !== newMinHeight) minHeight = newMinHeight;
    else {
      const result = await loopRetryLogic(retryCount, twitterPage);
      if (result) continue;
      else break followerLoop;
    }
    retryCount = 0;
    // Get all currently visible followers and add to database
    if (!isRunning) break followerLoop;
    await twitterPage.locator(followerContainerSel).setWaitForStableBoundingBox().wait();
    await sleep(500);
    let followersToAdd = [];
    currFollowers = await followerContainer.$$(fSelector);
    console.log(`Found ${currFollowers.length} followers!`);
    for (const el of currFollowers) {
      newData = await getDataFromElement(el);
      if (newData) {
        followersToAdd.push(newData);
      }
    }
    // Check for repeat entries, exit if set to only update
    db.addEntries(followersToAdd);
    // Scroll down past last element
    if (!isRunning) break followerLoop;
    const scrollWait = twitterPage.locator(`a[href$="${followersToAdd[0].url.split('/').pop()}"]`).setVisibility('hidden').wait()
      .catch(() => {
        console.log('Scroll timed out? Either reaching end, network hiccup, or rate limited.');
      });
    currFollowers.push(await currFollowers.pop().evaluateHandle((e) => e.scrollIntoView({ behavior: 'smooth', block: 'end' })));
    currFollowers.forEach(el => el.dispose());
    await twitterPage.locator(followerContainerSel).setWaitForStableBoundingBox().wait();
    // Wait for page to refresh by checking that first div is gone
    // console.log(`Looking for: a[href$="${followersToAdd[0].url.split('/').pop()}"]`);
    await scrollWait;
    if (!isRunning) break followerLoop;
    // Check if rate limited
    await rateLimitedCheck(followerContainer);
    if (!isRunning) break followerLoop;
    // Get new minHeight for div
    newMinHeight = await heightDiv.evaluate(el => Number(el.style.minHeight.replace('px', '')));
    await sleep(5000 + getRandom(1000));
  } while (isRunning);
  // Clean up references
  await followerContainer?.dispose();
  await heightDiv?.dispose();
  if (!isRunning) return Promise.reject('User exited');
  else tBrowser.off('disconnected');
  return Promise.resolve();
}

async function removeFollower(url, isBlock = false) {
  if (!tBrowser?.connected) {
    await setupTwitterBrowser();
    isRunning = true;
  }
  const remove = 'div[role="menuitem"] ::-p-text(Remove this follower)';
  const block = 'div[data-testid="block"]';
  const fPage = await tBrowser.newPage();
  // Load page
  await fPage.goto(url, loadOpts).catch(console.error);
  // Click menu
  await fPage.locator('button[data-testid="userActions"]').wait().click();
  // Click unfollow/block
  await fPage.locator(isBlock ? block : remove).wait().click();
  await fPage.locator('button[data-testid="confirmationSheetConfirm"]').wait().click();
  await sleep(500);
  await fPage.close();
  // Remove from DB after
  await db.deleteEntry(url);
  isRunning = false;
}

async function stopQuery() {
  isRunning = false;
  await tBrowser?.close();
}

async function scrapeFollowerCount({ signal } = {}) {
  if (!signal || !tBrowser?.connected) signal = await setupTwitterBrowser();
  if(!tBrowser?.connected) return Promise.reject();
  const pages = await tBrowser.pages();
  const twitterPage = await tBrowser.newPage();
  pages.forEach(p => p.close());

  console.log('Gathering total follower count estimate...');
  await twitterPage.goto(profileURL, { ...loadOpts, signal }).catch(console.error);
  if ((!isRunning && !isAccountAction) || !tBrowser?.connection) return Promise.reject();
  const json = await twitterPage.locator('script[data-testid="UserProfileSchema-test"]')
    .map(el => JSON.parse(el.innerHTML)).wait();
  totalFollowerCount = json.author?.interactionStatistic[0]?.userInteractionCount || 0;
  await resetSettingsPage();
  console.log(`Total followers: ${totalFollowerCount.toLocaleString()}`);
  return { signal };
}

async function gatherFollowers() {
  if (isRunning) return false;
  if (!profileURL) return console.log('Please login first!');
  // currentFollowerCount = await db.getEntriesCount();
  isRunning = true;
  await scrapeFollowerCount()
    .then(queryTwitter)
    .then(() => console.log('Follower collection complete!'))
    .catch(e => {
      if (e) console.log(e);
    }).finally(() => {
      isRunning = false;
      return resetSettingsPage();
    });
  await tBrowser?.close();
}

async function loadFollowers() {
  if (!userAccount) return;
  // Load followers
  followers = followers?.length ? followers : await db.getEntries();
  const customFilters = filters.customFilters.split('\n')
    .filter(e => !!e.trim()).map(e => new RegExp(`\\b${e.trim()}\\b`, 'gi'));
  // Filter through them with given criteria
  const filteredFollowers = followers.filter((f) => {
    let matchFound = false;
    while (true) {
      // Checkbox checks
      if (filters.underage && UNDERAGE_CHECK.test(f.bio)) {
        matchFound = true;
        break;
      } else if (filters.zoo && ZOO_CHECK.test(f.allText)) {
        matchFound = true;
        break;
      } else if (filters.pedo && PEDO_CHECK.test(f.allText)) {
        matchFound = true;
        break;
      }
      // Custom filters
      if (customFilters.length)
        matchFound = customFilters.some(regex => regex.test(f.allText));
      break;
    }
    return matchFound;
  });
  // return list for display
  return filteredFollowers;
}

async function userLogin() {
  if (isAccountAction) return console.log('Account action already running!');
  isAccountAction = true;
  await checkLogin();
  isAccountAction = false;
  await tBrowser?.close();
}

async function userLogout() {
  if (isAccountAction) return console.log('Account action already running!');
  isAccountAction = true;
  console.log(`Logging out user: ${userAccount}`);
  const signal = await setupTwitterBrowser();
  const lPage = await tBrowser.newPage();
  await lPage.goto('https://www.x.com', { ...loadOpts, setTimeout: 5 * 60 * 1000, signal })
    .catch(console.error);
  if (!tBrowser?.connected) {
    isAccountAction = false;
    return console.log('Login canceled!');
  }
  await lPage.locator(accountMenuSel).wait();
  let btn = await lPage.locator(accountMenuSel).waitHandle();
  await btn.evaluate(h => h.click());
  await btn.dispose();
  let redirect = lPage.locator(loginSel).setTimeout(0).wait({ signal });
  btn = await lPage.locator('a[href*="logout"]').waitHandle();
  await btn.evaluate(h => h.click());
  await btn.dispose();
  btn = await lPage.locator('button[data-testid="confirmationSheetConfirm"]').waitHandle();
  await btn.evaluate(h => h.click());
  await btn.dispose();
  await redirect.catch(console.error);
  await tBrowser?.close();
  // Reset values
  userAccount = '';
  profileURL = ''
  totalFollowerCount = 0;
  resetSettingsPage();
  isAccountAction = false;
  console.log(`User logged out!`);
}

async function resetSettingsPage() {
  return page?.evaluate(() => {
    window?.loadSettings();
  });
}

async function init() {
  hideConsole();
  await setupUtils();
  filters = await loadSettings();
  await db.openDB();
  await setupBrowser();
  await openSettings();
  isAccountAction = true;
  isRunning = true;
  checkLogin(true)
    .finally(() => {
      isAccountAction = false;
      isRunning = false;
      return resetSettingsPage();
    });
}

await init();
