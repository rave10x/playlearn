const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFile, execFileSync, spawn } = require('child_process');

const RENDERER = path.join(__dirname, 'renderer');
let win = null;
let port = 0;
let pendingUrl = null;

// ---------- storage ----------
const dataDir = () => path.join(app.getPath('userData'), 'courses');
const ensureDir = () => fs.mkdirSync(dataDir(), { recursive: true });
const courseFile = (id) => path.join(dataDir(), id.replace(/[^\w-]/g, '') + '.json');
const readCourse = (id) => JSON.parse(fs.readFileSync(courseFile(id), 'utf8'));
const writeCourse = (c) => {
  ensureDir();
  const f = courseFile(c.id);
  fs.writeFileSync(f + '.tmp', JSON.stringify(c, null, 2));
  fs.renameSync(f + '.tmp', f);
};
const listCourses = () => {
  ensureDir();
  return fs.readdirSync(dataDir()).filter((f) => f.endsWith('.json'))
    .map((f) => { try { return JSON.parse(fs.readFileSync(path.join(dataDir(), f), 'utf8')); } catch { return null; } })
    .filter(Boolean)
    .sort((a, b) => (b.lastOpened || b.createdAt) - (a.lastOpened || a.createdAt));
};

// ---------- yt-dlp ----------
const IS_WIN = process.platform === 'win32';
const EXE = IS_WIN ? '.exe' : '';
const localBin = () => path.join(app.getPath('userData'), 'bin', 'yt-dlp' + EXE);
function findOnPath(name) {
  for (const p of (process.env.PATH || process.env.Path || '').split(path.delimiter)) {
    if (!p) continue;
    const f = path.join(p.replace(/^"|"$/g, ''), name + EXE);
    if (fs.existsSync(f)) return f;
  }
  return null;
}
function findYtDlp() {
  return findOnPath('yt-dlp') || (fs.existsSync(localBin()) ? localBin() : null);
}
async function ensureYtDlp(send) {
  let bin = findYtDlp();
  if (bin) return bin;
  send('Downloading yt-dlp (one time)…');
  const res = await fetch('https://github.com/yt-dlp/yt-dlp/releases/latest/download/' + (IS_WIN ? 'yt-dlp.exe' : 'yt-dlp_linux'), { redirect: 'follow' });
  if (!res.ok) throw new Error('Could not download yt-dlp (HTTP ' + res.status + ')');
  fs.mkdirSync(path.dirname(localBin()), { recursive: true });
  fs.writeFileSync(localBin(), Buffer.from(await res.arrayBuffer()), { mode: 0o755 });
  return localBin();
}
const run = (bin, args) => new Promise((resolve, reject) => {
  execFile(bin, args, { windowsHide: true, maxBuffer: 256 * 1024 * 1024, timeout: 180000 }, (err, out, errout) =>
    err ? reject(new Error((errout || err.message).split('\n').filter(Boolean).pop())) : resolve(out));
});

function playlistId(input) {
  const s = String(input || '').trim();
  try {
    const u = new URL(s);
    const l = u.searchParams.get('list');
    if (l) return l;
  } catch {}
  return /^(PL|UU|OL|FL|LL)[\w-]{10,}$/.test(s) ? s : null;
}

async function fetchPlaylist(pid, send) {
  const bin = await ensureYtDlp(send);
  send('Reading playlist…');
  const out = await run(bin, ['--flat-playlist', '-J', '--no-warnings', 'https://www.youtube.com/playlist?list=' + pid]);
  const j = JSON.parse(out);
  const lessons = (j.entries || [])
    .filter((e) => e && e.id && !/^\[(Private|Deleted) video\]$/i.test(e.title || ''))
    .map((e, i) => ({ id: e.id, title: e.title || 'Lesson ' + (i + 1), duration: Math.round(e.duration || 0) }));
  if (!lessons.length) throw new Error('No playable videos found in this playlist');
  return { title: j.title || '', channel: j.channel || j.uploader || '', lessons };
}

async function importPlaylist(input, send) {
  const pid = playlistId(input);
  if (!pid) throw new Error('That does not look like a YouTube playlist link (needs ?list=…). To build a course from single videos, use “Custom course”.');
  const existing = listCourses().find((c) => c.playlistId === pid);
  if (existing) return existing;
  const pl = await fetchPlaylist(pid, send);
  const lessons = pl.lessons.map((l) => ({ ...l, done: false, pos: 0, notes: '' }));
  const course = {
    id: pid, playlistId: pid,
    title: pl.title || 'Untitled course',
    channel: pl.channel,
    url: 'https://www.youtube.com/playlist?list=' + pid,
    thumbnail: 'https://i.ytimg.com/vi/' + lessons[0].id + '/hqdefault.jpg',
    createdAt: Date.now(), lastOpened: Date.now(), refreshedAt: Date.now(), lastLesson: lessons[0].id, lessons,
  };
  writeCourse(course);
  return course;
}


