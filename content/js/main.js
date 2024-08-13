let filters = {};
let followers = [];
let container = null;
// Pagination
let pageNum = 0;
const pageSize = 100;

async function init() {
  filters = await window['load-settings']();
  setFollowerCount();
  // Fill out form data
  const form = document.querySelector('#setting-form');
  container = document.querySelector('#query-results');
  let el;
  for (const i in filters) {
    el = form.elements[i];
    if (/(checkbox)|(radio)/i.test(el.type)) el.checked = filters[i];
    else el.value = filters[i];
  }

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
    if (followers.length) displayFollowers();
    else await loadFollowers();
    e.target.disabled = false;
  });

  document.querySelector('#query').addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.target.disabled = true;
    const countTimer = setInterval(() => {
      setFollowerCount();
    }, 10000);
    document.querySelector('#stop-query').disabled = false;
    window['query-twitter']()
    .finally(() => {
      clearInterval(countTimer);
      e.target.disabled = false;
      setFollowerCount();
      document.querySelector('#stop-query').disabled = true;
    });

    document.querySelector('#stop-query').addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.target.disabled = true;
      await window['stop-query']();
    });
    reset();
  });

  document.querySelectorAll('.previous, .next').forEach((el) => el.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    pageNum += (e.target.classList.contains('previous')) ? -1 : 1;
    displayFollowers();
  }));

  document.querySelector('#query-results').addEventListener('click', async (e) => {
    if (!e.target.href) return;
    e.preventDefault();
    e.stopPropagation();
    await window['open-url'](e.target.href);
  });
  document.querySelector('#export').addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.target.disabled = true;
    await window['export-to-csv']();
    e.target.disabled = false;
  });
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
    else saveData[el.id] = el.value;
  }
  await window['save-settings'](saveData);
  filters = saveData;
}

function followerTemplate(fData) {
 return `
  <div class="follower">
    <img class="follower-icon" src="${fData.img}"/>
    <div class="follower-info">
      <div class="follower-username">${fData.username}</div>
      <div class="follower-account">${fData.account}</div>
      <div class="follower-bio">${fData.bio}</div>
    </div>
    <a class="follower-link" href="${fData.url}">Visit Page</a>
  </div>
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
}

function reset() {
  pageNum = 0;
  followers = [];
  setQueryButtons();
  container.innerHTML = '';
}

window.addEventListener('load', init);
