const $app = document.getElementById('app');
const SECTION_SIZE = 10;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDur = (s) => {
  s = Math.round(s || 0);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}min`;
  return sec ? `${sec}s` : '–';
};
const pct = (c) => (c.lessons.length ? Math.round((c.lessons.filter((l) => l.done).length / c.lessons.length) * 100) : 0);
const thumb = (id) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
const lessonThumb = (l) => (l.type === 'article' ? l.image || '' : thumb(l.id));

const I = {
  play: '<svg width="22" height="22" viewBox="0 0 24 24" fill="#1c1d1f"><path d="M8 5v14l11-7z"/></svg>',
  playSm: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10 9l5 3-5 3z" fill="currentColor"/></svg>',
  chev: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 9l6 6 6-6"/></svg>',
  x: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  check: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="4"><path d="M4 12l5 5 11-11"/></svg>',
  panel: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16"/></svg>',
  trash: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
  back: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>',
  pplay: '<svg width="22" height="22" viewBox="0 0 24 24" fill="#fff"><path d="M7 4.5v15l13-7.5z"/></svg>',
  ppause: '<svg width="22" height="22" viewBox="0 0 24 24" fill="#fff"><rect x="6" y="4.5" width="4.2" height="15" rx="1"/><rect x="13.8" y="4.5" width="4.2" height="15" rx="1"/></svg>',
  back10: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 109-9 9 9 0 00-6.4 2.6L3 8"/><path d="M3 3v5h5"/><text x="12" y="15.5" text-anchor="middle" font-size="7.5" fill="#fff" stroke="none" font-weight="700">10</text></svg>',
  fwd10: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 11-9-9 9 9 0 016.4 2.6L21 8"/><path d="M21 3v5h-5"/><text x="12" y="15.5" text-anchor="middle" font-size="7.5" fill="#fff" stroke="none" font-weight="700">10</text></svg>',
  vol: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9z" fill="#fff"/><path d="M16.5 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12"/></svg>',
  muted: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9z" fill="#fff"/><path d="M17 9l5 6M22 9l-5 6"/></svg>',
  full: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  refresh: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 00-14.5-4M4 4v4h4M4 13a8 8 0 0014.5 4M20 20v-4h-4"/></svg>',
  gear: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 01-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 010-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 014 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 010 4h-.1a1.7 1.7 0 00-1.5 1z"/></svg>',
  sun: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
  moon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 13A9 9 0 1111 3a7 7 0 0010 10z"/></svg>',
  dl: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7 11l5 5 5-5M5 20h14"/></svg>',
  dlok: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5l5 5L20 6.5"/></svg>',
  chap: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>',
  focus: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M3 8V5a2 2 0 012-2h3M16 3h3a2 2 0 012 2v3M21 16v3a2 2 0 01-2 2h-3M8 21H5a2 2 0 01-2-2v-3"/></svg>',
  note: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3h10l4 4v14H5z"/><path d="M9 11h6M9 15h4"/></svg>',
  timer: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9 2h6"/></svg>',
  cc: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M10.5 10.2a2.2 2.2 0 100 3.6M17 10.2a2.2 2.2 0 100 3.6"/></svg>',
  dub: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/></svg>',
  logo: '<svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z"/></svg>',
  book: '<svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#a435f0" stroke-width="1.5"><path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2zM4 19V5M9 8h6"/></svg>',
};

function toast(msg, err) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = 'toast' + (err ? ' err' : ''); t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), err ? 6000 : 3000);
}

// ---------- import ----------
let importing = false;
async function doImport(url) {
  if (importing) return;
  importing = true;
  const btn = document.getElementById('addBtn'), st = document.getElementById('status');
  if (btn) btn.disabled = true;
  if (st) st.textContent = 'Working…';
  const r = await api.importPlaylist(url);
  importing = false;
  if (r.ok) { openCourse(r.course.id); toast('Course ready: ' + r.course.title); }
  else { toast(r.error, true); if (st) st.textContent = r.error; if (btn) btn.disabled = false; }
}
api.onStatus((m) => { for (const id of ['status', 'mStatus']) { const st = document.getElementById(id); if (st) st.textContent = m; } });
api.onIncomingUrl((u) => { goHome().then(() => doImport(u)); });

// ---------- home ----------
async function goHome() {
  destroyPlayer();
  const courses = await api.list();
  const last = courses.find((c) => pct(c) < 100 && c.lessons.some((l) => l.done || l.pos));
  $app.innerHTML = `
  <div class="home">
    <div class="hero">
      <div class="herotop"><div class="logo"><img src="icon.svg" width="30" height="30" alt="" style="border-radius:8px">Playlearn</div><span class="herobtns"><button class="tb-btn" id="settingsBtn" title="Settings – export / import your data">${I.gear}</button><button class="tb-btn themeBtn" title="Dark / light mode">${themeIcon()}</button></span></div>
      <h1>Turn any YouTube playlist into a course.</h1>
      <p>Paste a playlist link. Get a Udemy-style classroom with sections, progress tracking and notes – saved on this computer.</p>
      <form class="add" id="addForm">
        <input id="url" placeholder="https://www.youtube.com/playlist?list=…" autocomplete="off" spellcheck="false" autofocus>
        <button class="btn" id="addBtn" type="submit">Create course</button>
      </form>
      <div class="status" id="status"></div>
      <button class="btn ghost light" id="newCustom" type="button">+ Custom course (videos &amp; articles)</button>
    </div>
    <div class="wrap">
      ${last ? `<h2>Continue learning</h2>
      <div class="cont" data-open="${esc(last.id)}">
        <div class="thumb" style="background-image:url(${esc(last.thumbnail)})"><div class="play"><b>${I.play}</b></div></div>
        <div style="flex:1"><h3>${esc(last.title)}</h3>
          <p>${last.lessons.filter((l) => l.done).length} of ${last.lessons.length} lessons complete</p>
          <div class="bar"><i style="width:${pct(last)}%"></i></div></div>
        <button class="btn">Resume</button>
      </div>` : ''}
      <div class="h2row"><h2>My courses</h2>${courses.some((c) => !c.custom) ? `<button class="btn ghost" id="refreshAll">${I.refresh} Refresh all</button>` : ''}</div>
      ${courses.length ? `<div class="grid">${courses.map(card).join('')}</div>` : `
      <div class="empty">${I.book}<h3>No courses yet</h3><p>Paste a playlist link above, or drag a link onto this window.</p></div>`}
    </div>
  </div>`;
  document.getElementById('newCustom').onclick = customModal;
  document.getElementById('settingsBtn').onclick = settingsModal;
  document.getElementById('addForm').onsubmit = (e) => { e.preventDefault(); doImport(document.getElementById('url').value); };
  $app.querySelectorAll('[data-open]').forEach((el) => (el.onclick = () => openCourse(el.dataset.open)));
  $app.querySelectorAll('[data-refresh]').forEach((el) => (el.onclick = async (e) => {
    e.stopPropagation(); el.classList.add('spin');
    const r = await api.refreshCourse(el.dataset.refresh);
    toast(r.ok ? refreshMsg(r) : 'Refresh failed: ' + r.error, !r.ok); goHome();
  }));
  { const ra = document.getElementById('refreshAll'); if (ra) ra.onclick = async () => {
    ra.disabled = true; let added = 0, failed = 0;
    const pls = courses.filter((c) => !c.custom);
    for (let k = 0; k < pls.length; k++) { ra.textContent = `Refreshing ${k + 1}/${pls.length}…`; const r = await api.refreshCourse(pls[k].id); if (r.ok) added += r.added; else failed++; }
    toast(`${added ? added + ' new lesson' + (added === 1 ? '' : 's') + ' found' : 'Everything is up to date'}${failed ? ` · ${failed} course(s) could not be checked` : ''}`, !!failed && !added); goHome();
  }; }
  $app.querySelectorAll('[data-del]').forEach((el) => (el.onclick = async (e) => {
    e.stopPropagation();
    if (el.dataset.confirm !== '1') { el.dataset.confirm = '1'; el.style.width = 'auto'; el.style.padding = '0 10px'; el.textContent = 'Click again to delete'; setTimeout(goHome, 2500); return; }
    await api.remove(el.dataset.del); goHome();
  }));
}
function card(c) {
  const total = c.lessons.reduce((a, l) => a + l.duration, 0), p = pct(c);
  return `<div class="card" data-open="${esc(c.id)}">
    <div class="thumb" style="background-image:url(${esc(c.thumbnail)})"><div class="play"><b>${I.play}</b></div></div>
    <button class="del" data-del="${esc(c.id)}" title="Delete course">${I.trash}</button>
    ${c.custom ? '' : `<button class="del refr" data-refresh="${esc(c.id)}" title="Check the playlist for new videos">${I.refresh}</button>`}
    <div class="card-body"><h3>${esc(c.title)}</h3><small>${c.custom ? 'Custom course' : esc(c.channel)}</small>
      <div class="meta"><span>${c.lessons.length} lessons · ${fmtDur(total)}</span><span>${p}%</span></div>
      <div class="bar"><i style="width:${p}%"></i></div></div></div>`;
}
// drag & drop a link anywhere
window.addEventListener('dragover', (e) => { e.preventDefault(); document.body.classList.add('drop-over'); });
window.addEventListener('dragleave', (e) => { if (!e.relatedTarget) document.body.classList.remove('drop-over'); });
window.addEventListener('drop', (e) => {
  e.preventDefault(); document.body.classList.remove('drop-over');
  const t = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
  if (!t) return;
  if (C && C.custom && document.querySelector('.course') && !document.getElementById('modal')) { addLinks(t); return; }
  goHome().then(() => doImport(t.trim()));
});

// ---------- course ----------
let C = null, cur = 0, uiTick = null, player = null, saveTimer = null, tick = null, autoNext = true, tab = 'overview', sideOpen = true;
const openSecs = new Set();

function destroyPlayer() {
  clearInterval(tick); tick = null; clearInterval(uiTick); uiTick = null;
  if (player && player.destroy) { try { player.destroy(); } catch {} }
  player = null;
  flushSave();
}
function flushSave() { if (C && saveTimer) { clearTimeout(saveTimer); saveTimer = null; api.save(C); } }
function queueSave() { clearTimeout(saveTimer); saveTimer = setTimeout(() => { saveTimer = null; api.save(C); }, 400); }

async function openCourse(id) {
  destroyPlayer();
  C = await api.get(id);
  C.lastOpened = Date.now();
  await loadDl();
  query = '';
  cur = Math.max(0, C.lessons.findIndex((l) => l.id === C.lastLesson));
  openSecs.clear(); openSecs.add(Math.floor(cur / SECTION_SIZE));
  tab = 'overview';
  renderCourse();
  queueSave();
  if (!C.custom && (!C.refreshedAt || Date.now() - C.refreshedAt > 864e5)) refreshNow(true);
}

function ringSvg(p) {
  const r = 16, c = 2 * Math.PI * r;
  return `<svg class="ring" viewBox="0 0 40 40"><circle cx="20" cy="20" r="${r}" fill="none" stroke="#6a6f73" stroke-width="3"/>
  <circle cx="20" cy="20" r="${r}" fill="none" stroke="#c0c4fc" stroke-width="3" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - p / 100)}" transform="rotate(-90 20 20)"/>
  <text x="20" y="24" text-anchor="middle" font-size="11" fill="#fff" font-weight="700">${p}</text></svg>`;
}

function renderCourse() {
  const L = C.lessons[cur], isArt = L.type === 'article';
  $app.innerHTML = `
  <div class="course ${focusMode ? 'focus' : ''}">
    <div class="topbar">
      <button class="back" id="back" title="Back to home (Esc)">${I.back} Back</button>
      <div class="logo" id="goHome" title="Home"><img src="icon.svg" width="28" height="28" alt="" style="border-radius:7px">Playlearn</div>
      <div class="sep"></div>
      <div class="ctitle">${esc(C.title)}</div>
      <div class="prog" id="prog">${ringSvg(pct(C))}<span>${C.lessons.filter((l) => l.done).length}/${C.lessons.length} done</span></div>
      <button class="tb-btn themeBtn" title="Dark / light mode">${themeIcon()}</button>
      <div class="timerwrap"><button class="tb-btn" id="timerBtn" title="Study timer">${I.timer}<span id="timerTxt">Timer</span></button><div class="pop" id="timerPop" hidden></div></div>
      <button class="tb-btn" id="toggleSide" title="Course content">${I.panel}</button>
    </div>
    <div class="main">
      <div class="left ${isArt ? 'article' : ''}">
        ${isArt ? '<div class="lesson-bar-slot"></div>' : `<div class="player idle0" id="playerBox">
          <div id="yt"></div>
          <div class="shield" id="shield"></div>
          <div class="bigplay" id="bigplay"></div>
          <div class="tchip" id="tchip" hidden></div>
          <div class="endcard" id="endcard" hidden></div>
          <div class="qnote" id="qnote" hidden></div>
          <div class="controls" id="controls">
            <div class="seekwrap" id="seekwrap"><div class="ticks" id="ticks"></div><input type="range" class="seek" id="seek" min="0" max="1000" value="0" step="1"><div class="seektip" id="seektip" hidden></div></div>
            <div class="crow">
              <button class="cb2" id="pp" title="Play/Pause (Space)"></button>
              <button class="cb2" id="back10" title="Back 10s (J)">${I.back10}</button>
              <button class="cb2" id="fwd10" title="Forward 10s (L)">${I.fwd10}</button>
              <button class="cb2" id="mute" title="Mute (M)"></button>
              <input type="range" class="vol" id="vol" min="0" max="100" value="100">
              <span class="time"><span id="tcur">0:00</span> / <span id="tdur">0:00</span><span class="chname" id="chName"></span></span>
              <span class="grow"></span>
              <div class="speedwrap" id="chWrap" hidden><button class="cb2" id="chBtn" title="Chapters ( [ and ] )">${I.chap}</button><div class="menu chmenu" id="chMenu" hidden></div></div>
              <button class="cb2" id="noteBtn" title="Add note at this moment (N)">${I.note}</button>
              <div class="speedwrap"><button class="cb2" id="ccBtn" title="Captions (C)">${I.cc}</button><div class="menu" id="ccMenu" hidden></div></div>
              <div class="speedwrap"><button class="cb2" id="dubBtn" title="Audio / auto-dubbed">${I.dub}</button><div class="menu" id="dubMenu" hidden></div></div>
              <div class="speedwrap"><button class="cb2 txt" id="speed" title="Speed (&lt; &gt;)">1x</button><div class="menu" id="speedMenu" hidden></div></div>
              <button class="cb2" id="focusBtn" title="Focus mode (Z)">${I.focus}</button>
              <button class="cb2" id="fs" title="Fullscreen (F)">${I.full}</button>
            </div>
          </div>
        </div>`}
        <div class="lesson-bar">
          <span class="t">${cur + 1}. ${esc(L.title)}</span>${offBadge(L.id)}
          ${isArt ? '' : `<label class="switch"><input type="checkbox" id="auto" ${autoNext ? 'checked' : ''}> Autoplay next</label>`}
          <button id="prev" ${cur === 0 ? 'disabled' : ''}>‹ Prev</button>
          <button id="next" ${cur === C.lessons.length - 1 ? 'disabled' : ''}>Next ›</button>
        </div>
        ${isArt ? '<div class="reader" id="reader"></div>' : `<div class="tabs">
          <button class="tab ${tab === 'overview' ? 'on' : ''}" data-tab="overview">Overview</button>
          <button class="tab ${tab === 'notes' ? 'on' : ''}" data-tab="notes">Notes</button>
        </div>
        <div class="pane" id="pane"></div>`}
      </div>
      <aside class="side ${sideOpen ? '' : 'closed'}" id="side">
        <div class="side-h"><b>Course content</b>${C.custom ? `<button class="addv" id="addVideos" title="Add videos, playlists or articles to this course">+ Add</button>` : ''}<button class="x" id="closeSide" title="Close">${I.x}</button></div>
        <div class="searchbar"><input id="lsearch" type="search" placeholder="Search lessons, notes, chapters   ( / )" autocomplete="off" value="${esc(query)}"></div>
        <div class="list" id="list"></div>
      </aside>
    </div>
  </div>`;
  document.getElementById('goHome').onclick = goHome;
  document.getElementById('back').onclick = goHome;
  document.getElementById('toggleSide').onclick = () => { sideOpen = !sideOpen; document.getElementById('side').classList.toggle('closed', !sideOpen); };
  { const av = document.getElementById('addVideos'); if (av) av.onclick = addModal; }
  document.getElementById('closeSide').onclick = () => { sideOpen = false; document.getElementById('side').classList.add('closed'); };
  { const au = document.getElementById('auto'); if (au) au.onchange = (e) => (autoNext = e.target.checked); }
  document.getElementById('prev').onclick = () => select(cur - 1);
  document.getElementById('next').onclick = () => select(cur + 1);
  $app.querySelectorAll('.tab').forEach((b) => (b.onclick = () => { saveNotes(); tab = b.dataset.tab; $app.querySelectorAll('.tab').forEach((x) => x.classList.toggle('on', x === b)); renderPane(); }));
  { const si = document.getElementById('lsearch'); si.oninput = () => { query = si.value; renderList(); }; si.onkeydown = (e) => { if (e.key === 'Escape') { e.stopPropagation(); si.value = ''; query = ''; renderList(); si.blur(); } }; }
  renderList(); renderPane(); wireTimer();
  if (isArt) renderReader(L); else mountPlayer();
}

function renderPane() {
  const pane = document.getElementById('pane'), L = C.lessons[cur];
  if (!pane) return; // article lessons use the reader instead
  if (tab === 'notes') {
    renderNotesPane(pane, L);
  } else {
    const total = C.lessons.reduce((a, l) => a + l.duration, 0);
    const left = C.lessons.filter((l) => !l.done).reduce((a, l) => a + l.duration, 0);
    pane.innerHTML = `${C.custom ? `<input class="cname" id="cname" value="${esc(C.title)}" maxlength="120" title="Rename course" spellcheck="false">` : `<h2>${esc(C.title)}</h2>`}
      <p>${C.custom ? 'Custom course – built from videos you picked' : esc(C.channel ? 'By ' + C.channel : '')}</p>
      <div class="stats">
        <div><b>${C.lessons.length}</b><span>Lessons</span></div>
        <div><b>${fmtDur(total)}</b><span>Total length</span></div>
        <div><b>${fmtDur(left)}</b><span>Left to watch</span></div>
        <div><b>${pct(C)}%</b><span>Complete</span></div>
      </div>
      <div id="dlbox"></div>
      ${C.custom ? `<div class="nrow" style="margin-top:22px"><button class="btn" id="addBtn2">+ Add videos or articles</button></div>
      <div class="hint">Paste video links from any channel, a whole playlist, or an article / blog post link and it joins the end of this course (articles open as a clean note page you can highlight, comment on and edit). Hover a lesson in the list to reorder or remove it. You can also drop a link onto this window.</div>` : `
      <div class="nrow" style="margin-top:22px"><button class="btn ghost" id="refreshBtn">${I.refresh} Refresh playlist</button><button class="btn ghost" id="syncBtn">Source playlist ↗</button></div>
      <div class="hint">${C.refreshedAt ? 'Last checked ' + ago(C.refreshedAt) + '.' : 'Not checked yet.'} New videos are picked up automatically when you open the course (at most once a day).</div>`}`;
    if (C.custom) {
      document.getElementById('addBtn2').onclick = addModal;
      const cn = document.getElementById('cname');
      cn.onchange = () => { C.title = cn.value.trim() || C.title; cn.value = C.title; const t = document.querySelector('.ctitle'); if (t) t.textContent = C.title; queueSave(); };
      cn.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') cn.blur(); };
    } else {
      document.getElementById('syncBtn').onclick = () => api.openExternal(C.url);
      document.getElementById('refreshBtn').onclick = () => refreshNow(false);
    }
    renderDlBox();
  }
}
function saveNotes() { const ta = document.getElementById('notes'); if (ta) { C.lessons[cur].notes = ta.value; queueSave(); } }

let query = '', pendingSeek = null;
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const qWords = () => query.toLowerCase().split(/\s+/).filter(Boolean);
function hl(text, ws) {
  const s = esc(text); if (!ws || !ws.length) return s;
  return s.replace(new RegExp('(' + ws.map((w) => escRe(esc(w))).join('|') + ')', 'gi'), '<mark>$1</mark>');
}
function matchLesson(l, ws) {
  const hit = (s) => !!s && ws.every((w) => s.toLowerCase().includes(w));
  if (hit(l.title)) return { kind: 'title' };
  if (hit(l.notes)) { const n = l.notes, k = Math.max(0, n.toLowerCase().indexOf(ws[0]) - 30); return { kind: 'note', text: (k ? '…' : '') + n.slice(k, k + 90) }; }
  for (const m of l.marks || []) if (hit(m.text)) return { kind: 'mark', t: m.t, text: m.text };
  for (const c of l.chapters || []) if (hit(c.title)) return { kind: 'chapter', t: c.t, text: c.title };
  if (l.blocks) for (let k = 0; k < l.blocks.length; k++) { const b = l.blocks[k]; if (!b.x && (hit(b.t) || hit(b.c))) { const tx = hit(b.t) ? b.t : b.c, at = Math.max(0, tx.toLowerCase().indexOf(ws[0]) - 30); return { kind: 'text', b: k, text: (at ? '…' : '') + tx.slice(at, at + 90) }; } }
  return null;
}
function itemHtml(l, i, m, ws) {
  const label = m && m.kind !== 'title' ? ({ note: 'Notes', mark: 'Note', chapter: 'Chapter', text: 'Article' }[m.kind]) : '';
  return `<div class="item ${i === cur ? 'on' : ''}" data-i="${i}" ${m && m.t != null ? `data-t="${m.t}"` : ''} ${m && m.b != null ? `data-b="${m.b}"` : ''}>
    <div class="cb ${l.done ? 'done' : ''}" data-cb="${i}">${l.done ? I.check : ''}</div>
    <div><div class="t">${i + 1}. ${hl(l.title, ws)}${l.gone ? ' <span class="gonebadge" title="This video is no longer in the playlist">removed</span>' : isNew(l) ? ' <span class="newbadge">New</span>' : ''}</div>
    ${label ? `<div class="snip">${label}${m.t != null ? ' · ' + fmtT(m.t) : ''}: ${hl(m.text, ws)}</div>` : ''}
    <div class="d">${l.type === 'article' ? I_DOC : I.playSm}${fmtDur(l.duration)}${l.type === 'article' ? ' read' : ''}${C.custom && l.channel ? `<span class="chn" title="${esc(l.channel)}">· ${esc(l.channel)}</span>` : ''}${l.type === 'article' ? '' : `<button class="dlb ${dlCls(l.id)}" data-dl="${l.id}" title="Download for offline">${dlIcon(l.id)}</button>`}${C.custom ? `<span class="ctl"><button data-mv="${i}" data-d="-1" title="Move up">↑</button><button data-mv="${i}" data-d="1" title="Move down">↓</button><button data-rm="${i}" title="Remove from course">✕</button></span>` : ''}</div></div></div>`;
}
function renderList() {
  const list = document.getElementById('list');
  const ws = qWords();
  let html = '';
  if (ws.length) {
    const res = [];
    C.lessons.forEach((l, i) => { const m = matchLesson(l, ws); if (m) res.push(itemHtml(l, i, m, ws)); });
    html = res.length ? `<div class="results-h">${res.length} result${res.length === 1 ? '' : 's'}</div>${res.join('')}` : `<div class="nores">No lessons, notes or chapters match “${esc(query)}”.</div>`;
  } else {
    const n = Math.ceil(C.lessons.length / SECTION_SIZE);
    for (let s = 0; s < n; s++) {
      const a = s * SECTION_SIZE, items = C.lessons.slice(a, a + SECTION_SIZE);
      const done = items.filter((l) => l.done).length, dur = items.reduce((x, l) => x + l.duration, 0);
      html += `<div class="sec ${openSecs.has(s) ? 'open' : ''}" data-s="${s}">
      <button class="sec-h"><div><b>Section ${s + 1}: Lessons ${a + 1}–${a + items.length}</b><small>${done} / ${items.length} | ${fmtDur(dur)}</small></div>${I.chev}</button>
      <div class="items">${items.map((l, k) => itemHtml(l, a + k, null, null)).join('')}</div></div>`;
    }
  }
  const st = list.scrollTop;
  list.innerHTML = html;
  list.scrollTop = st;
  list.querySelectorAll('.sec-h').forEach((b) => (b.onclick = () => {
    const s = +b.parentElement.dataset.s; openSecs.has(s) ? openSecs.delete(s) : openSecs.add(s); b.parentElement.classList.toggle('open');
  }));
  list.querySelectorAll('.item').forEach((el) => (el.onclick = () => {
    const i = +el.dataset.i, t = el.dataset.t === undefined ? null : +el.dataset.t;
    if (el.dataset.b !== undefined) {
      pendingBlock = { id: C.lessons[i].id, b: +el.dataset.b };
      if (i === cur) { renderReader(C.lessons[cur]); return; }
      select(i); return;
    }
    if (t !== null && i === cur && player) { player.seekTo(t, true); return; }
    if (t !== null) pendingSeek = { id: C.lessons[i].id, t };
    select(i);
  }));
  list.querySelectorAll('[data-dl]').forEach((el) => (el.onclick = (e) => { e.stopPropagation(); onDlClick(el.dataset.dl, el); }));
  list.querySelectorAll('[data-mv]').forEach((el) => (el.onclick = (e) => { e.stopPropagation(); moveLesson(+el.dataset.mv, +el.dataset.d); }));
  list.querySelectorAll('[data-rm]').forEach((el) => (el.onclick = (e) => { e.stopPropagation(); removeLesson(+el.dataset.rm, el); }));
  list.querySelectorAll('[data-cb]').forEach((el) => (el.onclick = (e) => { e.stopPropagation(); setDone(+el.dataset.cb, !C.lessons[+el.dataset.cb].done); }));
}

function refreshProgress() {
  const p = document.getElementById('prog');
  if (p) p.innerHTML = `${ringSvg(pct(C))}<span>${C.lessons.filter((l) => l.done).length}/${C.lessons.length} done</span>`;
  renderList();
  if (tab === 'overview') renderPane();
}
function setDone(i, v) { C.lessons[i].done = v; queueSave(); refreshProgress(); }

function select(i) {
  if (i < 0 || i >= C.lessons.length) return;
  saveNotes(); persistPos();
  cur = i; C.lastLesson = C.lessons[i].id; openSecs.add(Math.floor(i / SECTION_SIZE));
  queueSave();
  renderCourse();
}

// ---------- player ----------
function persistPos() {
  try {
    if (player && player.getCurrentTime) {
      const L = C.lessons[cur], t = Math.floor(player.getCurrentTime());
      if (t > 0) L.pos = t;
    }
  } catch {}
}
const PS = { ENDED: 0, PLAYING: 1, PAUSED: 2, BUFFERING: 3 };
let localMode = false;
function mountPlayer() {
  const L = C.lessons[cur];
  const handlers = {
    onReady: () => wireControls(),
    onStateChange: (e) => {
      if (e.data === PS.PLAYING) applyPrefsOnce();
      setPlayingUI(e.data === PS.PLAYING || e.data === PS.BUFFERING);
      showEnd(e.data === PS.ENDED);
      if (e.data === PS.PLAYING) {
        clearInterval(tick);
        tick = setInterval(() => {
          persistPos();
          try { // auto-complete at 92%
            const d = player.getDuration(), t = player.getCurrentTime();
            if (!L.done && d > 30 && t / d > 0.92) setDone(cur, true);
          } catch {}
          queueSave();
        }, 4000);
      } else clearInterval(tick);
      if (e.data === PS.ENDED) {
        L.pos = 0;
        if (!L.done) setDone(cur, true);
        if (autoNext && cur < C.lessons.length - 1) select(cur + 1);
      }
    },
    onError: () => toast('This video cannot be played in the embedded player (embedding may be disabled by its owner). Download it for offline playback, or try the next lesson.', true),
  };
  const off = DL[L.id];
  localMode = !!(off && off.state === 'done');
  const startAt = pendingSeek && pendingSeek.id === L.id ? pendingSeek.t : L.done ? 0 : L.pos || 0;
  pendingSeek = null;
  loadChapters(L);
  if (localMode) return makeLocalPlayer(L, off, handlers, startAt);
  const make = () => {
    player = new YT.Player('yt', {
      videoId: L.id, width: '100%', height: '100%',
      playerVars: { rel: 0, modestbranding: 1, autoplay: 1, controls: 0, disablekb: 1, fs: 0, iv_load_policy: 3, playsinline: 1, start: startAt, enablejsapi: 1, origin: location.origin },
      events: handlers,
    });
  };
  if (window.YT && YT.Player) make();
  else {
    window.onYouTubeIframeAPIReady = make;
    setTimeout(() => { if (!player) toast('Cannot reach YouTube. Download lessons for offline use (the arrow next to a lesson).', true); }, 7000);
  }
}

// Local <video> player exposing the same methods as the YouTube player, so every control works offline.
function makeLocalPlayer(L, off, handlers, startAt) {
  const host = $('yt'); host.innerHTML = '';
  const v = document.createElement('video');
  v.src = `/media/${encodeURIComponent(C.id)}/${encodeURIComponent(L.id)}.${off.ext}`;
  v.preload = 'auto'; v.playsInline = true; v.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;background:#000';
  if (off.sub) { const t = document.createElement('track'); t.kind = 'captions'; t.srclang = 'en'; t.label = 'English'; t.src = `/media/${encodeURIComponent(C.id)}/${encodeURIComponent(off.sub)}`; v.appendChild(t); }
  host.appendChild(v);
  let state = -1;
  const emit = (s) => { state = s; handlers.onStateChange({ data: s }); };
  v.addEventListener('playing', () => emit(PS.PLAYING));
  v.addEventListener('pause', () => { if (!v.ended) emit(PS.PAUSED); });
  v.addEventListener('ended', () => emit(PS.ENDED));
  v.addEventListener('waiting', () => emit(PS.BUFFERING));
  v.addEventListener('error', () => { toast('Could not play the downloaded file. Remove the download and stream it instead.', true); });
  v.addEventListener('loadedmetadata', () => { const s = startAt || 0; if (s > 0 && s < v.duration - 5) v.currentTime = s; v.play().catch(() => {}); });
  player = {
    _video: v, isLocal: true,
    getPlayerState: () => state, playVideo: () => v.play().catch(() => {}), pauseVideo: () => v.pause(),
    getCurrentTime: () => v.currentTime || 0, getDuration: () => (isFinite(v.duration) ? v.duration : 0), seekTo: (t) => { v.currentTime = t; },
    setVolume: (x) => { v.volume = Math.max(0, Math.min(1, x / 100)); }, getVolume: () => Math.round(v.volume * 100),
    mute: () => { v.muted = true; }, unMute: () => { v.muted = false; }, isMuted: () => v.muted,
    setPlaybackRate: (r) => { v.playbackRate = r; }, getPlaybackRate: () => v.playbackRate,
    getAvailablePlaybackRates: () => [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3],
    getVideoLoadedFraction: () => (v.duration && v.buffered.length ? v.buffered.end(v.buffered.length - 1) / v.duration : 0),
    destroy: () => { try { v.pause(); v.removeAttribute('src'); v.load(); } catch {} },
  };
  handlers.onReady();
}

window.addEventListener('beforeunload', () => { persistPos(); flushSave(); });

// ---------- custom controls ----------
const fmtT = (t) => { t = Math.max(0, Math.floor(t || 0)); const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), x = t % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };
const LS = { get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
let isPlaying = false, dragging = false, idleT = null;
const $ = (id) => document.getElementById(id);

function setPlayingUI(p) {
  isPlaying = p;
  const b = $('pp'); if (b) b.innerHTML = p ? I.ppause : I.pplay;
  bumpControls();
}
function togglePlay() { if (!player || !player.getPlayerState) return; isPlaying ? player.pauseVideo() : player.playVideo(); flash(); }
function flash() { const b = $('bigplay'); if (!b) return; b.innerHTML = isPlaying ? I.ppause : I.pplay; b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); }
function seekBy(d) { if (!player) return; const t = Math.max(0, Math.min(player.getDuration() || 1e9, player.getCurrentTime() + d)); player.seekTo(t, true); }
function setVolume(v) { v = Math.max(0, Math.min(100, v)); player.setVolume(v); v > 0 ? player.unMute() : player.mute(); LS.set('vol', v); syncVol(); }
function toggleMute() { player.isMuted() ? (player.unMute(), player.getVolume() === 0 && player.setVolume(50)) : player.mute(); syncVol(); }
function syncVol() { const m = player.isMuted() || player.getVolume() === 0; $('mute').innerHTML = m ? I.muted : I.vol; $('vol').value = m ? 0 : player.getVolume(); }
function setSpeed(r) { player.setPlaybackRate(r); LS.set('rate', r); $('speed').textContent = r + 'x'; }
function stepSpeed(dir) { const rs = player.getAvailablePlaybackRates(), i = rs.indexOf(player.getPlaybackRate()); const n = rs[Math.max(0, Math.min(rs.length - 1, i + dir))]; setSpeed(n); }
function toggleFs() { const el = $('playerBox'); document.fullscreenElement ? document.exitFullscreen() : el.requestFullscreen(); }
function bumpControls() {
  const box = $('playerBox'); if (!box) return;
  box.classList.remove('idle'); clearTimeout(idleT);
  if (isPlaying) idleT = setTimeout(() => { closeMenus(); box.classList.add('idle'); }, 2500);
}

function wireControls() {
  $('pp').onclick = togglePlay; $('shield').onclick = togglePlay; $('shield').ondblclick = toggleFs;
  $('back10').onclick = () => seekBy(-10); $('fwd10').onclick = () => seekBy(10);
  $('mute').onclick = toggleMute; $('vol').oninput = (e) => setVolume(+e.target.value);
  $('fs').onclick = toggleFs;
  $('focusBtn').onclick = toggleFocus; $('noteBtn').onclick = () => quickNote();
  $('speed').onclick = () => {
    const m = $('speedMenu');
    m.innerHTML = player.getAvailablePlaybackRates().map((r) => `<button data-r="${r}" class="${r === player.getPlaybackRate() ? 'on' : ''}">${r}x</button>`).join('');
    m.querySelectorAll('button').forEach((b) => (b.onclick = () => { setSpeed(+b.dataset.r); m.hidden = true; }));
    m.hidden = !m.hidden;
  };
  $('ccBtn').onclick = () => openCcMenu();
  $('dubBtn').onclick = () => openDubMenu();
  $('chBtn').onclick = () => openChMenu();
  { const sw = $('seekwrap'), tip = $('seektip');
    sw.onmousemove = (e) => {
      const r = sw.getBoundingClientRect(), d = player.getDuration() || 0;
      const f = Math.max(0, Math.min(1, (e.clientX - r.left - 7) / (r.width - 14))), ch = chAt(f * d);
      tip.textContent = fmtT(f * d) + (ch ? ' · ' + ch.title : '');
      tip.style.left = Math.max(70, Math.min(r.width - 70, e.clientX - r.left)) + 'px'; tip.hidden = false;
    };
    sw.onmouseleave = () => { tip.hidden = true; }; }
  const seek = $('seek');
  seek.oninput = () => { dragging = true; $('tcur').textContent = fmtT((seek.value / 1000) * player.getDuration()); };
  seek.onchange = () => { player.seekTo((seek.value / 1000) * player.getDuration(), true); dragging = false; };
  const box = $('playerBox');
  box.onmousemove = bumpControls; box.onmouseleave = () => isPlaying && box.classList.add('idle');
  // restore prefs
  player.setVolume(LS.get('vol', 100)); player.setPlaybackRate(LS.get('rate', 1)); $('speed').textContent = player.getPlaybackRate() + 'x';
  syncVol(); setPlayingUI(isPlaying);
  clearInterval(uiTick);
  uiTick = setInterval(() => {
    if (!player || !player.getDuration) return;
    const d = player.getDuration() || 0, t = player.getCurrentTime() || 0;
    $('tcur') && ($('tcur').textContent = fmtT(t)); $('tdur') && ($('tdur').textContent = fmtT(d));
    { const ch = chAt(t), cn = $('chName'); if (cn) cn.textContent = ch ? '• ' + ch.title : ''; renderTicks(); }
    if (!dragging && d) {
      seek.value = (t / d) * 1000;
      const f = (player.getVideoLoadedFraction() || 0) * 100;
      seek.style.setProperty('--p', (t / d) * 100 + '%'); seek.style.setProperty('--b', f + '%');
    }
  }, 250);
}

// ----- captions & audio (dubbed) -----
// prefs: cc = {on, lang}   audio = {name|null}  (null => original)
const closeMenus = () => ['speedMenu', 'ccMenu', 'dubMenu', 'chMenu'].forEach((m) => $(m) && ($(m).hidden = true));
function toggleMenu(id, html, bind) {
  const m = $(id), wasHidden = m.hidden; closeMenus();
  if (!wasHidden) return;
  m.innerHTML = html; m.hidden = false; bind(m);
}
async function openCcMenu() {
  const d = await pOp('ccList');
  const pref = LS.get('cc', { on: false, lang: null });
  let html = `<button data-c="" class="${!d || !d.cur ? 'on' : ''}">Off</button>`;
  if (!d || !d.tracks.length) html += `<button disabled style="opacity:.6">No captions available</button>`;
  else html += d.tracks.map((t) => `<button data-c="${esc(t.code)}" class="${d.cur === t.code ? 'on' : ''}">${esc(t.name)}</button>`).join('');
  toggleMenu('ccMenu', html, (m) => m.querySelectorAll('button[data-c]').forEach((b) => (b.onclick = async () => {
    const code = b.dataset.c;
    if (code) { await pOp('ccSet', code); LS.set('cc', { on: true, lang: code }); } else { await pOp('ccOff'); LS.set('cc', { on: false, lang: pref.lang }); }
    closeMenus(); markCc();
  })));
}
async function toggleCaptions() {
  const pref = LS.get('cc', { on: false, lang: null });
  if (pref.on) { await pOp('ccOff'); LS.set('cc', { on: false, lang: pref.lang }); }
  else { await applyCaptions(true); }
  markCc();
}
function markCc() { const b = $('ccBtn'); if (b) b.classList.toggle('active', LS.get('cc', { on: false }).on); }
async function applyCaptions(force) {
  const pref = LS.get('cc', { on: false, lang: null });
  if (!pref.on && !force) return true;
  const d = await pOp('ccList');
  if (!d || !d.tracks.length) return false;
  const pick = d.tracks.find((t) => t.code === pref.lang) || d.tracks.find((t) => /^en/.test(t.code)) || d.tracks[0];
  await pOp('ccSet', pick.code); LS.set('cc', { on: true, lang: pick.code });
  return true;
}
async function openDubMenu() {
  const d = await pOp('audioList');
  const pref = LS.get('audio', { name: null });
  let html;
  if (!d || d.tracks.length < 2) html = `<button disabled style="opacity:.6">No other audio tracks for this video</button>`;
  else html = d.tracks.map((t) => `<button data-a="${t.i}" class="${d.cur === t.i ? 'on' : ''}">${esc(t.name)}${t.dubbed ? ' <small style="opacity:.7">· auto-dubbed</small>' : ''}</button>`).join('');
  toggleMenu('dubMenu', html, (m) => m.querySelectorAll('button[data-a]').forEach((b) => (b.onclick = async () => {
    const t = d.tracks[+b.dataset.a];
    await pOp('audioSet', t.i);
    LS.set('audio', { name: t.dubbed ? t.name : null }); // original => no preference
    closeMenus(); markDub(t.dubbed);
    toast(t.dubbed ? 'Audio: ' + t.name + ' (auto-dubbed) – used for all lessons when available' : 'Audio: original');
  })));
}
function markDub(on) { const b = $('dubBtn'); if (b) b.classList.toggle('active', !!on); }
async function applyAudio() {
  const pref = LS.get('audio', { name: null });
  if (!pref.name) return true;
  const d = await pOp('audioList');
  if (!d || !d.tracks.length) return false;
  const t = d.tracks.find((x) => x.name === pref.name);
  if (t && d.cur !== t.i) await pOp('audioSet', t.i);
  markDub(!!t);
  return true;
}
// apply saved prefs once per lesson, retrying while the player finishes loading
let prefsFor = null;
async function applyPrefsOnce() {
  const key = C.lessons[cur].id; if (prefsFor === key) return; prefsFor = key;
  for (let n = 0; n < 12 && prefsFor === key; n++) {
    const a = await applyAudio(), c = await applyCaptions(false);
    if (a && c) break;
    await new Promise((r) => setTimeout(r, 1200));
  }
  markCc();
}

// keyboard
window.addEventListener('keydown', (e) => {
  if (!C || !document.querySelector('.course') || /INPUT|TEXTAREA/.test(document.activeElement.tagName) && document.activeElement.type !== 'range') return;
  if (document.activeElement.type === 'range') document.activeElement.blur();
  const k = e.key;
  if (e.shiftKey && k === 'N') return select(cur + 1);
  if (e.shiftKey && k === 'P') return select(cur - 1);
  if (e.altKey && k === 'ArrowLeft') return goHome();
  if (k === 'Escape' && !document.fullscreenElement) return focusMode ? toggleFocus() : goHome();
  if (k === '/' || (e.ctrlKey && k.toLowerCase() === 'f')) { e.preventDefault(); sideOpen = true; $('side').classList.remove('closed'); if (focusMode) toggleFocus(); const si = $('lsearch'); if (si) si.focus(); return; }
  if (!player || !player.getPlayerState) return;
  const map = { ' ': togglePlay, k: togglePlay, j: () => seekBy(-10), l: () => seekBy(10), ArrowLeft: () => seekBy(-5), ArrowRight: () => seekBy(5),
    ArrowUp: () => setVolume(player.getVolume() + 5), ArrowDown: () => setVolume(player.getVolume() - 5), m: toggleMute, f: toggleFs, c: toggleCaptions, z: toggleFocus, n: () => quickNote(), '[': () => stepChapter(-1), ']': () => stepChapter(1),
    '<': () => stepSpeed(-1), ',': () => stepSpeed(-1), '>': () => stepSpeed(1), '.': () => stepSpeed(1) };
  if (map[k]) { e.preventDefault(); map[k](); bumpControls(); }
});

// ---------- focus mode ----------
let focusMode = false;
function toggleFocus() {
  focusMode = !focusMode;
  const c = document.querySelector('.course'); if (c) c.classList.toggle('focus', focusMode);
  if (focusMode) toast('Focus mode – press Z or Esc to exit');
  bumpControls();
}

// ---------- end-of-lesson card (replaces YouTube's suggestion wall) ----------
function showEnd(on) {
  const c = $('endcard'); if (!c) return;
  if (!on) { c.hidden = true; return; }
  const last = cur >= C.lessons.length - 1, nxt = C.lessons[cur + 1];
  c.innerHTML = `<div class="ec"><div class="ect">${last ? 'Course complete' : 'Lesson complete'}</div>
    <div class="ecs">${esc(C.lessons[cur].title)}</div>
    <div class="ecb">${last ? '' : `<button class="btn" id="ecNext">Next: ${esc(nxt.title)} ›</button>`}<button class="btn ghost light" id="ecAgain">Replay</button></div></div>`;
  c.hidden = false;
  const n = $('ecNext'); if (n) n.onclick = () => select(cur + 1);
  $('ecAgain').onclick = () => { c.hidden = true; player.seekTo(0, true); player.playVideo(); };
}

// ---------- timestamped notes ----------
let qnWasPlaying = false;
function quickNote() {
  if (!player || !player.getCurrentTime) return;
  const box = $('qnote'); if (!box || !box.hidden) return;
  const t = Math.floor(player.getCurrentTime()); qnWasPlaying = isPlaying; if (isPlaying) player.pauseVideo();
  box.innerHTML = `<span class="qt">${fmtT(t)}</span><input id="qnIn" placeholder="Note at ${fmtT(t)} – Enter to save, Esc to cancel" maxlength="400" autocomplete="off"><button id="qnSave">Save</button>`;
  box.hidden = false;
  const inp = $('qnIn'); inp.focus();
  const close = (save) => {
    const v = inp.value.trim(); box.hidden = true;
    if (save && v) {
      const L = C.lessons[cur]; (L.marks = L.marks || []).push({ t, text: v }); L.marks.sort((x, y) => x.t - y.t);
      queueSave(); if (tab === 'notes') renderPane(); toast('Note saved at ' + fmtT(t));
    }
    if (qnWasPlaying) player.playVideo();
  };
  inp.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') close(true); else if (e.key === 'Escape') close(false); };
  $('qnSave').onclick = () => close(true);
}
function renderNotesPane(pane, L) {
  L.marks = L.marks || [];
  pane.innerHTML = `<h2>Notes for lesson ${cur + 1}</h2>
    <div class="nrow"><button class="btn ghost" id="addMark">＋ Note at current time <kbd>N</kbd></button><button class="btn ghost" id="expNotes">Export all notes (.md)</button></div>
    <div id="marks">${L.marks.length ? L.marks.map((m, i) => `<div class="mark"><button class="mt" data-seek="${m.t}" title="Jump to this moment">${fmtT(m.t)}</button><input class="mx" data-i="${i}" value="${esc(m.text)}"><button class="x" data-rm="${i}" title="Delete">${I.x}</button></div>`).join('') : '<div class="hint">No timestamped notes yet – press N while watching.</div>'}</div>
    <h3 class="nh">General notes</h3>
    <textarea class="notes" id="notes" placeholder="Write anything you want to remember…">${esc(L.notes)}</textarea>
    <div class="hint">Saved automatically on this computer.</div>`;
  $('addMark').onclick = () => quickNote();
  $('expNotes').onclick = exportNotes;
  pane.querySelectorAll('[data-seek]').forEach((b) => (b.onclick = () => { player && player.seekTo(+b.dataset.seek, true); }));
  pane.querySelectorAll('.mx').forEach((inp) => (inp.oninput = () => { L.marks[+inp.dataset.i].text = inp.value; queueSave(); }));
  pane.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = () => { L.marks.splice(+b.dataset.rm, 1); queueSave(); renderNotesPane(pane, L); }));
  const ta = $('notes'); ta.oninput = () => { L.notes = ta.value; queueSave(); };
}
function exportNotes() {
  let md = `# ${C.title}\n\n`, any = false;
  C.lessons.forEach((l, i) => {
    const n = (l.notes || '').trim(); const cms = (l.blocks || []).filter((b) => b.hl || b.c); if (!n && !(l.marks && l.marks.length) && !cms.length) return;
    any = true; md += `## ${i + 1}. ${l.title}\n\n`;
    if (l.type === 'article') md += `Source: ${l.url}\n\n`;
    (l.marks || []).forEach((m) => (md += `- [${fmtT(m.t)}](https://youtu.be/${l.id}?t=${m.t}) ${m.text}\n`));
    cms.forEach((b) => (md += `- ${b.hl ? '⭐ ' : ''}${b.t.slice(0, 200)}${b.c ? ' — 💬 ' + b.c : ''}\n`));
    if (n) md += `\n${n}\n`;
    md += '\n';
  });
  if (!any) return toast('No notes to export yet');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([md], { type: 'text/markdown' }));
  a.download = (C.title.replace(/[^\w\- ]+/g, '').trim().slice(0, 60) || 'course') + ' - notes.md';
  a.click();
}