// ---------- custom courses: resolve single video / playlist links into lessons ----------
function videoId(input) {
  let s = String(input || '').trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  if (!/^[a-z]+:\/\//i.test(s)) s = 'https://' + s;
  try {
    const u = new URL(s), h = u.hostname.replace(/^(www|m|music)\./, '');
    if (h === 'youtu.be') { const id = u.pathname.slice(1).split('/')[0]; return /^[\w-]{11}$/.test(id) ? id : null; }
    if (/(^|\.)youtube(-nocookie)?\.com$/.test(h)) {
      const v = u.searchParams.get('v'); if (v && /^[\w-]{11}$/.test(v)) return v;
      const m = /^\/(?:shorts|embed|live|v)\/([\w-]{11})/.exec(u.pathname); if (m) return m[1];
    }
  } catch {}
  return null;
}
async function fetchVideo(vid, send) {
  const bin = await ensureYtDlp(send);
  const out = await run(bin, ['--skip-download', '--no-playlist', '--no-warnings', '--print',
    '%(id)s\t%(title)s\t%(duration)s\t%(channel)s', 'https://www.youtube.com/watch?v=' + vid]);
  const [id, title, dur, channel] = out.trim().split('\n').filter(Boolean).pop().split('\t');
  if (!id) throw new Error('video not found');
  return { id, title: title || 'Untitled video', duration: Math.round(+dur) || 0, channel: channel && channel !== 'NA' ? channel : '' };
}
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
function webUrl(input) {
  let s = String(input || '').trim();
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = 'https://' + s;
  try { const u = new URL(s); return /^https?:$/.test(u.protocol) && u.hostname.includes('.') ? u : null; } catch { return null; }
}
const isYouTubeHost = (u) => /(^|\.)(youtube(-nocookie)?\.com|youtu\.be)$/.test(u.hostname);
// Plain fetch first; if the site blocks it (Cloudflare etc.) or the page is an empty JS shell, render it in a hidden browser window.
const looksEmpty = (html) => html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().length < 1500 || /<title>\s*Just a moment/i.test(html);
async function renderPage(url, send) {
  const { BrowserWindow, session } = require('electron');
  send('Opening the page in a hidden browser…');
  const w = new BrowserWindow({ show: false, width: 1280, height: 900, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, session: session.fromPartition('article-render'), backgroundThrottling: false } });
  w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  w.webContents.session.setPermissionRequestHandler((_wc, _p, cb) => cb(false));
  try {
    w.loadURL(url, { userAgent: UA }).catch(() => {});
    const t0 = Date.now(); let html = '';
    while (Date.now() - t0 < 30000) {
      await new Promise((r) => setTimeout(r, 1200));
      if (w.isDestroyed()) break;
      try {
        html = await w.webContents.executeJavaScript('document.documentElement.outerHTML');
        if (!looksEmpty(html) && !w.webContents.isLoading()) { await new Promise((r) => setTimeout(r, 800)); html = await w.webContents.executeJavaScript('document.documentElement.outerHTML'); break; }
      } catch {}
    }
    const finalUrl = w.isDestroyed() ? url : w.webContents.getURL() || url;
    if (!html || /<title>\s*Just a moment/i.test(html)) throw new Error('the site blocked automatic access (bot check)');
    return { type: 'article', url: finalUrl, html };
  } finally { if (!w.isDestroyed()) w.destroy(); }
}
async function fetchArticle(u, send = () => {}) {
  try {
    const res = await fetch(u.href, { redirect: 'follow', signal: AbortSignal.timeout(25000),
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'en' } });
    const type = res.headers.get('content-type') || '';
    if (res.ok && type && !/html|xml/i.test(type)) throw Object.assign(new Error('not a web page (' + type.split(';')[0] + ')'), { final: true });
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 6 * 1024 * 1024) throw Object.assign(new Error('page is too large'), { final: true });
      const html = buf.toString('utf8');
      if (!looksEmpty(html)) return { type: 'article', url: res.url || u.href, html };
    }
  } catch (e) { if (e.final) throw e; }
  return renderPage(u.href, send);
}
// text = any mix of video links / playlist links separated by whitespace or commas
async function resolveVideos(text, send) {
  const items = [...new Set(String(text || '').split(/[\s,]+/).filter(Boolean))];
  if (!items.length) throw new Error('Paste at least one YouTube link');
  if (items.length > 100) throw new Error('Add at most 100 links at a time');
  let done = 0;
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, items.length) }, async () => {
    while (next < items.length) {
      const k = next++, it = items[k];
      try {
        const vid = videoId(it), pid = vid ? null : playlistId(it);
        if (vid) results[k] = { lessons: [await fetchVideo(vid, send)] };
        else if (pid) results[k] = { lessons: (await fetchPlaylist(pid, send)).lessons };
        else {
          const wu = webUrl(it);
          if (!wu) results[k] = { error: 'Not a link I can open' };
          else if (isYouTubeHost(wu)) results[k] = { error: 'Not a YouTube video or playlist link (channel pages are not supported)' };
          else results[k] = { lessons: [await fetchArticle(wu, send)] };
        }
      } catch (e) { results[k] = { error: e.message }; }
      send(`Reading links… ${++done}/${items.length}`);
    }
  }));
  const seen = new Set(), lessons = [], errors = [];
  results.forEach((r, k) => {
    if (r.error) { errors.push(`${items[k].slice(0, 60)} – ${r.error}`); return; }
    for (const l of r.lessons) { const key = l.id || l.url; if (!seen.has(key)) { seen.add(key); lessons.push(l); } }
  });
  return { lessons, errors };
}

