// ---------- websites as courses: sidebar → lessons, code / diagram blocks, lazy loading, refresh, offline sections ----------
// Uses globals from reader.js / app.js at call time only (extractArticle, prepareResolved, normUrl, hash36, esc, C, cur, api, queueSave, toast).

const STUB_SEC = 300;
const SITE_CANON = (u) => { const x = new URL(u); return x.protocol + '//' + x.hostname.replace(/^www\./, '') + x.pathname.replace(/\/+$/, ''); };

/** Find the sidebar / table of contents of a docs or course site: the links under the page's path prefix inside one container. */
function siteDiscover(html, pageUrl) {
  let page; try { page = new URL(pageUrl); } catch { return null; }
  const host = page.hostname.replace(/^www\./, '');
  const segs = page.pathname.split('/').filter(Boolean);
  if (segs.length < 2) return null;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const skipExt = /\.(pdf|png|jpe?g|gif|svg|webp|zip|mp4|mp3|xml|json|css|js)$/i;
  const all = [];
  for (const a of doc.querySelectorAll('a[href]')) {
    const href = (a.getAttribute('href') || '').trim();
    if (!href || href.startsWith('#') || /^(javascript|mailto):/i.test(href)) continue;
    let u; try { u = new URL(href, pageUrl); } catch { continue; }
    if (!/^https?:$/.test(u.protocol) || u.hostname.replace(/^www\./, '') !== host || skipExt.test(u.pathname)) continue;
    all.push({ el: a, url: SITE_CANON(u.href), path: u.pathname.replace(/\/+$/, '') });
  }
  let links = null;
  for (let n = segs.length - 1; n >= 1; n--) {
    const prefix = '/' + segs.slice(0, n).join('/') + '/';
    const m = all.filter((x) => x.path.startsWith(prefix));
    if (new Set(m.map((x) => x.url)).size >= 4) { links = m; break; }
  }
  if (!links) return null;
  const total = new Set(links.map((x) => x.url)).size;
  const sets = new Map();
  for (const l of links) for (let p = l.el; p; p = p.parentElement) { let s = sets.get(p); if (!s) sets.set(p, (s = new Set())); s.add(l.url); }
  const need = Math.max(4, Math.ceil(total * 0.8));
  const depth = (e) => { let d = 0; for (let p = e.parentElement; p; p = p.parentElement) d++; return d; };
  let root = null, best = -1;
  for (const l of links) {
    let p = l.el.parentElement;
    while (p && (sets.get(p) ? sets.get(p).size : 0) < need) p = p.parentElement;
    if (p) { const d = depth(p); if (d > best) { best = d; root = p; } }
  }
  if (!root) return null;
  const labelCache = new Map();
  const label = (s) => {
    if (labelCache.has(s)) return labelCache.get(s);
    let r = null;
    if (/^(BUTTON|SUMMARY|H[1-6])$/.test(s.tagName) || s.getAttribute('role') === 'button') {
      const leaf = [...s.querySelectorAll('*')].find((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.nodeValue.trim()));
      const t = ((leaf ? [...leaf.childNodes].filter((n) => n.nodeType === 3).map((n) => n.nodeValue).join('') : [...s.childNodes].filter((n) => n.nodeType === 3).map((n) => n.nodeValue).join('')) || '').replace(/\s+/g, ' ').trim();
      if (t.length >= 2 && t.length <= 90) r = t;
    }
    labelCache.set(s, r); return r;
  };
  const sectionOf = (a) => { for (let p = a; p && p !== root; p = p.parentElement) { const s = p.previousElementSibling; if (s) { const l = label(s); if (l) return l; } } return null; };
  const byEl = new Map(links.map((l) => [l.el, l]));
  const seen = new Set(), items = [];
  for (const a of root.querySelectorAll('a[href]')) {
    const l = byEl.get(a); if (!l || seen.has(l.url)) continue;
    const title = (a.textContent || a.getAttribute('title') || a.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim();
    if (!title) continue;
    seen.add(l.url); items.push({ title: title.slice(0, 160), url: l.url, section: sectionOf(a) });
  }
  if (items.length < 4) return null;
  const parts = (doc.title || '').split(/\s+[|–—-]\s+/).map((x) => x.trim()).filter(Boolean);
  const title = parts.length >= 3 ? parts.slice(1).join(' – ') : parts.length === 2 ? parts[1] : parts[0] || host;
  return { title, items };
}

// ----- code samples / diagrams that the page draws with JavaScript (Next.js "flight" data) -----
function flightText(html) {
  const marker = 'self.__next_f.push([1,"'; let from = html.indexOf(marker), out = '';
  while (from >= 0) {
    const start = from + marker.length; let i = start;
    while (i < html.length) { const c = html[i]; if (c === '\\') i += 2; else if (c === '"') break; else i++; }
    if (i >= html.length) break;
    try { out += JSON.parse('"' + html.slice(start, i) + '"'); } catch {}
    from = html.indexOf(marker, i);
  }
  return out;
}
function flightItems(html) {
  const f = flightText(html); if (!f) return [];
  const out = [];
  const textOf = (e) => {
    if (typeof e === 'string') return e;
    if (Array.isArray(e)) return e.length >= 4 && e[0] === '$' ? textOf((e[3] || {}).children) : e.map(textOf).join('');
    return '';
  };
  let off = 0;
  for (const raw of f.split('\n')) {
    const at = off; off += raw.length + 1;
    const i = raw.indexOf(':'); if (i < 1 || i > 8 || raw.length < i + 3) continue;
    const body = raw.slice(i + 1);
    const textRow = /^\["\$","(p|h\d|ul|ol|li)"/.test(body), sim = body.includes('"blockType":"simulationBlock"');
    if (sim) { out.push({ at, block: { k: 'q', h: esc('▶ Interactive animation – this lesson has one on the website'), t: 'Interactive animation – this lesson has one on the website' } }); continue; }
    if (!textRow) continue;
    try { const t = textOf(JSON.parse(body)).trim(); if (t.length >= 4) out.push({ at, text: t }); } catch {}
  }
  const deref = (v) => {
    const m = /^\$([0-9a-f]{1,6})$/.exec(v); if (!m) return v;
    const at = f.startsWith(m[1] + ':T') ? 0 : f.indexOf('\n' + m[1] + ':T') + 1; if (at <= 0 && !f.startsWith(m[1] + ':T')) return v;
    const comma = f.indexOf(',', at); const len = parseInt(f.slice(at + m[1].length + 2, comma), 16); if (!(len > 0)) return v;
    const enc = new TextEncoder(); let t = f.substr(comma + 1, len); while (t.length && enc.encode(t).length > len) t = t.slice(0, -1);
    return t;
  };
  const jstr = (s, p) => { let i = p; while (i < s.length) { const c = s[i]; if (c === '\\') i += 2; else if (c === '"') break; else i++; } if (i >= s.length) return null; try { return [JSON.parse('"' + s.slice(p, i) + '"'), i + 1]; } catch { return null; } };
  let k = f.indexOf('"mermaidCode":"');
  while (k >= 0) {
    const r = jstr(f, k + 15);
    if (r && r[0].trim()) out.push({ at: k, block: { k: 'mermaid', h: '', t: deref(r[0]) } });
    k = f.indexOf('"mermaidCode":"', r ? r[1] : k + 15);
  }
  k = f.indexOf('"codeBlocks":[');
  while (k >= 0) {
    let end = f.indexOf('"codeBlocks":[', k + 14); if (end < 0) end = f.length;
    const cands = []; let c = f.indexOf('"code":"', k);
    while (c >= 0 && c < end) {
      const r = jstr(f, c + 8); if (!r) break;
      let lang = ''; if (f.startsWith('"blockType":"', r[1] + 1)) { const l = jstr(f, r[1] + 1 + 13); if (l) lang = l[0]; }
      if (r[0].trim()) cands.push([deref(r[0]), lang]);
      c = f.indexOf('"code":"', r[1]);
    }
    const pick = cands.find((x) => x[1] === 'java') || cands[0];
    if (pick) out.push({ at: k, block: { k: 'code', h: '', t: pick[0].replace(/\s+$/, ''), alt: pick[1] } });
    k = end >= f.length ? -1 : end;
  }
  return out.sort((a, b) => a.at - b.at);
}
/** Slot the code / diagram blocks into the text blocks read from the HTML, next to the paragraph that precedes them. */
function mergeFlight(dom, html) {
  let its; try { its = flightItems(html); } catch { return dom; }
  if (!its.some((x) => x.block)) return dom;
  const norm = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  const keys = dom.map((b) => norm(b.t).slice(0, 24));
  const matched = its.map(() => -1); let ptr = 0;
  its.forEach((it, n) => {
    if (!it.text) return;
    const k = norm(it.text).slice(0, 24); if (k.length < 6) return;
    for (let j = ptr; j < Math.min(dom.length, ptr + 60); j++) if (keys[j] && (keys[j].startsWith(k.slice(0, 12)) || k.startsWith(keys[j].slice(0, 12)))) { matched[n] = j; ptr = j + 1; break; }
  });
  const ins = [];
  its.forEach((it, n) => {
    if (!it.block) return;
    let prev = -1, next = -1;
    for (let q = n - 1; q >= 0; q--) if (matched[q] >= 0) { prev = q; break; }
    for (let q = n + 1; q < its.length; q++) if (matched[q] >= 0) { next = q; break; }
    ins.push([prev >= 0 ? matched[prev] + 1 : next >= 0 ? matched[next] : dom.length, n, it.block]);
  });
  ins.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const out = []; let s = 0;
  for (let i = 0; i <= dom.length; i++) { while (s < ins.length && ins[s][0] === i) out.push(ins[s++][2]); if (i < dom.length) out.push(dom[i]); }
  return out;
}

// ----- Mermaid diagrams (library bundled with the app, works offline) -----
let mermaidLoad = null;
function loadMermaid() {
  if (window.mermaid) return Promise.resolve(window.mermaid);
  if (!mermaidLoad) mermaidLoad = new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'mermaid.min.js'; s.onload = () => res(window.mermaid); s.onerror = () => rej(new Error('mermaid')); document.head.appendChild(s); });
  return mermaidLoad;
}
let mmSeq = 0;
async function drawMermaid(root) {
  const els = [...root.querySelectorAll('.mmd:not([data-done])')]; if (!els.length) return;
  let m; try { m = await loadMermaid(); } catch { els.forEach((e) => { e.dataset.done = '1'; e.textContent = 'Could not load the diagram library.'; }); return; }
  m.initialize({ startOnLoad: false, securityLevel: 'strict', suppressErrorRendering: true, theme: document.documentElement.dataset.theme === 'dark' ? 'dark' : 'default' });
  const clean = () => document.querySelectorAll('body > [id^="dmm"], body > svg[id^="mm"], body > div[id^="dmm"]').forEach((n) => n.remove());
  const variants = (c) => {
    const v = [c];
    const fix = c.replace(/\\n/g, '<br/>').replace(/\r/g, '').replace(/^\s*```(?:mermaid)?\s*|\s*```\s*$/g, '').replace(/&quot;/g, '"').replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');
    if (fix !== c) v.push(fix);
    // quote bare node labels like A[Some (text)] that Mermaid rejects
    v.push(fix.replace(/(\w+)\[([^\]"\n]*[()][^\]"\n]*)\]/g, '$1["$2"]'));
    return v;
  };
  for (const el of els) {
    el.dataset.done = '1';
    let ok = false;
    for (const code of variants(el.dataset.code)) {
      try { const r = await m.render('mm' + (++mmSeq), code); el.innerHTML = r.svg; ok = true; break; } catch {} finally { clean(); }
    }
    if (!ok) {
      el.classList.add('mmerr');
      el.innerHTML = '<div class="mmnote">This diagram could not be drawn here — showing its source instead.</div><pre class="mmsrc">' + (window.hljs ? hljs.highlight(el.dataset.code, { language: 'plaintext', ignoreIllegals: true }).value : esc(el.dataset.code)) + '</pre>';
    }
  }
  clean();
}