// ---------- study timer (Pomodoro) + Do Not Disturb ----------
const T = { phase: 'idle', left: 0, paused: false, sessions: 0, study: 1500, brk: 300, tm: null, dnd: null };
const clock = (s) => String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
function notify(title, body) { try { new Notification(title, { body, silent: false }); } catch {} toast(title + ' – ' + body); }
async function setDndState(on) { const ok = await api.dnd(on); if (on) T.dnd = ok; }
function beginPhase(ph) {
  T.phase = ph; T.left = ph === 'study' ? T.study : T.brk; T.paused = false;
  clearInterval(T.tm); T.tm = setInterval(timerTick, 1000);
  if (ph === 'study') setDndState(true);
  else { setDndState(false); try { player && player.pauseVideo(); } catch {} }
  renderTimerUI();
}
function timerStart(studyMin, breakMin) { T.study = studyMin * 60; T.brk = breakMin * 60; T.sessions = 0; LS.set('timerPreset', [studyMin, breakMin]); beginPhase('study'); }
function timerTick() {
  if (T.paused) return;
  if (--T.left > 0) return updateTimerChip();
  if (T.phase === 'study') { T.sessions++; beginPhase('break'); notify('Break time', `Session ${T.sessions} done. Rest for ${Math.round(T.brk / 60)} min.`); }
  else { beginPhase('study'); notify('Back to it', 'Break over – next study session started.'); }
}
function timerStop() { clearInterval(T.tm); T.phase = 'idle'; T.paused = false; setDndState(false); renderTimerUI(); }
function timerPause() { T.paused = !T.paused; setDndState(T.phase === 'study' && !T.paused); renderTimerUI(); }
function updateTimerChip() {
  const txt = T.phase === 'idle' ? 'Timer' : (T.phase === 'study' ? '● ' : '☕ ') + clock(T.left) + (T.paused ? ' ⏸' : '');
  const t = $('timerTxt'); if (t) t.textContent = txt;
  const c = $('tchip'); if (c) { c.hidden = T.phase === 'idle'; c.textContent = txt; }
}
function renderTimerPop() {
  const p = $('timerPop'); if (!p || p.hidden) return;
  if (T.phase === 'idle') {
    const last = LS.get('timerPreset', [25, 5]);
    p.innerHTML = `<b>Study timer</b><small>${T.dnd === false ? 'Notification muting is only available on GNOME (Linux).' : 'Notifications are muted (Do Not Disturb) while you study.'}</small>
      ${[[25, 5], [50, 10], [90, 15]].map(([s, b]) => `<button class="preset ${last[0] === s ? 'on' : ''}" data-s="${s}" data-b="${b}">${s} min study · ${b} min break</button>`).join('')}`;
    p.querySelectorAll('.preset').forEach((b) => (b.onclick = () => { timerStart(+b.dataset.s, +b.dataset.b); }));
  } else {
    p.innerHTML = `<b>${T.phase === 'study' ? 'Studying' : 'Break'}</b><div class="big">${clock(T.left)}</div><small>Sessions done: ${T.sessions}</small>
      <div class="prow"><button class="preset" id="tPause">${T.paused ? 'Resume' : 'Pause'}</button><button class="preset" id="tStop">Stop</button></div>`;
    $('tPause').onclick = timerPause; $('tStop').onclick = timerStop;
  }
}
function renderTimerUI() { updateTimerChip(); renderTimerPop(); }
function wireTimer() {
  const b = $('timerBtn'); if (!b) return;
  b.onclick = (e) => { e.stopPropagation(); const p = $('timerPop'); p.hidden = !p.hidden; renderTimerPop(); };
  updateTimerChip();
}
document.addEventListener('click', (e) => { const p = $('timerPop'); if (p && !p.hidden && !e.target.closest('.timerwrap')) p.hidden = true; });
setInterval(() => { const p = $('timerPop'); if (p && !p.hidden && T.phase !== 'idle') renderTimerPop(); }, 1000);