// Re-read the playlist and merge: keep all progress/notes/chapters, add new videos, follow the playlist order.
// Videos that left the playlist are dropped unless you have progress, notes or a download for them.
async function refreshCourse(id, send) {
  const old = readCourse(id);
  if (old.custom) throw new Error('Custom courses have no playlist to refresh');
  const pl = await fetchPlaylist(old.playlistId, send); // throws (and changes nothing) if the playlist can't be read
  const byId = new Map(old.lessons.map((l) => [l.id, l]));
  const seen = new Set(), now = Date.now();
  const lessons = pl.lessons.map((n) => {
    seen.add(n.id);
    const o = byId.get(n.id);
    if (o) { const { gone, ...rest } = o; return { ...rest, title: n.title, duration: n.duration || o.duration }; }
    return { ...n, done: false, pos: 0, notes: '', addedAt: now };
  });
  const added = lessons.filter((l) => !byId.has(l.id)).length;
  const have = dlScan(id);
  let removed = 0, kept = 0;
  for (const o of old.lessons) {
    if (seen.has(o.id)) continue;
    const mine = o.done || o.pos || (o.notes && o.notes.trim()) || (o.marks && o.marks.length) || have[o.id];
    if (mine) { lessons.push({ ...o, gone: true }); if (!o.gone) kept++; } else removed++;
  }
  const course = { ...old, title: pl.title || old.title, channel: pl.channel || old.channel, lessons, refreshedAt: now };
  if (!lessons.some((l) => l.id === course.lastLesson)) course.lastLesson = lessons[0].id;
  writeCourse(course);
  return { course, added, removed, kept };
}

// ---------- backup: export / import everything (courses, progress, notes, highlights, articles, settings) ----------
const BACKUP_FORMAT = 'playlearn-backup';
const PREF_KEYS = ['theme', 'vol', 'rate', 'cc', 'audio', 'timerPreset'];
const validCourse = (c) => c && typeof c === 'object' && typeof c.id === 'string' && /^[\w-]+$/.test(c.id) && Array.isArray(c.lessons) &&
  c.lessons.length > 0 && c.lessons.every((l) => l && typeof l === 'object' && typeof l.id === 'string');