// ----- website courses -----
const isSiteCourse = (c) => !!c && !!c.custom && (!!c.url || c.lessons.some((l) => l.type === 'article' && l.section));
const refreshable = (c) => !!c && (!c.custom || isSiteCourse(c));
const isStubLesson = (l) => l.type === 'article' && !l.blocks && !!l.url;
const stubFor = (t, now) => { const u = normUrl(t.url); let host = ''; try { host = new URL(u).hostname.replace(/^www\./, ''); } catch {} return { id: 'a' + hash36(u), type: 'article', url: u, title: t.title, section: t.section || undefined, duration: STUB_SEC, channel: host, done: false, pos: 0, notes: '', addedAt: now || 0 }; };

/** Try to turn one website link into a whole course. Returns {ok, course} or null when the link is not a course page. */
async function siteCourseFromUrl(url, name) {
  const raw = await api.resolveVideos(url);
  if (!raw.ok) return raw;
  const art = raw.lessons.find((l) => l.type === 'article'); if (!art) return null;
  const toc = siteDiscover(art.html, art.url); if (!toc) return null;
  let first = null; try { first = extractArticle(art.html, art.url); } catch {}
  const here = normUrl(art.url), now = Date.now();
  let lessons = toc.items.map((t) => stubFor(t));
  const i = lessons.findIndex((l) => l.url === here);
  if (first && i >= 0) lessons[i] = { ...lessons[i], ...first, title: lessons[i].title, section: lessons[i].section, done: false, pos: 0, notes: '' };
  if (i < 0) lessons = [first ? { ...first, done: false, pos: 0, notes: '' } : stubFor({ title: toc.title, url: art.url })].concat(lessons);
  const id = 'c' + now.toString(36) + Math.random().toString(36).slice(2, 6);
  return { ok: true, course: { id, custom: true, title: (name || '').trim() || toc.title, channel: '', url: art.url, thumbnail: (first && first.image) || '', createdAt: now, lastOpened: now, lastLesson: lessons[0].id, lessons } };
}