// ---------- local (offline) captions/audio shim ----------
async function pOp(op, arg) {
  if (!localMode) return api.playerOp(op, arg);
  const v = player && player._video; if (!v) return null;
  const tt = [...v.textTracks];
  if (op === 'ccList') { const sh = tt.find((t) => t.mode === 'showing'); return { tracks: tt.map((t) => ({ code: t.language || 'en', name: t.label || 'English', kind: '', tr: false })), cur: sh ? sh.language || 'en' : null }; }
  if (op === 'ccSet') { tt.forEach((t) => (t.mode = (t.language || 'en') === arg ? 'showing' : 'disabled')); return true; }
  if (op === 'ccOff') { tt.forEach((t) => (t.mode = 'disabled')); return true; }
  if (op === 'audioList') return { tracks: [{ i: 0, name: 'Original', dubbed: false, def: true }], cur: 0 };
  return true;
}

// ---------- theme ----------
const themeIcon = () => (document.documentElement.dataset.theme === 'dark' ? I.sun : I.moon);
document.addEventListener('click', (e) => {
  if (!e.target.closest('.themeBtn')) return;
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next; LS.set('theme', next);
  document.querySelectorAll('.themeBtn').forEach((b) => (b.innerHTML = themeIcon()));
});

// ---------- offline downloads ----------
let DL = {}, FF = false;
const fmtBytes = (n) => (n >= 1e9 ? (n / 1e9).toFixed(1) + ' GB' : n >= 1e6 ? Math.round(n / 1e6) + ' MB' : Math.round(n / 1e3) + ' KB');
async function loadDl() {
  DL = {};
  try {
    const r = await api.dlList(C.id); FF = r.ffmpeg;
    for (const [v, f] of Object.entries(r.files)) DL[v] = { state: 'done', ...f };
    for (const [v, s] of Object.entries(r.active)) DL[v] = { ...s };
  } catch {}
}
const dlCount = () => C.lessons.filter((l) => DL[l.id] && DL[l.id].state === 'done').length;
const dlBusy = () => C.lessons.filter((l) => DL[l.id] && (DL[l.id].state === 'queued' || DL[l.id].state === 'downloading')).length;
function dlIcon(id) {
  const d = DL[id]; if (!d) return I.dl;
  if (d.state === 'done') return I.dlok; if (d.state === 'queued') return '…';
  if (d.state === 'downloading') return Math.round(d.pct || 0) + '%'; if (d.state === 'error') return '!';
  return I.dl;
}
const dlCls = (id) => { const d = DL[id]; return !d ? '' : d.state === 'done' ? 'ok' : d.state === 'error' ? 'err' : 'busy'; };
const offBadge = (id) => (DL[id] && DL[id].state === 'done' ? '<span class="offbadge">Offline</span>' : '');
function updateDlIcon(vid) {
  const b = document.querySelector(`[data-dl="${vid}"]`); if (!b) return;
  b.innerHTML = dlIcon(vid); b.className = 'dlb ' + dlCls(vid);
  b.title = DL[vid] && DL[vid].state === 'error' ? DL[vid].error || 'Failed – click to retry' : 'Download for offline';
}
async function onDlClick(vid, btn) {
  const d = DL[vid];
  if (!d || d.state === 'error') { delete DL[vid]; return api.dlStart(C.id, [vid]); }
  if (d.state === 'queued' || d.state === 'downloading') return api.dlCancel(C.id, vid);
  if (btn.dataset.confirm !== '1') { btn.dataset.confirm = '1'; btn.textContent = 'Remove?'; setTimeout(() => { btn.dataset.confirm = ''; updateDlIcon(vid); }, 2500); return; }
  await api.dlDelete(C.id, vid); delete DL[vid]; updateDlIcon(vid); renderDlBox();
}
function renderDlBox() {
  const b = $('dlbox'); if (!b) return;
  const vids = C.lessons.filter((l) => l.type !== 'article'), n = vids.length, done = dlCount(), busy = dlBusy();
  if (!n) { b.innerHTML = ''; return; }
  const bytes = Object.values(DL).reduce((s, d) => s + (d.state === 'done' ? d.size || 0 : 0), 0);
  b.innerHTML = `<h3 class="nh">Offline downloads</h3>
    <p class="hint" style="margin:0 0 12px">${done} of ${n} lessons saved on this computer${bytes ? ' · ' + fmtBytes(bytes) : ''}${busy ? ' · ' + busy + ' in progress' : ''}. Offline lessons play without internet, ads, or YouTube around them.</p>
    <div class="nrow"><button class="btn ghost" id="dlAll" ${done + busy >= n ? 'disabled' : ''}>Download all remaining</button>
      ${busy ? '<button class="btn ghost" id="dlCancel">Cancel downloads</button>' : ''}
      ${done ? '<button class="btn ghost" id="dlOpen">Open folder</button><button class="btn ghost" id="dlRemove">Remove all downloads</button>' : ''}</div>
    ${FF ? '' : `<p class="hint">Without ffmpeg, downloads are 360p. For up to 720p: <code>${/Windows/i.test(navigator.userAgent) ? 'winget install Gyan.FFmpeg' : 'sudo dnf install ffmpeg-free'}</code></p>`}`;
  $('dlAll').onclick = () => api.dlStart(C.id, C.lessons.filter((l) => l.type !== 'article' && (!DL[l.id] || DL[l.id].state === 'error')).map((l) => l.id));
  const cb = $('dlCancel'); if (cb) cb.onclick = () => api.dlCancel(C.id);
  const ob = $('dlOpen'); if (ob) ob.onclick = () => api.dlOpen(C.id);
  const rb = $('dlRemove'); if (rb) rb.onclick = async () => {
    if (rb.dataset.c !== '1') { rb.dataset.c = '1'; rb.textContent = 'Click again to remove all'; setTimeout(renderDlBox, 2500); return; }
    await api.dlDelete(C.id); DL = {}; renderList(); renderDlBox();
  };
}
api.onDlProgress((e) => {
  if (!C || e.cid !== C.id) return;
  if (e.state === 'canceled') delete DL[e.vid];
  else DL[e.vid] = { state: e.state, pct: e.pct, size: e.size, ext: e.ext, sub: e.sub, error: e.error };
  updateDlIcon(e.vid);
  if (e.state !== 'downloading') renderDlBox();
  if (e.state === 'error') toast('Download failed: ' + (e.error || 'unknown error'), true);
});