function mergeLesson(n, o) {
  if (!o) return n;
  const seen = new Set(), marks = [];
  for (const m of [...(n.marks || []), ...(o.marks || [])]) { const k = m.t + '|' + m.text; if (!seen.has(k)) { seen.add(k); marks.push(m); } }
  marks.sort((x, y) => x.t - y.t);
  const r = { ...n, done: !!(n.done || o.done), notes: n.notes && n.notes.trim() ? n.notes : (o.notes || '') };
  if (marks.length) r.marks = marks;
  if (!n.chapters && o.chapters) r.chapters = o.chapters;
  return r;
}
// Same course on both sides: the most recently opened copy decides order/position; progress and notes from both are kept.
function mergeCourse(a, b) {
  const [newer, other] = (b.lastOpened || 0) > (a.lastOpened || 0) ? [b, a] : [a, b];
  const om = new Map(other.lessons.map((l) => [l.id, l])), nIds = new Set(newer.lessons.map((l) => l.id));
  const lessons = [...newer.lessons.map((l) => mergeLesson(l, om.get(l.id))), ...other.lessons.filter((l) => !nIds.has(l.id))];
  const c = { ...newer, lessons, createdAt: Math.min(a.createdAt || Infinity, b.createdAt || Infinity), lastOpened: Math.max(a.lastOpened || 0, b.lastOpened || 0) };
  if (!isFinite(c.createdAt)) c.createdAt = Date.now();
  if (!lessons.some((l) => l.id === c.lastLesson)) c.lastLesson = lessons[0].id;
  return c;
}
ipcMain.handle('data:export', async (_e, prefs) => {
  try {
    const courses = listCourses();
    const stamp = new Date().toISOString().slice(0, 10);
    const r = await dialog.showSaveDialog(win, { title: 'Export Playlearn data', defaultPath: path.join(app.getPath('documents'), `playlearn-backup-${stamp}.json`), filters: [{ name: 'Playlearn backup', extensions: ['json'] }] });
    if (r.canceled || !r.filePath) return { ok: false, canceled: true };
    const clean = {}; for (const k of PREF_KEYS) if (prefs && prefs[k] !== undefined) clean[k] = prefs[k];
    fs.writeFileSync(r.filePath, JSON.stringify({ format: BACKUP_FORMAT, version: 1, exportedAt: Date.now(), prefs: clean, courses }));
    return { ok: true, path: r.filePath, count: courses.length, size: fs.statSync(r.filePath).size };
  } catch (err) { return { ok: false, error: err.message }; }
});
ipcMain.handle('data:import', async () => {
  try {
    const r = await dialog.showOpenDialog(win, { title: 'Import Playlearn data', properties: ['openFile'], filters: [{ name: 'Playlearn backup', extensions: ['json'] }] });
    if (r.canceled || !r.filePaths[0]) return { ok: false, canceled: true };
    if (fs.statSync(r.filePaths[0]).size > 300 * 1024 * 1024) throw new Error('That file is too large to be a Playlearn backup');
    let j; try { j = JSON.parse(fs.readFileSync(r.filePaths[0], 'utf8')); } catch { throw new Error('That file is not valid JSON'); }
    if (!j || j.format !== BACKUP_FORMAT || !Array.isArray(j.courses)) throw new Error('That is not a Playlearn backup file');
    if (j.version > 1) throw new Error('This backup was made by a newer version of Playlearn – update the app first');
    const have = new Map(listCourses().map((c) => [c.id, c]));
    let added = 0, merged = 0, skipped = 0;
    for (const c of j.courses) {
      if (!validCourse(c)) { skipped++; continue; }
      const old = have.get(c.id);
      writeCourse(old ? mergeCourse(old, c) : c);
      old ? merged++ : added++;
    }
    const prefs = {}; for (const k of PREF_KEYS) if (j.prefs && j.prefs[k] !== undefined) prefs[k] = j.prefs[k];
    return { ok: true, added, merged, skipped, prefs };
  } catch (err) { return { ok: false, error: err.message }; }
});
ipcMain.handle('data:folder', () => shell.openPath(dataDir()));

// ---------- local server (YouTube embeds refuse file:// origins) ----------
const MIME = { '.mp4': 'video/mp4', '.webm': 'video/webm', '.mkv': 'video/x-matroska', '.vtt': 'text/vtt', '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
function startServer() {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const rel = decodeURIComponent(req.url.split('?')[0]);
      const mm = /^\/media\/([\w-]+)\/([\w.-]+\.(?:mp4|mkv|webm|vtt))$/.exec(rel);
      if (mm) {
        const f = path.join(dlDir(mm[1]), path.basename(mm[2]));
        if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
        const size = fs.statSync(f).size, type = MIME[path.extname(f)] || 'application/octet-stream';
        const r = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
        if (r) {
          const s = r[1] ? +r[1] : 0, e = Math.min(r[2] ? +r[2] : size - 1, size - 1);
          if (s > e || s >= size) { res.writeHead(416, { 'Content-Range': `bytes */${size}` }); return res.end(); }
          res.writeHead(206, { 'Content-Range': `bytes ${s}-${e}/${size}`, 'Accept-Ranges': 'bytes', 'Content-Length': e - s + 1, 'Content-Type': type });
          return fs.createReadStream(f, { start: s, end: e }).pipe(res);
        }
        res.writeHead(200, { 'Content-Length': size, 'Accept-Ranges': 'bytes', 'Content-Type': type });
        return fs.createReadStream(f).pipe(res);
      }
      const f = path.normalize(path.join(RENDERER, rel === '/' ? 'index.html' : rel));
      if (!f.startsWith(RENDERER + path.sep) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' });
      fs.createReadStream(f).pipe(res);
    });
    srv.listen(0, '127.0.0.1', () => resolve(srv.address().port));
  });
}

