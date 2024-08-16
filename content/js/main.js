let filters = {};
let followers = [];
let container = null;
// Pagination
let pageNum = 0;
const pageSize = 100;

async function init() {
  await loadSettings();
  setFollowerCount();

  // Setup click events
  document.querySelector('#save').addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.target.disabled = true;
    await saveFilters(e);
    reset();
    e.target.disabled = false;
  });

  document.querySelector('#filter').addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.target.disabled = true;
    reset();
    await loadFollowers();
    e.target.disabled = false;
  });

  document.querySelector('#query').addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.target.disabled = true;
    const countTimer = setInterval(() => {
      setFollowerCount();
    }, 10000);
    window.onbeforeunload = (e) => {
      e.preventDefault();
      return 'showdialogplease';
    };
    document.querySelector('#stop-query').disabled = false;
    window['query-twitter']()
    .finally(() => {
      clearInterval(countTimer);
      e.target.disabled = false;
      setFollowerCount();
      window.onbeforeunload = null;
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
    e.preventDefault();
    e.stopPropagation();
    if (e.target.classList.contains('remove')) {
      // remove logic here
    } else if (e.target.closest('a'))
      await window['open-url'](e.target.closest('a').href);
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
    window['user-logout']().finally(() => {
      loadSettings();
      reset();
    });
  });
  document.querySelector('.user-login').addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    window['user-login']().finally(() => {
      loadSettings();
      reset();
    });
  });
  reset();
}

async function setFollowerCount() {
  const followerCount = await window['get-follower-count']();
  document.querySelector('#follower-count').innerHTML = followerCount;
  document.querySelector('#filter').disabled = followerCount < 1;
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
  setUserAccount();
}

function setUserAccount() {
  const loggedin = !!filters.user_account;
  document.querySelector('#user_account').innerHTML = (filters.user_account || '').toUpperCase();
  document.querySelector('.logged-in').style.display = loggedin ? 'block' : 'none';
  document.querySelector('.logged-out').style.display = loggedin ? 'none': 'block';
}

function followerTemplate(fData) {
 return `
  <a class="follower" href="${fData.url}">
    <div><img class="follower-icon" src="${fData.img}"/></div>
    <div class="follower-info">
      <div class="follower-username">${fData.username}</div>
      <div class="follower-account">${fData.account}</div>
      <div class="follower-bio">${fData.bio}</div>
    </div>
    <div class="follower-controls">
      <button class="remove" href="${fData.url}">Remove</button>
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
  querySize.innerHTML = `${followers.length} `;
  if (!followers.length) querySize.style.display = 'none';
  else querySize.style.display = 'inline';
}

function reset() {
  pageNum = 0;
  followers = [];
  setFollowerCount();
  setQueryButtons();
  container.innerHTML = '';
}

window.addEventListener('load', init);