// ---------- chapters ----------
let CH = [], ticksKey = '';
function chAt(t) { let r = null; for (const c of CH) if (c.t <= t + 0.5) r = c; return r; }
function renderTicks() {
  const el = $('ticks'); if (!el || !player) return;
  const d = player.getDuration();
  if (!d || !CH.length) { if (ticksKey) { el.innerHTML = ''; ticksKey = ''; } return; }
  const key = C.lessons[cur].id + ':' + Math.round(d) + ':' + CH.length; if (key === ticksKey) return; ticksKey = key;
  el.innerHTML = CH.filter((c) => c.t > 1 && c.t < d - 1).map((c) => `<i class="tick" style="left:${(c.t / d) * 100}%"></i>`).join('');
}
function setChapters(list) {
  CH = Array.isArray(list) ? list : []; ticksKey = '';
  const w = $('chWrap'); if (w) w.hidden = !CH.length;
  renderTicks();
}
async function loadChapters(L) {
  CH = []; setChapters([]);
  if (Array.isArray(L.chapters)) return setChapters(L.chapters);
  try {
    const r = await api.chapters(L.id);
    if (Array.isArray(r)) { L.chapters = r; queueSave(); if (C.lessons[cur] === L) setChapters(r); if (query) renderList(); }
  } catch {}
}
function openChMenu() {
  if (!CH.length) return;
  const now = chAt(player.getCurrentTime());
  toggleMenu('chMenu', CH.map((c) => `<button data-t="${c.t}" class="${now === c ? 'on' : ''}"><span class="ct">${fmtT(c.t)}</span><span>${esc(c.title)}</span></button>`).join(''),
    (m) => m.querySelectorAll('button').forEach((b) => (b.onclick = () => { player.seekTo(+b.dataset.t, true); closeMenus(); })));
}
function stepChapter(dir) {
  if (!CH.length || !player) return;
  const t = player.getCurrentTime();
  const target = dir > 0 ? CH.find((c) => c.t > t + 1) : [...CH].reverse().find((c) => c.t < t - 2);
  if (target) { player.seekTo(target.t, true); toast(target.title); } else if (dir < 0) player.seekTo(0, true);
}