// ---------- ad blocking (network rules + in-player ad skipper) ----------
const AD_HOSTS = ['doubleclick.net', 'googlesyndication.com', 'googleadservices.com', 'adservice.google.com',
  'google-analytics.com', 'googletagmanager.com', 'googletagservices.com', 'moatads.com', 'adsafeprotected.com',
  'imasdk.googleapis.com', 'pagead2.googlesyndication.com', 'static.doubleclick.net', 'ad.doubleclick.net'];
const AD_PATHS = [/\/pagead\//, /\/api\/stats\/ads/, /\/ptracking/, /\/get_midroll_/, /\/youtubei\/v1\/player\/ad_break/,
  /[?&]ad_type=/, /\/api\/stats\/qoe\?.*adformat/, /\/generate_204\?.*ad/];
const AD_SKIPPER = `(() => {
  if (window.__ytcAds) return; window.__ytcAds = true;
  const st = document.createElement('style');
  st.textContent = 'embedded-player-video-details,.ytmVideoInfoOverlay,.ytPlayerControlsContainerHost,.new-controls,.player-controls-background,.player-controls-background-container,.player-controls-content,.ytp-pause-overlay,.ytp-pause-overlay-container,.ytp-endscreen-content,.ytp-ce-element,.ytp-cards-teaser,.ytp-suggested-action,.ytp-videowall-still,.ytp-chrome-top,.ytp-gradient-top,.ytp-show-cards-title,.ytp-watermark,.ytp-impression-link,.iv-branding,.annotation{display:none!important}';
  document.head.appendChild(st);
  let mutedByUs = false;
  const tick = () => {
    const p = document.querySelector('.html5-video-player'); if (!p) return;
    const v = p.querySelector('video');
    document.querySelectorAll('.ytp-ad-overlay-container,.ytp-ad-module .ytp-ad-image-overlay,.ytp-paid-content-overlay,.video-ads')
      .forEach((e) => { e.style.display = 'none'; });
    if (p.classList.contains('ad-showing') && v) {
      if (!v.muted) { v.muted = true; mutedByUs = true; }
      v.playbackRate = 16;
      if (isFinite(v.duration) && v.duration > 0) v.currentTime = v.duration;
      document.querySelectorAll('.ytp-skip-ad-button,.ytp-ad-skip-button,.ytp-ad-skip-button-modern,.ytp-skip-ad-button__text')
        .forEach((b) => b.click());
    } else if (mutedByUs && v) { v.muted = false; v.playbackRate = 1; mutedByUs = false; }
  };
  setInterval(tick, 250);
})();`;
// ---------- offline downloads (yt-dlp) ----------
const dlDir = (cid) => path.join(app.getPath('userData'), 'downloads', String(cid).replace(/[^\w-]/g, ''));
const okId = (s) => /^[\w-]+$/.test(String(s || ''));
const winFfmpeg = () => path.join(app.getPath('userData'), 'bin', 'ffmpeg.exe');
const findBin = (name) => findOnPath(name) || (IS_WIN && name === 'ffmpeg' && fs.existsSync(winFfmpeg()) ? winFfmpeg() : null);
function dlScan(cid) {
  const dir = dlDir(cid), out = {};
  if (!fs.existsSync(dir)) return out;
  const files = fs.readdirSync(dir);
  for (const f of files) {
    const mt = /^([\w-]+)\.(mp4|mkv|webm)$/.exec(f); if (!mt) continue;
    const subs = files.filter((x) => x.startsWith(mt[1] + '.') && x.endsWith('.vtt')).sort((a, b) => (/\.en\.vtt$/.test(b) ? 1 : 0) - (/\.en\.vtt$/.test(a) ? 1 : 0));
    out[mt[1]] = { ext: mt[2], size: fs.statSync(path.join(dir, f)).size, sub: subs[0] || null };
  }
  return out;
}
const dlQueue = []; let dlCur = null; const dlActive = {};
function dlEmit(job, state, pct, extra = {}) {
  const k = job.cid + '/' + job.vid;
  if (state === 'queued' || state === 'downloading') dlActive[k] = { state, pct: pct || 0 }; else delete dlActive[k];
  if (win && !win.isDestroyed()) win.webContents.send('dl:progress', { cid: job.cid, vid: job.vid, state, pct: pct || 0, ...extra });
}
function dlWipe(cid, vid) {
  const dir = dlDir(cid); if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir)) if (f.startsWith(vid + '.')) fs.rmSync(path.join(dir, f), { force: true });
}
async function dlNext() {
  if (dlCur || !dlQueue.length) return;
  const job = dlQueue.shift(); dlCur = job; dlEmit(job, 'downloading', 0);
  let bin;
  try { bin = await ensureYtDlp(() => {}); } catch (e) { dlCur = null; dlEmit(job, 'error', 0, { error: e.message }); return dlNext(); }
  const dir = dlDir(job.cid); fs.mkdirSync(dir, { recursive: true });
  const ffPath = findBin('ffmpeg'), ff = !!ffPath;
  const fmt = ff ? 'bv*[height<=720][ext=mp4]+ba[ext=m4a]/b[height<=720][ext=mp4]/b[height<=720]' : 'b[height<=720][ext=mp4]/b[ext=mp4]/b';
  const args = ['--no-playlist', '--newline', '--no-warnings', '-f', fmt, '-o', path.join(dir, job.vid + '.%(ext)s'),
    '--write-subs', '--write-auto-subs', '--sub-langs', 'en', '--sub-format', 'vtt', '--retries', '5', '--concurrent-fragments', '4',
    ...(ff ? ['--merge-output-format', 'mp4', '--ffmpeg-location', ffPath] : []), 'https://www.youtube.com/watch?v=' + job.vid];
  const proc = spawn(bin, args, { windowsHide: true }); job.proc = proc; let last = '', lastPct = -1;
  const onData = (b) => {
    const s = b.toString(); const ln = s.trim().split('\n').pop(); if (ln) last = ln;
    const hit = [...s.matchAll(/\[download\]\s+([\d.]+)%/g)].pop();
    if (hit && Math.floor(+hit[1]) !== lastPct) { lastPct = Math.floor(+hit[1]); dlEmit(job, 'downloading', +hit[1]); }
  };
  proc.stdout.on('data', onData); proc.stderr.on('data', onData);
  proc.on('error', (e) => { last = e.message; });
  proc.on('close', () => {
    dlCur = null;
    if (job.canceled) { dlWipe(job.cid, job.vid); dlEmit(job, 'canceled'); }
    else {
      const info = dlScan(job.cid)[job.vid];
      if (info) dlEmit(job, 'done', 100, info);
      else { dlWipe(job.cid, job.vid); dlEmit(job, 'error', 0, { error: last.replace(/^ERROR:\s*/, '').slice(0, 200) || 'Download failed' }); }
    }
    dlNext();
  });
}
function dlCancel(cid, vid) {
  for (let i = dlQueue.length - 1; i >= 0; i--) {
    const j = dlQueue[i];
    if (j.cid === cid && (!vid || j.vid === vid)) { dlQueue.splice(i, 1); dlEmit(j, 'canceled'); }
  }
  if (dlCur && dlCur.cid === cid && (!vid || dlCur.vid === vid)) { dlCur.canceled = true; try { dlCur.proc.kill('SIGTERM'); } catch {} }
}
ipcMain.handle('dl:list', (_e, cid) => {
  if (!okId(cid)) return { files: {}, active: {}, ffmpeg: false };
  const active = {};
  for (const [k, v] of Object.entries(dlActive)) if (k.startsWith(cid + '/')) active[k.slice(cid.length + 1)] = v;
  return { files: dlScan(cid), active, ffmpeg: !!findBin('ffmpeg') };
});
ipcMain.handle('dl:start', (_e, cid, vids) => {
  if (!okId(cid) || !Array.isArray(vids)) return false;
  const have = dlScan(cid);
  for (const vid of vids) {
    if (!VID_RE.test(vid) || have[vid] || dlActive[cid + '/' + vid]) continue;
    const job = { cid, vid }; dlQueue.push(job); dlEmit(job, 'queued');
  }
  dlNext(); return true;
});
ipcMain.handle('dl:cancel', (_e, cid, vid) => { if (okId(cid)) dlCancel(cid, vid && VID_RE.test(vid) ? vid : undefined); return true; });
ipcMain.handle('dl:delete', (_e, cid, vid) => {
  if (!okId(cid)) return false;
  if (vid && VID_RE.test(vid)) dlWipe(cid, vid); else { dlCancel(cid); fs.rmSync(dlDir(cid), { recursive: true, force: true }); }
  return true;
});
ipcMain.handle('dl:open', (_e, cid) => { if (!okId(cid)) return ''; fs.mkdirSync(dlDir(cid), { recursive: true }); return shell.openPath(dlDir(cid)); });
const VID_RE = /^[\w-]{6,20}$/;