/** Re-read a website course's sidebar and add pages that are new. Never removes or changes anything that is already saved. */
async function refreshSite(id) {
  const c = await api.get(id); if (!c) return { ok: false, error: 'Course not found' };
  const entries = [...new Set([(c.lessons.find((l) => l.id === c.lastLesson) || {}).url, c.url, (c.lessons.find((l) => l.url) || {}).url, ([...c.lessons].reverse().find((l) => l.url) || {}).url].filter(Boolean))];
  let toc = null, lastErr = 'Could not read the website';
  for (const e of entries) {
    const raw = await api.resolveVideos(e);
    if (!raw.ok) { lastErr = raw.error; if (/network|connect|resolve|timed out|dns/i.test(raw.error || '')) break; continue; }
    const art = raw.lessons.find((l) => l.type === 'article'); if (!art) continue;
    toc = siteDiscover(art.html, art.url); if (toc) break; lastErr = 'Could not find the course sidebar on that page';
  }
  if (!toc) return { ok: false, error: lastErr };
  const fresh = await api.get(id); const now = Date.now(); let anchor = -1, added = 0;
  for (const t of toc.items) {
    const s = stubFor(t, now), idx = fresh.lessons.findIndex((l) => l.id === s.id);
    if (idx >= 0) anchor = idx; else { fresh.lessons.splice(anchor + 1, 0, s); anchor++; added++; }
  }
  fresh.refreshedAt = now; await api.save(fresh);
  return { ok: true, added, removed: 0, kept: 0, course: fresh };
}
const refreshAny = async (id) => { const c = await api.get(id); return isSiteCourse(c) ? refreshSite(id) : api.refreshCourse(id); };