// ---------- playlist refresh ----------
const isNew = (l) => !!l.addedAt && !l.done && Date.now() - l.addedAt < 7 * 864e5;
function ago(ts) {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 90) return 'just now'; if (s < 5400) return Math.round(s / 60) + ' min ago';
  if (s < 129600) return Math.round(s / 3600) + ' h ago'; return Math.round(s / 86400) + ' days ago';
}
function refreshMsg(r) {
  const bits = [];
  if (r.added) bits.push(`${r.added} new lesson${r.added === 1 ? '' : 's'} added`);
  if (r.removed) bits.push(`${r.removed} removed from the playlist`);
  if (r.kept) bits.push(`${r.kept} kept (you have notes, progress or a download)`);
  return bits.length ? bits.join(' · ') : 'Already up to date';
}
let refreshing = false;
async function refreshNow(silent) {
  if (refreshing || !C || C.custom) return;
  refreshing = true;
  const id = C.id, btn = $('refreshBtn'); if (btn && !silent) { btn.disabled = true; btn.lastChild.textContent = ' Checking…'; }
  flushSave();
  const r = await api.refreshCourse(id);
  refreshing = false;
  if (btn) { btn.disabled = false; }
  if (!r.ok) { if (!silent) toast('Refresh failed: ' + r.error, true); return; }
  if (!C || C.id !== id) return; // user left the course meanwhile; the file is already updated
  const here = C.lessons[cur] && C.lessons[cur].id;
  const progress = C.lessons.find((l) => l.id === here);
  C = r.course; C.lastOpened = Date.now();
  const k = C.lessons.findIndex((l) => l.id === here); cur = k >= 0 ? k : 0;
  if (progress && k >= 0) Object.assign(C.lessons[k], { done: progress.done || C.lessons[k].done, pos: Math.max(progress.pos || 0, C.lessons[k].pos || 0) });
  queueSave(); refreshProgress();
  if (!silent || r.added) toast(refreshMsg(r));
}