// ---------- video chapters (from yt-dlp) ----------
ipcMain.handle('chapters:get', async (_e, vid) => {
  if (!VID_RE.test(String(vid))) return null;
  try {
    const bin = await ensureYtDlp(() => {});
    const out = await run(bin, ['--skip-download', '--no-playlist', '--no-warnings', '--print', '%(chapters)j', 'https://www.youtube.com/watch?v=' + vid]);
    const j = JSON.parse(out.trim().split('\n').filter(Boolean).pop() || 'null');
    if (!Array.isArray(j)) return [];
    return j.filter((c) => c && typeof c.start_time === 'number')
      .map((c) => ({ t: Math.floor(c.start_time), end: Math.floor(c.end_time || 0), title: String(c.title || '').slice(0, 120) }));
  } catch { return null; } // null = could not fetch, try again next time
});

// ---------- Do Not Disturb while studying (GNOME) ----------
const DND_KEY = ['org.gnome.desktop.notifications', 'show-banners'];
const dndFile = () => path.join(app.getPath('userData'), 'dnd-prev');
let dndPrev = null;
const gs = (a) => new Promise((res) => execFile('gsettings', a, (e, out) => res(e ? null : out.trim())));
async function setDnd(on) {
  if (on) {
    const cur = await gs(['get', ...DND_KEY]);
    if (cur === null) return false; // not GNOME / gsettings missing
    if (cur === 'false' && dndPrev === null) return true; // already muted by another app (e.g. Anchor): don't touch or restore it
    if (dndPrev === null) { dndPrev = cur; try { fs.writeFileSync(dndFile(), cur); } catch {} }
    await gs(['set', ...DND_KEY, 'false']);
    return true;
  }
  if (dndPrev !== null) { await gs(['set', ...DND_KEY, dndPrev]); dndPrev = null; try { fs.rmSync(dndFile(), { force: true }); } catch {} }
  return true;
}
function restoreDndSync() { // also recovers after a crash
  try {
    const v = dndPrev !== null ? dndPrev : (fs.existsSync(dndFile()) ? fs.readFileSync(dndFile(), 'utf8').trim() : null);
    if (v === 'true' || v === 'false') execFileSync('gsettings', ['set', ...DND_KEY, v]);
    dndPrev = null; fs.rmSync(dndFile(), { force: true });
  } catch {}
}