/** Download + read one website lesson (used when you open an empty lesson, and by "save section for offline"). */
async function fetchArticleLesson(url) {
  const raw = await api.resolveVideos(url);
  if (!raw.ok) throw new Error(raw.error);
  const r = prepareResolved(raw);
  if (!r.lessons.length) throw new Error(r.errors[0] || 'no readable text found');
  return r.lessons[0];
}
const applyArticle = (l, f) => Object.assign(l, { blocks: f.blocks, words: f.words, duration: f.duration, byline: f.byline || l.byline, image: f.image || l.image, v: 2 });

const stubBusy = new Set();
async function loadStub(i, prefetch) {
  const course = C, L = course.lessons[i]; if (!L || !isStubLesson(L) || stubBusy.has(L.id)) return;
  stubBusy.add(L.id);
  try {
    const f = await fetchArticleLesson(L.url);
    const cur2 = course.lessons.find((x) => x.id === L.id); if (cur2) applyArticle(cur2, f);
    if (C === course) queueSave();
    if (C === course && !prefetch) {
      if (C.lessons[cur] && C.lessons[cur].id === L.id) renderReader(C.lessons[cur]);
      const nx = C.lessons[C.lessons.findIndex((x) => x.id === L.id) + 1]; if (nx && isStubLesson(nx)) loadStub(C.lessons.indexOf(nx), true);
    }
  } catch (e) {
    if (!prefetch && C === course && C.lessons[cur] && C.lessons[cur].id === L.id) renderReaderError(L, e.message);
  } finally { stubBusy.delete(L.id); }
}
function renderReaderLoading(L) { document.getElementById('reader').innerHTML = `<div class="rpage rstate"><div class="spinner"></div><p>Loading “${esc(L.title)}”…</p></div>`; }
function renderReaderError(L, msg) {
  const noText = /no readable text/i.test(msg || '');
  document.getElementById('reader').innerHTML = `<div class="rpage rstate"><h3>Could not load this page</h3><p>${esc(noText ? 'This page has no readable text – it is probably a visual or interactive page. Open it in the browser, or mark it done and move on.' : msg)}</p>
    <div class="nrow" style="justify-content:center"><button class="btn" id="rRetry">Retry</button><button class="btn ghost" id="rOpen">Open in browser</button><button class="btn ghost" id="rSkip">Mark as done</button></div></div>`;
  document.getElementById('rRetry').onclick = () => { renderReaderLoading(L); loadStub(C.lessons.findIndex((x) => x.id === L.id)); };
  document.getElementById('rOpen').onclick = () => api.openExternal(L.url);
  document.getElementById('rSkip').onclick = () => setDone(C.lessons.findIndex((x) => x.id === L.id), true);
}
/** Lessons saved by an older reader (no code / diagrams) and untouched by you are refreshed quietly in the background. */
function needsUpgrade(l) { return l.type === 'article' && l.url && l.blocks && (l.v || 0) < 2 && !l.blocks.some((b) => b.hl || b.c !== undefined || b.x); }
async function upgradeLesson(L) {
  const course = C; if (!needsUpgrade(L) || stubBusy.has(L.id)) return; stubBusy.add(L.id);
  try {
    const f = await fetchArticleLesson(L.url);
    if (needsUpgrade(L)) { Object.assign(L, { blocks: f.blocks, words: f.words, v: 2 }); if (C === course) { queueSave(); if (C.lessons[cur] === L) renderReader(L); } }
  } catch {} finally { stubBusy.delete(L.id); }
}