// ---------- custom courses (hand-picked videos) ----------
function syncBar() {
  const L = C.lessons[cur], t = document.querySelector('.lesson-bar .t');
  if (t && t.firstChild) t.firstChild.nodeValue = `${cur + 1}. ${L.title}`;
  const pv = $('prev'), nx = $('next');
  if (pv) pv.disabled = cur === 0; if (nx) nx.disabled = cur === C.lessons.length - 1;
}
function moveLesson(i, d) {
  const j = i + d; if (j < 0 || j >= C.lessons.length) return;
  persistPos();
  const curId = C.lessons[cur].id;
  [C.lessons[i], C.lessons[j]] = [C.lessons[j], C.lessons[i]];
  cur = C.lessons.findIndex((l) => l.id === curId);
  C.thumbnail = lessonThumb(C.lessons[0]);
  openSecs.add(Math.floor(j / SECTION_SIZE));
  queueSave(); renderList(); syncBar();
}
async function removeLesson(i, el) {
  if (C.lessons.length < 2) { toast('A course needs at least one video – delete the course from Home instead.', true); return; }
  if (el.dataset.confirm !== '1') {
    el.dataset.confirm = '1'; el.textContent = 'Remove?'; el.classList.add('sure');
    setTimeout(() => { if (el.isConnected) { el.dataset.confirm = ''; el.textContent = '✕'; el.classList.remove('sure'); } }, 2500);
    return;
  }
  const [gone] = C.lessons.splice(i, 1);
  api.dlDelete(C.id, gone.id);
  C.thumbnail = lessonThumb(C.lessons[0]);
  if (i === cur) {
    cur = Math.min(i, C.lessons.length - 1); C.lastLesson = C.lessons[cur].id;
    queueSave(); await loadDl(); renderCourse();
  } else {
    if (i < cur) cur--;
    queueSave(); await loadDl(); renderList(); syncBar(); if (tab === 'overview') renderPane();
  }
  toast('Removed “' + gone.title + '”');
}
async function addLinks(text) {
  toast('Reading links…');
  const r = await api.resolveVideos(text);
  if (!r.ok) { toast(r.error, true); return false; }
  return mergeResolved(prepareResolved(r));
}
function mergeResolved(r) {
  const have = new Set(C.lessons.map((l) => l.id)), now = Date.now();
  const fresh = r.lessons.filter((l) => !have.has(l.id));
  fresh.forEach((l) => C.lessons.push({ ...l, done: false, pos: 0, notes: '', addedAt: now }));
  const bits = [];
  if (fresh.length) bits.push(`${fresh.length} item${fresh.length === 1 ? '' : 's'} added`);
  const dup = r.lessons.length - fresh.length; if (dup) bits.push(`${dup} already in this course`);
  if (r.errors.length) bits.push(`${r.errors.length} link${r.errors.length === 1 ? '' : 's'} could not be read`);
  if (fresh.length) {
    openSecs.add(Math.floor((C.lessons.length - 1) / SECTION_SIZE));
    queueSave(); loadDl().then(() => { renderList(); syncBar(); if (tab === 'overview') renderPane(); });
  }
  toast(bits.join(' · ') || 'Nothing to add', !fresh.length);
  return fresh.length > 0;
}