// ---------- captions / audio-track control inside the embed frame ----------
const FP = `const p=document.getElementById('movie_player');`;
const FRAME_OPS = {
  audioList: () => `(()=>{${FP}if(!p||!p.getAvailableAudioTracks)return null;
    const info=(t)=>{for(const k of Object.keys(t)){const v=t[k];if(v&&typeof v==='object'&&'isAutoDubbed' in v)return v}return {}};
    const l=p.getAvailableAudioTracks()||[];const c=p.getAudioTrack&&p.getAudioTrack();
    return {tracks:l.map((t,i)=>{const x=info(t);return {i,name:x.name||('Track '+(i+1)),dubbed:!!x.isAutoDubbed,def:!!x.isDefault}}),cur:c?l.findIndex(t=>t.id===c.id):-1}})()`,
  audioSet: (i) => `(()=>{${FP}const l=p.getAvailableAudioTracks();if(!l[${+i}])return false;p.setAudioTrack(l[${+i}]);return true})()`,
  ccList: () => `(()=>{${FP}if(!p||!p.getOption)return null;try{p.loadModule('captions')}catch(e){}
    let l=p.getOption('captions','tracklist')||[];
    if(!l.length&&p.getAvailableAudioTracks){const a=p.getAvailableAudioTracks()||[];const c=p.getAudioTrack&&p.getAudioTrack();
      const t=(c&&a.find(x=>x.id===c.id))||a[0];l=(t&&t.captionTracks)||[]}
    const seen={};const out=[];for(const t of l){if(seen[t.languageCode])continue;seen[t.languageCode]=1;out.push({code:t.languageCode,name:t.displayName||t.languageName,kind:t.kind||'',tr:!!t.isTranslateable})}
    const c=p.getOption('captions','track')||{};return {tracks:out,cur:c.languageCode||null}})()`,
  ccSet: (code) => `(()=>{${FP}try{p.loadModule('captions')}catch(e){}p.setOption('captions','track',${JSON.stringify(code ? { languageCode: String(code) } : {})});return true})()`,
  ccOff: () => `(()=>{${FP}p.setOption('captions','track',{});try{p.unloadModule('captions')}catch(e){}return true})()`,
};
function embedFrame(wc) {
  return wc.mainFrame.framesInSubtree.find((f) => /^https:\/\/www\.youtube(-nocookie)?\.com\/embed\//.test(f.url));
}
ipcMain.handle('player:op', async (e, op, arg) => {
  const f = embedFrame(e.sender), mk = FRAME_OPS[op];
  if (!f || !mk) return null;
  try { return await f.executeJavaScript(mk(arg)); } catch { return null; }
});

function setupAdBlock(session, getWin) {
  session.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (d, cb) => {
    let block = false;
    try {
      const u = new URL(d.url);
      if (u.hostname !== '127.0.0.1') {
        block = AD_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith('.' + h)) ||
          (/(^|\.)youtube\.com$|(^|\.)googlevideo\.com$/.test(u.hostname) && AD_PATHS.some((r) => r.test(u.pathname + u.search)));
      }
    } catch {}
    cb({ cancel: block });
  });
  const w = getWin();
  w.webContents.on('did-frame-finish-load', (_e, isMain, pid, rid) => {
    if (isMain) return;
    const { webFrameMain } = require('electron');
    const f = webFrameMain.fromId(pid, rid);
    if (f && /^https:\/\/www\.youtube(-nocookie)?\.com\/embed\//.test(f.url)) {
      f.executeJavaScript(AD_SKIPPER).catch(() => {});
    }
  });
}