// ----- sections (real titles for website courses, blocks of SECTION_SIZE otherwise) + offline per section -----
function lessonGroups(c) {
  const ls = c.lessons;
  if (!ls.some((l) => l.section)) { const n = Math.ceil(ls.length / SECTION_SIZE), g = []; for (let s = 0; s < n; s++) g.push({ title: null, a: s * SECTION_SIZE, b: Math.min((s + 1) * SECTION_SIZE, ls.length) }); return g; }
  const g = []; let a = 0;
  for (let i = 1; i <= ls.length; i++) if (i === ls.length || ls[i].section !== ls[a].section) { g.push({ title: ls[a].section || 'Other', a, b: i }); a = i; }
  return g;
}
const groupIndexOf = (c, i) => { const g = lessonGroups(c); const k = g.findIndex((x) => i >= x.a && i < x.b); return k < 0 ? 0 : k; };
const secDl = new Map(); // "courseId/s" -> {done,total}
async function downloadSection(s) {
  const course = C, g = lessonGroups(C)[s], key = course.id + '/' + s; if (!g || secDl.has(key)) return;
  const todo = course.lessons.slice(g.a, g.b).filter(isStubLesson);
  if (!todo.length) return;
  secDl.set(key, { done: 0, total: todo.length }); renderList();
  let failed = 0, k = 0;
  const worker = async () => {
    while (k < todo.length) {
      const L = todo[k++];
      try { const f = await fetchArticleLesson(L.url); applyArticle(L, f); } catch { failed++; }
      secDl.get(key).done++; if (C === course) { queueSave(); renderList(); }
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  secDl.delete(key);
  if (C === course) { renderList(); if (tab === 'overview') renderPane(); }
  toast(failed ? `Saved ${todo.length - failed} lessons · ${failed} could not be loaded (visual pages or no connection)` : `Saved ${todo.length} lessons for offline`, !!failed && failed === todo.length);
}