// Generic "paste links" dialog. run(name, text) -> {ok, error?}; closes on ok.
function linksModal({ heading, askName, okLabel, run, text = '' }) {
  if (document.getElementById('modal')) return;
  const bg = document.createElement('div'); bg.className = 'modal-bg'; bg.id = 'modal';
  bg.innerHTML = `<div class="modal" role="dialog" aria-modal="true">
    <h3>${esc(heading)}</h3>
    ${askName ? `<label>Course name<input id="mName" maxlength="120" placeholder="e.g. Learn React from scratch" autocomplete="off" spellcheck="false"></label>` : ''}
    <label>Links <small>one per line – YouTube videos from any channel, a playlist (adds all its videos), or any article / blog post (becomes a readable note page)</small>
      <textarea id="mLinks" rows="8" placeholder="https://www.youtube.com/watch?v=…&#10;https://some-blog.com/great-article" spellcheck="false">${esc(text)}</textarea></label>
    <div class="mstatus" id="mStatus"></div>
    <div class="mrow"><button class="btn ghost" id="mCancel" type="button">Cancel</button><button class="btn" id="mOk" type="button">${esc(okLabel)}</button></div></div>`;
  document.body.appendChild(bg);
  const $m = (id) => document.getElementById(id);
  let busy = false;
  const close = () => { if (!busy) bg.remove(); };
  bg.onmousedown = (e) => { if (e.target === bg) close(); };
  bg.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Escape') close(); else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) $m('mOk').click(); };
  $m('mCancel').onclick = close;
  $m('mOk').onclick = async () => {
    const links = $m('mLinks').value.trim();
    if (!links) { $m('mStatus').textContent = 'Paste at least one link.'; $m('mStatus').className = 'mstatus err'; return; }
    busy = true; $m('mOk').disabled = true; $m('mCancel').disabled = true; $m('mStatus').className = 'mstatus'; $m('mStatus').textContent = 'Reading links…';
    const r = await run(askName ? $m('mName').value : '', links);
    busy = false;
    if (r.ok) { bg.remove(); return; }
    $m('mOk').disabled = false; $m('mCancel').disabled = false; $m('mStatus').className = 'mstatus err'; $m('mStatus').textContent = r.error;
  };
  ($m('mName') || $m('mLinks')).focus();
}
function customModal() {
  linksModal({
    heading: 'New custom course', askName: true, okLabel: 'Create course',
    run: async (name, text) => {
      const raw = await api.resolveVideos(text);
      if (!raw.ok) return raw;
      const r = prepareResolved(raw), p = r;
      if (!r.lessons.length) return { ok: false, error: r.errors[0] || 'Nothing readable found in those links' };
      const now = Date.now(), id = 'c' + now.toString(36) + Math.random().toString(36).slice(2, 6);
      await api.save({
        id, custom: true, title: name.trim() || 'My custom course', channel: '', url: '',
        thumbnail: lessonThumb(p.lessons[0]), createdAt: now, lastOpened: now, lastLesson: r.lessons[0].id,
        lessons: r.lessons.map((l) => ({ ...l, done: false, pos: 0, notes: '' })),
      });
      openCourse(id);
      toast(`Course created with ${r.lessons.length} item${r.lessons.length === 1 ? '' : 's'}` + (r.errors.length ? ` · ${r.errors.length} link(s) skipped` : ''), false);
      return { ok: true };
    },
  });
}
function addModal() {
  linksModal({
    heading: 'Add videos or articles to this course', okLabel: 'Add to course',
    run: async (_n, text) => {
      const raw = await api.resolveVideos(text);
      if (!raw.ok) return raw;
      const r = prepareResolved(raw);
      if (!r.lessons.length) return { ok: false, error: r.errors[0] || 'Nothing readable found in those links' };
      mergeResolved(r);
      return { ok: true };
    },
  });
}