// ---------- window ----------
function pushUrl(url) {
  if (win && !win.webContents.isLoading()) win.webContents.send('incoming-url', url);
  else pendingUrl = url;
}
function createWindow() {
  win = new BrowserWindow({
    width: 1400, height: 880, minWidth: 960, minHeight: 600, backgroundColor: '#1c1d1f',
    title: 'Playlearn', autoHideMenuBar: true,
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  setupAdBlock(win.webContents.session, () => win);
  win.loadURL(`http://127.0.0.1:${port}/`);
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('did-finish-load', () => {
    if (pendingUrl) { win.webContents.send('incoming-url', pendingUrl); pendingUrl = null; }
  });
}

const urlArg = (argv) => argv.find((a) => /^https?:\/\//.test(a) || /^ytcourse:/.test(a));

if (process.platform === 'linux') app.setDesktopName('playlearn.desktop');
if (IS_WIN) app.setAppUserModelId('com.rahul1015s.playlearn');
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', (_e, argv) => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
    const u = urlArg(argv); if (u) pushUrl(u);
  });
  app.whenReady().then(async () => {
    // one-time migration from the old "YT Course" app name
    try {
      const old = path.join(app.getPath('appData'), 'YT Course', 'courses');
      if (fs.existsSync(old) && !fs.existsSync(dataDir())) fs.cpSync(old, dataDir(), { recursive: true });
    } catch {}
    restoreDndSync();
    port = await startServer();
    ipcMain.handle('courses:list', () => listCourses());
    ipcMain.handle('courses:get', (_e, id) => readCourse(id));
    ipcMain.handle('courses:save', (_e, c) => { writeCourse(c); return true; });
    ipcMain.handle('courses:delete', (_e, id) => { if (okId(id)) { dlCancel(id); fs.rmSync(dlDir(id), { recursive: true, force: true }); } fs.rmSync(courseFile(id), { force: true }); return true; });
    ipcMain.handle('courses:refresh', async (e, id) => {
      try { if (!okId(id)) throw new Error('Bad course id'); return { ok: true, ...(await refreshCourse(id, (m) => e.sender.send('import-status', m))) }; }
      catch (err) { return { ok: false, error: err.message }; }
    });
    ipcMain.handle('courses:import', async (e, url) => {
      try { return { ok: true, course: await importPlaylist(url, (m) => e.sender.send('import-status', m)) }; }
      catch (err) { return { ok: false, error: err.message }; }
    });
    ipcMain.handle('videos:resolve', async (e, text) => {
      try { return { ok: true, ...(await resolveVideos(text, (m) => e.sender.send('import-status', m))) }; }
      catch (err) { return { ok: false, error: err.message }; }
    });
    ipcMain.handle('dnd:set', (_e, on) => setDnd(!!on));
    ipcMain.handle('open-external', (_e, u) => shell.openExternal(u));
    pendingUrl = urlArg(process.argv.slice(1)) || null;
    createWindow();
  });
  app.on('window-all-closed', () => app.quit());
  app.on('will-quit', restoreDndSync);
}
