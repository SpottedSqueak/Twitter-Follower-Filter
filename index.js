import puppeteer from 'puppeteer-core';
import { getChromiumPath, getFirefoxPath } from 'browser-paths';
import open from 'open';
/**@import { Browser, Page, ElementHandle } from 'puppeteer-core' */

import fs from 'fs-extra';
import path from 'node:path';
import * as db from './js/database.js';
import { DEFAULT_BROWSER_PARAMS, IGNORE_DEFAULT_PARAMS, PEDO_CHECK, UNDERAGE_CHECK, ZOO_CHECK } from './js/constants.js';
import { closeLogs, setupUtils, writeFollowersToCSV } from './js/utils.js';

const __dirname = import.meta.dirname;
const userPath = path.resolve(__dirname, './data/user-data');
const defaultPath = path.resolve(__dirname, './data/default');
const userSettings = path.resolve(__dirname, './data/user-settings.json');
const cssPath = path.resolve(__dirname, 'content/css/userChrome.css');
const browserChoice = 'browser.json';
const loadOpts = {
  waitUntil: 'load',
  timeout: 3000,
};
// Selectors
const profileSel = 'a[aria-label="Profile"]'; //'a ::p-text(Profile)';
const fSelector = 'button[data-testid="UserCell"]';
const accountMenuSel = 'button[aria-label="Account menu"]';

let browserSettings = {};
let tBrowserSettings = {};
let filters = null;
let isRunning = false;

/**@type Browser */
let browser = null;
/**@type Browser */
let tBrowser = null;
/** @type Page */
let page = null;

export let user_account = '';
let followers = [];

function sleep(ms = 500) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getRandom(max) {
  return Math.round(Math.random() * (max - 1) + 1);
}

async function saveSettings(newSettings) {
  filters = newSettings;
  await fs.writeJson(userSettings, newSettings);
  return sleep(500);
}

async function loadSettings() {
  return fs.readJson(userSettings).then(d => {
    d.user_account = user_account;
    return d;
  }).catch(() => ({}));
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
  // Make sure the User profiles exist
  await fs.ensureDir(userPath);
  await fs.ensureDir(defaultPath);
  // Update chrome.css file (for Firefox)
  await fs.copy(cssPath, path.resolve(userPath, '/chrome/userChrome.css'));
  await fs.copy(cssPath, path.resolve(defaultPath, '/chrome/userChrome.css'));
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
    },
    args: DEFAULT_BROWSER_PARAMS,
    ignoreDefaultArgs: IGNORE_DEFAULT_PARAMS,
    userDataDir: defaultPath,
  };
  browser = await puppeteer.launch(browserSettings);
  // Setup Twitter browser settings
  tBrowserSettings = { ...browserSettings, ...{ headless: true, userDataDir: userPath }};
  // Setup disconnect for browser closing
  browser.on('disconnected', async () => {
    console.log('Closing everything...');
    await db.close();
    await closeLogs();
    await tBrowser?.close();
  });

  page = (await browser.pages())[0] || await browser.newPage();
  await page.reload();
}

async function setupTwitterBrowser(headless = true, userDataDir = tBrowserSettings.userDataDir) {
  await tBrowser?.close();
  tBrowser = await puppeteer.launch({ ...tBrowserSettings, ...{ headless, userDataDir }});
}

// Open settings page
async function openSettings() {
  // Setup page functions
  page.exposeFunction('query-twitter', queryTwitter);
  page.exposeFunction('save-settings', saveSettings);
  page.exposeFunction('load-settings', loadSettings);
  page.exposeFunction('load-followers', loadFollowers);
  page.exposeFunction('get-follower-count', () => db.getEntriesCount());
  page.exposeFunction('stop-query', () => tBrowser?.close());
  page.exposeFunction('open-url', (url) => open(url));
  page.exposeFunction('export-to-csv', writeFollowersToCSV);
  page.exposeFunction('user-login', userLogin);
  page.exposeFunction('user-logout', userLogout);

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
  const data = await handle.evaluate(el => {
    let eData = {
      url: el.querySelector('a').href.trim(),
      img: el.querySelector('img').src.trim(),
      username: el.querySelector('div > div:last-child > div:first-child > div:first-child > div > div:first-child')?.textContent.trim() || '',
      account: el.querySelector('div > div:last-child > div:first-child > div:first-child > div > div:last-child > div:first-child').textContent.trim(),
      bio: el.querySelector('div > div[dir="auto"]:not([id])')?.textContent.trim() || '',
    };
    eData = {
      ...eData,
      allText: [eData.username, eData.account, eData.bio].join(' '),
      user_account,
    };
    return eData;
  });
  return data;
}

async function setUsername(profileLink) {
  const username = await profileLink.evaluate(el => el.href);
  user_account = username.split('/').pop().toLowerCase();
}

async function forceLogin() {
  // Not logged in, show window
  console.log('Asking user to log in...');
  await setupTwitterBrowser(false);
  const loginPage = (await tBrowser.pages())[0];
  await loginPage.goto('https://x.com', loadOpts);
  const profileLink = await loginPage.waitForSelector(profileSel, { timeout: 0 }).catch(() => {
    console.log('Canceling login...');
    return false;
  });
  if (profileLink) await setUsername(profileLink);
  return profileLink;
}
async function checkLogin(skipForceLogin = false) {
  user_account = '';
  await setupTwitterBrowser();
  //Log in to Twitter
  const pages = await tBrowser.pages();
  let loginPage = pages[0];
  console.log('Checking login...');
  await loginPage.goto('https://x.com');
  // Check for login...
  let profileLink = await loginPage.waitForSelector(profileSel, { timeout: 2000 }).catch(() => console.log('Not logged in!'));
  if (!skipForceLogin && !profileLink) profileLink = await forceLogin();
  if (!profileLink) {
    await tBrowser?.close();
    return false;
  }
  if (!user_account) await setUsername(profileLink);
  // Close login page
  await tBrowser?.close();
  return true;
}