// ---------- settings: export / import ----------
const PREFS = ['theme', 'vol', 'rate', 'cc', 'audio', 'timerPreset'];
function settingsModal() {
  if (document.getElementById('modal')) return;
  const bg = document.createElement('div'); bg.className = 'modal-bg'; bg.id = 'modal';
  bg.innerHTML = `<div class="modal" role="dialog" aria-modal="true">
    <h3>Settings</h3>
    <div class="setsec"><b>Backup &amp; restore</b>
      <p class="hint">One file with all your courses, progress, notes, highlights, saved articles and preferences. Use it to back up, move to another computer, or carry your data to the Android app. Downloaded videos are not included.</p>
      <div class="nrow"><button class="btn" id="sExport">Export data…</button><button class="btn ghost" id="sImport">Import data…</button></div>
      <p class="hint">Importing never deletes anything: courses you already have are merged (progress and notes from both are kept).</p>
      <div class="mstatus" id="sStatus"></div></div>
    <div class="setsec"><b>Data folder</b><div class="nrow"><button class="btn ghost" id="sFolder">Open data folder</button></div></div>
    <div class="mrow"><button class="btn ghost" id="sClose" type="button">Close</button></div></div>`;
  document.body.appendChild(bg);
  const $s = (id) => document.getElementById(id), msg = (t, err) => { $s('sStatus').textContent = t; $s('sStatus').className = 'mstatus' + (err ? ' err' : ''); };
  const close = () => bg.remove();
  bg.onmousedown = (e) => { if (e.target === bg) close(); };
  bg.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Escape') close(); };
  $s('sClose').onclick = close; $s('sFolder').onclick = () => api.openDataFolder();
  $s('sExport').onclick = async () => {
    flushSave(); const prefs = {}; for (const k of PREFS) { const v = LS.get(k, undefined); if (v !== undefined) prefs[k] = v; }
    const r = await api.exportData(prefs);
    if (r.canceled) return;
    r.ok ? msg(`Saved ${r.count} course${r.count === 1 ? '' : 's'} (${fmtBytes(r.size)}) to ${r.path}`) : msg('Export failed: ' + r.error, true);
  };
  $s('sImport').onclick = async () => {
    const r = await api.importData();
    if (r.canceled) return;
    if (!r.ok) return msg('Import failed: ' + r.error, true);
    for (const k of PREFS) if (r.prefs[k] !== undefined) LS.set(k, r.prefs[k]);
    if (r.prefs.theme) document.documentElement.dataset.theme = r.prefs.theme;
    close(); toast(`Imported: ${r.added} new, ${r.merged} merged${r.skipped ? `, ${r.skipped} skipped` : ''}`); goHome();
  };
}

goHome();
