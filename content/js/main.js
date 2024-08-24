let filters = {};
let followers = [];
let container = null;
let consoleDiv = null;
// Pagination
const pageSize = 100;
let pageNum = 0;

async function init() {
  await loadSettings();
  // Check for a new version every hour
  setInterval(() => {
    window['get-version']().then(setVersion);
  }, 60 * 60 * 1000);
  // Warn user about closing browser
  window.onbeforeunload = (e) => {
    e.preventDefault();
    return 'CloseWarning';
  };
  // Setup console
  consoleDiv = document.querySelector('.console');
  // Setup click events
  document.querySelector('#save').addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.target.disabled = true;
    await saveFilters(e);
    e.target.disabled = false;
  });

  document.querySelector('#filter').addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.target.disabled = true;
    await saveFilters(e);
    await loadFollowers();
    e.target.disabled = false;
  });

  document.querySelector('#query').addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    const queryBtn = e.target.closest('#query');
    queryBtn.disabled = true;
    const countTimer = setInterval(() => {
      loadSettings().then(reset);
    }, 10000);
    document.querySelector('#stop-query').disabled = false;
    // Gather followers
    window['gather-followers']()
    .finally(() => {
      clearInterval(countTimer);
      queryBtn.disabled = false;
      setFollowerCount();
      document.querySelector('#stop-query').disabled = true;
    });
  });

  document.querySelector('#stop-query').addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.target.disabled = true;
    await window['stop-query']();
  });

  document.querySelectorAll('.previous, .next').forEach((el) => el.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    pageNum += (e.target.classList.contains('previous')) ? -1 : 1;
    displayFollowers();
  }));

  document.querySelector('#query-results').addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    const container = e.target.closest('a');
    if (btn || container) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (btn) {
      await window['remove-follower'](btn.dataset.href, btn.classList.contains('block'));
      followers = followers.filter(d => d.url !== url);
      displayFollowers();
    } else if (container) {
      await window['open-url'](container.href);
    }
  });
  document.querySelector('#export').addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.target.disabled = true;
    await window['export-to-csv']();
    e.target.disabled = false;
  });
  document.querySelector('.user-logout').addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    window['user-logout']().finally(async () => {
      await loadSettings();
      reset();
    });
  });
  document.querySelector('.user-login').addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    window['user-login']().finally(async () => {
      await loadSettings();
      reset();
    });
  });
  document.querySelector('#releases-link').addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    window['open-url'](e.target.href);
  });
  document.querySelector('#clear-db').addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const msg = `This action will delete all followers from the database! Are you sure?`;
    if (confirm(msg)) {
      window['clear-db']().then(() => alert('what')).finally(reset);
    }
  });
  reset();
}

async function setFollowerCount() {
  const followerCount = await window['get-follower-count']();
  const fCount = followerCount  ? followerCount.toLocaleString() : 0;
  const tCount = filters.totalFollowerCount ? filters.totalFollowerCount?.toLocaleString() : '???'
  document.querySelector('#follower-count').innerHTML = fCount;
  document.querySelector('#total-follower-count').innerHTML = tCount;
  document.querySelector('#filter').disabled = followerCount < 1;
  const progress = document.querySelector('#db-progress');
  progress.value = followerCount;
  progress.max = filters.totalFollowerCount;
  progress.nextElementSibling.innerHTML = Math.floor((followerCount/filters.totalFollowerCount) * 100) || 0;
}

async function saveFilters(e) {
  const form = e.target.form;
  const saveData = {};
  let el;
  for (let i = 0; i < form.elements.length; i++) {
    el = form.elements[i];
    if (e.target === el) continue;
    if (/(checkbox)|(radio)/i.test(el.type)) saveData[el.id] = el.checked;
    else if (/button/i.test(el.type)) continue;
    else saveData[el.id] = el.value.trim();
  }
  await window['save-settings'](saveData);
  filters = saveData;
  document.querySelector('#filter').click();
}

async function loadSettings() {
  filters = await window['load-settings']();
  // Fill out form data
  const form = document.querySelector('#setting-form');
  container = document.querySelector('#query-results');
  let el;
  for (const i in filters) {
    el = form.elements[i];
    if (!el) continue;
    if (/(checkbox)|(radio)/i.test(el.type)) el.checked = filters[i];
    else el.value = filters[i];
  }
  window['get-version']().then(setVersion);
  setUserAccount();
  reset();
}

function setVersion({ current, latest }) {
  const div = document.querySelector('#release-info');
  div.querySelector('.current').innerHTML = current;
  if (latest) {
    div.querySelector('.latest-container').classList.remove('hidden');
    const lDiv = div.querySelector('.latest');
    lDiv.innerHTML = latest;
    lDiv.classList.toggle('alert', current !== latest);
  } else div.querySelector('.latest-container').classList.add('hidden');
}

function setUserAccount() {
  const loggedin = !!filters.userAccount;
  document.querySelector('#userAccount').innerHTML = (filters.userAccount || '').toUpperCase();
  document.querySelector('.logged-in').style.display = loggedin ? 'block' : 'none';
  document.querySelector('.logged-out').style.display = loggedin ? 'none': 'block';
}

function followerTemplate(fData) {
 return `
  <a class="follower" href="${fData.url}" draggable="false">
    <div><img class="follower-icon" src="${fData.img}"/></div>
    <div class="follower-info">
      <div class="follower-username">${fData.username}</div>
      <div class="follower-account">${fData.account}</div>
      <div class="follower-bio">${fData.bio}</div>
    </div>
    <div class="follower-controls">
      <button class="remove" data-href="${fData.url}">Remove</button>
      <button class="block" data-href="${fData.url}">Block</button>
    </div>
  </a>
  `; 
}

async function loadFollowers() {
  reset();
  container.innerHTML= '<h3>Loading...</h3>';
  // Load data while waiting
  followers = await window['load-followers']();
  displayFollowers();
}

function displayFollowers() {
  const start = pageNum * pageSize;
  const end = pageNum * pageSize + pageSize;
  const divs = followers.slice(start, end).map((d) => followerTemplate(d));
  // Set pagination buttons
  setQueryButtons();
  container.innerHTML = divs.join('');
}

function setQueryButtons() {
  const previous = pageNum * pageSize === 0;
  const next = pageNum * pageSize + pageSize > followers.length;
  document.querySelectorAll('.previous').forEach(e => e.disabled = previous);
  document.querySelectorAll('.next').forEach(e => e.disabled = next);
  const querySize = document.querySelector('#query-size');
  querySize.innerHTML = `${followers.length.toLocaleString()} `;
  if (!followers.length) querySize.style.display = 'none';
  else querySize.style.display = 'inline';
  document.querySelector('#query').disabled = filters.isRunning === true;
}

function addToConsole(text) {
  if (!consoleDiv) return;
  const str = `<p>${text}</p>`;
  consoleDiv.innerHTML += str;
  consoleDiv.scrollTo({ top: -consoleDiv.scrollHeight });
}

function reset() {
  pageNum = 0;
  followers = [];
  setFollowerCount();
  setQueryButtons();
  container.innerHTML = '';
}

window.addEventListener('load', init);