async function queryTwitter() {
  // Open headless browser to scrape followers
  isRunning = true;
  await setupTwitterBrowser();
  const twitterPage = await tBrowser.newPage();
  const followerUrl = `${user_account}/followers`;
  // Go to the follower page
  await twitterPage.goto(followerUrl, loadOpts).catch(() => console.log('Page loaded??'));
  if (!twitterPage) return;
  // Query necessary containers
  const followerContainer = await twitterPage.waitForSelector('[aria-label="Timeline: Followers"]').catch(console.error);
  if (followerContainer) console.log('Page confirmed loaded!');
  else return twitterPage.close();
  const heightDiv = await followerContainer.$('div');
  // Loop through list on page and scroll down when complete
  console.log('Beginning follower scraping...');
  // Wait for results to load...
  await followerContainer.waitForSelector(fSelector, { visible: true }).catch(console.error);
  await sleep(5000);
  let currFollowers = null;
  let newData = null;
  let newMinHeight = null;
  let minHeight = null;
  let retryCount = 0;
  followerLoop: do {
    if (!isRunning) break followerLoop;
    newMinHeight = await heightDiv.evaluate(el => Number(el.style.minHeight.replace('px', '')));
    // Check minheight change, which shows that the page has loaded new followers
    if (newMinHeight && minHeight !== newMinHeight) minHeight = newMinHeight;
    // Height didn't change? Retry 5 times to give it time to change
    else {
      console.log('Height not matching! Retrying...');
      if (retryCount < 3) {
        if (retryCount > 1) {
          await twitterPage.evaluate(() => {
            const div = document.querySelector('html');
            div.scrollTo({ top: div.scrollTop - 500, behavior: 'instant' });
            div.scrollTo({ top: div.scrollTop + 1000, behavior: 'instant' });
          });
        }
        retryCount++;
        console.log(`No new data? Retrying in: ${retryCount * 10} seconds`);
        await sleep(retryCount * 10 * 1000);
        continue;
      } else {
        break followerLoop;
      }
    }
    retryCount = 0;
    // Get all currently visible followers and add to database
    if (!isRunning) break followerLoop;
    let followersToAdd = [];
    currFollowers = await followerContainer.$$(fSelector);
    console.log(`Found ${currFollowers.length} followers!`);
    for (const el of currFollowers) {
      newData = await getDataFromElement(el);
      if (newData) {
        followersToAdd.push(newData);
      }
    }
    db.addEntries(followersToAdd);
    // Scroll down past last element
    if (!isRunning) break followerLoop;
    await currFollowers.pop().evaluate((e) => e.scrollIntoView({ behavior: 'instant', block: 'end' }));
    // Wait for page to refresh by checking that first div is gone
    // Slight wait to make sure things load
    // await sleep(1500);
    await twitterPage.waitForFunction(`!document.querySelector('${fSelector} a[href*="${followersToAdd[0].url}"]')`,
      { timeout: 5000 }).catch(() => console.log('Scroll timed out? Either reaching end, network hiccup, or rate limited.'));
    if (!isRunning) break followerLoop;
    // Check if rate limited
    let limited = null;
    let count = 0;
    do {
      if (!isRunning || count > 9) break followerLoop;
      limited = await followerContainer.$('button ::-p-text(Retry)').catch((e) => console.error(e));
      count++;
      // If retry button, wait before clicking
      if (limited) {
        console.log('Rate limited! Waiting before continuing...');
        // Doubles each attempt
        await sleep(count * 60 * 1000);
        limited.click();
        await sleep(10 * 1000);
      }
      if (!tBrowser?.connected) break followerLoop;
    } while(limited);
    // Get new minHeight for div
    newMinHeight = await heightDiv.evaluate(el => Number(el.style.minHeight.replace('px', '')));
    await sleep(5000 + getRandom(1000));
  } while (tBrowser?.connected && isRunning);
  console.log('Follower collection complete!');
  tBrowser?.close();
}

async function loadFollowers() {
  if (!user_account) return;
  // Load followers
  followers = followers?.length ? followers : await db.getEntries(user_account);
  const customFilters = filters.customFilters.split('\n')
    .filter(e => !!e.trim()).map(e => new RegExp(`\\b${e.trim()}\\b`, 'gi'));
  // Filter through them with given criteria
  const filteredFollowers = followers.filter((f) => {
    let matchFound = false;
    while(true) {
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
  await forceLogin();
  await tBrowser?.close();
}

async function userLogout() {
  await setupTwitterBrowser();
  const lPage = await tBrowser.newPage();
  await lPage.goto('https://www.x.com', { waitUntil: 'load' });
  await lPage.waitForSelector(accountMenuSel, { timeout: 5000});
  let btn = await lPage.locator(accountMenuSel).waitHandle();
  await btn.evaluate(h => h.click());
  let redirect = lPage.waitForSelector(profileSel, { timeout: 10000, hidden: true });
  btn = await lPage.locator('a[href*="logout"]').waitHandle();
  await btn.evaluate(h => h.click());
  btn = await lPage.locator('button ::-p-text(Log out)').waitHandle();
  await btn.evaluate(h => h.click());
  await redirect.catch(console.error);
  await tBrowser?.close();
  user_account = '';
  await page.reload();
}

async function init() {
  filters = await loadSettings();
  await setupUtils();
  await db.openDB();
  await setupBrowser();
  await checkLogin(true);
  await openSettings();
  console.log('Program loaded!');
}

await init();
