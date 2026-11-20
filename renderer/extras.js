// Extras: global search (Ctrl+K), article contents + reading progress, flashcard review (spaced repetition),
// shortcuts sheet (?), update check, persisted autoplay. Loaded after app.js so it can use its globals.
(() => {
  const APP_VERSION = '1.8.0';
  const $q = (s, r = document) => r.querySelector(s);
  const modalOpen = () => !!document.getElementById('modal');
  const typing = () => /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) || (document.activeElement && document.activeElement.isContentEditable);
  const mk = (html, cls = '') => {
    const bg = document.createElement('div'); bg.className = 'modal-bg'; bg.id = 'modal';
    bg.innerHTML = `<div class="modal ${cls}" role="dialog" aria-modal="true">${html}</div>`;
    document.body.appendChild(bg);
    bg.onmousedown = (e) => { if (e.target === bg) bg.remove(); };
    return bg;
  };
  const fmt = (t) => (typeof fmtT === 'function' ? fmtT(t) : Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0'));
  const re = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const mark = (text, ws) => {
    const s = esc(text); if (!ws.length) return s;
    return s.replace(new RegExp('(' + ws.map((w) => re(esc(w))).join('|') + ')', 'gi'), '<mark>$1</mark>');
  };
  const snippet = (text, ws, n = 110) => {
    const t = String(text).replace(/\s+/g, ' '), k = Math.max(0, t.toLowerCase().indexOf(ws[0]) - 35);
    return (k ? '…' : '') + t.slice(k, k + n) + (t.length > k + n ? '…' : '');
  };

  // ---------------- global search ----------------
  let corpus = null;
  async function buildCorpus() {
    const all = await api.list(); const rows = [];
    for (const c of all) {
      rows.push({ k: 'course', cid: c.id, ci: c.title, text: c.title + ' ' + (c.channel || '') + ' ' + (c.tags || []).join(' ') });
      c.lessons.forEach((l, i) => {
        const base = { cid: c.id, i, ci: c.title, li: l.title };
        rows.push({ ...base, k: 'lesson', text: l.title });
        if (l.notes) rows.push({ ...base, k: 'note', text: l.notes });
        (l.marks || []).forEach((m) => rows.push({ ...base, k: 'mark', t: m.t, text: m.text }));
        (l.chapters || []).forEach((m) => rows.push({ ...base, k: 'chapter', t: m.t, text: m.title }));
        (l.blocks || []).forEach((b, bi) => { if (!b.x) { if (b.t) rows.push({ ...base, k: b.k === 'code' ? 'code' : 'text', b: bi, text: b.t }); if (b.c) rows.push({ ...base, k: 'comment', b: bi, text: b.c }); } });
      });
    }
    return rows;
  }
  const KIND = { course: 'Course', lesson: 'Lesson', note: 'Notes', mark: 'Video note', chapter: 'Chapter', text: 'Article', code: 'Code', comment: 'Comment' };
  async function openResult(r) {
    await openCourse(r.cid);
    if (r.i !== undefined) {
      const id = C.lessons[r.i].id;
      if (r.b !== undefined) pendingBlock = { id, b: r.b };
      if (r.t !== undefined) pendingSeek = { id, t: r.t };
      select(r.i);
    }
  }
  async function globalSearch() {
    if (modalOpen()) return;
    const bg = mk(`<div class="gs"><input id="gsIn" placeholder="Search every course, lesson, note, chapter and article…" autocomplete="off" spellcheck="false"><div class="gsres" id="gsRes"><div class="hint">Loading…</div></div><div class="gsfoot"><kbd>↑↓</kbd> move <kbd>Enter</kbd> open <kbd>Esc</kbd> close</div></div>`, 'gsmodal');
    const inp = $q('#gsIn', bg), res = $q('#gsRes', bg); inp.focus();
    corpus = await buildCorpus();
    let hits = [], sel = 0, timer = null;
    const draw = () => {
      const ws = inp.value.toLowerCase().split(/\s+/).filter(Boolean);
      if (!ws.length) { hits = []; res.innerHTML = `<div class="hint">${corpus.length.toLocaleString()} items indexed. Start typing.</div>`; return; }
      const score = (r) => { const tl = r.text.toLowerCase(); let s = ({ course: 5, lesson: 4, chapter: 3, mark: 3, comment: 3, note: 2, text: 1, code: 1 })[r.k]; if (tl.startsWith(ws[0])) s += 2; return s; };
      hits = corpus.filter((r) => { const tl = r.text.toLowerCase(); return ws.every((w) => tl.includes(w)); }).sort((a, b) => score(b) - score(a)).slice(0, 60);
      sel = 0;
      res.innerHTML = hits.length ? hits.map((r, n) => `<div class="gsr ${n === 0 ? 'on' : ''}" data-n="${n}"><span class="gsk">${KIND[r.k]}${r.t !== undefined ? ' · ' + fmt(r.t) : ''}</span><div><b>${mark(r.k === 'course' ? r.text.split(' ').slice(0, 14).join(' ') : snippet(r.text, ws), ws)}</b><small>${esc(r.ci)}${r.li && r.k !== 'lesson' ? ' › ' + esc(r.li) : ''}</small></div></div>`).join('') : '<div class="hint">Nothing found.</div>';
      res.querySelectorAll('.gsr').forEach((el) => { el.onclick = () => { bg.remove(); openResult(hits[+el.dataset.n]); }; });
    };
    const move = (d) => { if (!hits.length) return; sel = (sel + d + hits.length) % hits.length; res.querySelectorAll('.gsr').forEach((el, n) => el.classList.toggle('on', n === sel)); const el = res.children[sel]; if (el) el.scrollIntoView({ block: 'nearest' }); };
    inp.oninput = () => { clearTimeout(timer); timer = setTimeout(draw, 120); };
    bg.onkeydown = (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') bg.remove();
      else if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === 'Enter' && hits[sel]) { const r = hits[sel]; bg.remove(); openResult(r); }
    };
    draw();
  }

  // ---------------- flashcards (spaced repetition) ----------------
  const SRS = () => LS.get('srs', {});
  async function cards() {
    const all = await api.list(), out = [];
    for (const c of all) for (const l of c.lessons) {
      (l.blocks || []).forEach((b, bi) => { if (!b.x && (b.hl || b.c) && b.k !== 'code' && b.k !== 'img') out.push({ id: `${l.id}:b${bi}`, cid: c.id, ci: c.title, li: l.title, text: b.t || '', note: b.c || '' }); });
      (l.marks || []).forEach((m) => out.push({ id: `${l.id}:m${m.t}`, cid: c.id, ci: c.title, li: l.title, text: m.text, at: m.t }));
    }
    return out.filter((x) => x.text && x.text.length > 3);
  }
  const dueCards = (list) => { const st = SRS(), now = Date.now(); return list.filter((c) => !st[c.id] || st[c.id].due <= now); };
  function cloze(text, id) {
    const words = text.split(/(\s+)/); let h = 0; for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const idx = words.map((w, i) => (/^[\p{L}\d_-]{5,}$/u.test(w) ? i : -1)).filter((i) => i >= 0);
    if (idx.length < 2) { const cut = Math.ceil(text.length * 0.45); return { front: esc(text.slice(0, cut)) + ' <span class="blank">…</span>', back: esc(text) }; }
    const hide = new Set(); const want = Math.max(1, Math.round(idx.length * 0.35));
    for (let k = 0; hide.size < want && k < idx.length * 3; k++) { h = (h * 1103515245 + 12345) >>> 0; hide.add(idx[h % idx.length]); }
    return { front: words.map((w, i) => (hide.has(i) ? '<span class="blank">' + '_'.repeat(Math.min(10, w.length)) + '</span>' : esc(w))).join(''), back: words.map((w, i) => (hide.has(i) ? '<b class="ans">' + esc(w) + '</b>' : esc(w))).join('') };
  }
  async function review() {
    if (modalOpen()) return;
    const list = await cards(), queue = dueCards(list).slice(0, 25);
    const bg = mk('', 'revmodal');
    const box = bg.firstElementChild;
    if (!queue.length) { box.innerHTML = `<h3>🧠 Review</h3><p class="hint">${list.length ? 'All caught up — nothing is due right now. 🎉' : 'No cards yet. Highlight blocks or add comments in articles, or press N to add timestamped notes in videos — they turn into flashcards automatically.'}</p><div class="mrow"><button class="btn ghost" id="rvX">Close</button></div>`; $q('#rvX', bg).onclick = () => bg.remove(); return; }
    let done = 0; const total = queue.length;
    const show = () => {
      const c = queue[0];
      if (!c) { box.innerHTML = `<h3>🧠 Review complete</h3><p class="hint">You reviewed ${done} card${done === 1 ? '' : 's'}. They'll come back when due.</p><div class="mrow"><button class="btn" id="rvX">Done</button></div>`; $q('#rvX', bg).onclick = () => { bg.remove(); if (typeof goHome === 'function' && document.querySelector('.home')) goHome(); }; return; }
      const z = cloze(c.text, c.id);
      box.innerHTML = `<div class="rvh"><span>${done}/${total}</span><i style="--p:${(done / total) * 100}%"></i></div><small class="rvsrc">${esc(c.ci)} › ${esc(c.li)}${c.at !== undefined ? ' · ' + fmt(c.at) : ''}</small>
        <div class="rvcard" id="rvCard">${z.front}</div><div class="rvans" id="rvAns" hidden>${z.back}${c.note ? `<div class="rvnote">💬 ${esc(c.note)}</div>` : ''}</div>
        <div class="mrow" id="rvBtns"><button class="btn ghost" id="rvOpen">Open lesson</button><button class="btn" id="rvShow">Show answer</button></div>`;
      $q('#rvOpen', bg).onclick = () => { bg.remove(); const m = /:(b|m)(\d+)$/.exec(c.id); const l = null; openCourse(c.cid).then(() => { const i = C.lessons.findIndex((x) => c.id.startsWith(x.id + ':')); if (i >= 0) { if (m[1] === 'b') pendingBlock = { id: C.lessons[i].id, b: +m[2] }; else pendingSeek = { id: C.lessons[i].id, t: +m[2] }; select(i); } }); };
      $q('#rvShow', bg).onclick = () => {
        $q('#rvCard', bg).hidden = true; $q('#rvAns', bg).hidden = false;
        $q('#rvBtns', bg).innerHTML = '<button class="btn ghost" data-g="0">Again</button><button class="btn ghost" data-g="1">Good</button><button class="btn" data-g="2">Easy</button>';
        $q('#rvBtns', bg).querySelectorAll('[data-g]').forEach((b) => (b.onclick = () => grade(+b.dataset.g)));
      };
    };
    const grade = (g) => {
      const c = queue.shift(), st = SRS(), o = st[c.id] || { iv: 0 };
      if (g === 0) { o.iv = 1; o.due = Date.now() + 10 * 60 * 1000; queue.push(c); }
      else { o.iv = g === 1 ? Math.max(1, Math.round((o.iv || 0) * 2.3) || 1) : Math.max(4, Math.round((o.iv || 1) * 3.4)); o.due = Date.now() + o.iv * 864e5; done++; }
      st[c.id] = o; LS.set('srs', st); show();
    };
    bg.onkeydown = (e) => {
      e.stopPropagation(); if (e.key === 'Escape') bg.remove();
      const sh = $q('#rvShow', bg); if (sh && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); sh.click(); }
      else if (['1', '2', '3'].includes(e.key)) { const b = $q(`[data-g="${+e.key - 1}"]`, bg); if (b) b.click(); }
    };
    bg.tabIndex = -1; bg.focus(); show();
  }

  // ---------------- shortcuts + update check ----------------
  function shortcuts() {
    if (modalOpen()) return;
    const rows = [['Ctrl + K', 'Search everything'], ['/', 'Search lessons in this course'], ['?', 'This cheat sheet'], ['Esc', 'Back / close'], ['Space · K', 'Play / pause'], ['J · L', '±10 seconds'], ['← →', '±5 seconds'], ['↑ ↓', 'Volume'], ['< >  or  , .', 'Speed'], ['[ ]', 'Previous / next chapter'], ['N', 'Note at this moment'], ['C', 'Captions'], ['F', 'Fullscreen'], ['Z', 'Focus mode'], ['M', 'Mute'], ['Shift + N / P', 'Next / previous lesson'], ['Alt + ←', 'Home']];
    const bg = mk(`<h3>Keyboard shortcuts</h3><div class="kbgrid">${rows.map(([k, d]) => `<kbd>${esc(k)}</kbd><span>${esc(d)}</span>`).join('')}</div><div class="mrow"><small id="upMsg" class="hint" style="flex:1;margin:0">Playlearn ${APP_VERSION}</small><button class="btn ghost" id="upBtn">Check for updates</button><button class="btn" id="kbX">Close</button></div>`);
    $q('#kbX', bg).onclick = () => bg.remove(); bg.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Escape' || e.key === '?') bg.remove(); }; bg.tabIndex = -1; bg.focus();
    $q('#upBtn', bg).onclick = async () => { const m = $q('#upMsg', bg); m.textContent = 'Checking…'; const r = await checkUpdate(true); m.textContent = r; };
  }
  const vnum = (v) => String(v).replace(/^v/, '').split('.').map(Number);
  const newer = (a, b) => { const x = vnum(a), y = vnum(b); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; };
  async function checkUpdate(manual) {
    try {
      const r = await fetch('https://api.github.com/repos/rave10x/playlearn/releases/latest', { headers: { accept: 'application/vnd.github+json' } });
      if (!r.ok) return manual ? 'No published releases found to compare against.' : '';
      const j = await r.json();
      if (newer(j.tag_name, APP_VERSION)) {
        const msg = `Playlearn ${j.tag_name} is available`;
        if (!manual) { toast(msg + ' — press ? then “Check for updates”'); } else if (j.html_url) { api.openExternal(j.html_url); }
        return msg + ' — opened the release page.';
      }
      return manual ? `You're up to date (${APP_VERSION}).` : '';
    } catch { return manual ? 'Could not reach GitHub (offline?).' : ''; }
  }

  // ---------------- article contents + reading progress ----------------
  const _rr = renderReader;
  renderReader = function (L) {
    _rr(L);
    try { enhanceReader(L); } catch (e) { console.error(e); }
    repairRefs(L);
  };
  // lessons saved by an older version can hold placeholders like "$14a" instead of the real diagram/code text
  const badRef = (b) => (b.k === 'mermaid' || b.k === 'code') && /^\$[0-9a-f]{1,6}$/.test(String(b.t || '').trim());
  const repairing = new Set();
  async function repairRefs(L) {
    if (!L.blocks || !L.url || repairing.has(L.id) || !L.blocks.some(badRef)) return;
    repairing.add(L.id); const course = C;
    try {
      const f = await fetchArticleLesson(L.url), fresh = { mermaid: f.blocks.filter((b) => b.k === 'mermaid'), code: f.blocks.filter((b) => b.k === 'code') };
      const seen = { mermaid: 0, code: 0 }; let fixed = 0;
      L.blocks.forEach((b) => { if (b.k !== 'mermaid' && b.k !== 'code') return; const n = fresh[b.k][seen[b.k]++]; if (badRef(b) && n && !badRef(n)) { b.t = n.t; if (n.alt) b.alt = n.alt; fixed++; } });
      if (fixed && C === course) { queueSave(); if (C.lessons[cur] === L) renderReader(L); }
    } catch {} finally { repairing.delete(L.id); }
  }
  function enhanceReader(L) {
    const sc = $q('.left'), body = document.getElementById('rbody'); if (!sc || !body) return;
    let bar = $q('.rprog', sc); if (!bar) { bar = document.createElement('div'); bar.className = 'rprog'; bar.innerHTML = '<i></i>'; sc.insertBefore(bar, sc.firstChild); }
    const fill = $q('i', bar), upd = () => { const max = sc.scrollHeight - sc.clientHeight; fill.style.width = (max > 0 ? Math.min(100, (sc.scrollTop / max) * 100) : 0) + '%'; };
    if (sc._rp) sc.removeEventListener('scroll', sc._rp); sc.addEventListener('scroll', (sc._rp = upd), { passive: true }); upd();
    const hs = [...body.querySelectorAll('h2.bt,h3.bt,h4.bt')]; const tools = $q('.rtools'); if (hs.length < 3 || !tools || $q('#rToc')) return;
    const btn = document.createElement('button'); btn.className = 'btn ghost'; btn.id = 'rToc'; btn.textContent = '☰ Contents'; tools.insertBefore(btn, tools.firstChild);
    const pop = document.createElement('div'); pop.className = 'tocpop'; pop.hidden = true;
    pop.innerHTML = hs.map((h, i) => `<button data-i="${i}" class="toc${h.tagName[1]}">${esc(h.textContent)}</button>`).join('');
    tools.style.position = 'relative'; tools.appendChild(pop);
    btn.onclick = (e) => { e.stopPropagation(); pop.hidden = !pop.hidden; };
    pop.onclick = (e) => { const b = e.target.closest('[data-i]'); if (!b) return; hs[+b.dataset.i].scrollIntoView({ behavior: 'smooth', block: 'start' }); pop.hidden = true; };
    document.addEventListener('click', () => { pop.hidden = true; });
  }

  // ---------------- resume prompt ----------------
  const _mp = mountPlayer;
  mountPlayer = function () {
    const L = C.lessons[cur], pos = L.done ? 0 : L.pos || 0, fromSeek = !!(pendingSeek && pendingSeek.id === L.id);
    _mp();
    if (pos < 15 || fromSeek) return;
    const box = document.getElementById('playerBox'); if (!box) return;
    const card = document.createElement('div'); card.className = 'resumecard';
    card.innerHTML = `<span>Resumed at <b>${fmt(pos)}</b></span><button type="button" id="rsStart">Start over</button><button type="button" class="rsx" title="Dismiss">✕</button>`;
    box.appendChild(card);
    const gone = () => card.remove(); const t = setTimeout(gone, 9000);
    card.querySelector('.rsx').onclick = () => { clearTimeout(t); gone(); };
    card.querySelector('#rsStart').onclick = () => { clearTimeout(t); gone(); try { player.seekTo(0, true); L.pos = 0; queueSave(); } catch {} };
  };

  // ---------------- buttons, hotkeys, wiring ----------------
  const dueCount = async () => { try { return dueCards(await cards()).length; } catch { return 0; } };
  async function inject() {
    const hb = $q('.herobtns');
    if (hb && !$q('#gsBtn', hb)) {
      hb.insertAdjacentHTML('afterbegin', '<button class="tb-btn" id="gsBtn" title="Search everything (Ctrl+K)">🔍<span>Search</span></button><button class="tb-btn" id="rvBtn" title="Review flashcards from your highlights &amp; notes">🧠<span id="rvN">Review</span></button><button class="tb-btn" id="kbBtn" title="Keyboard shortcuts (?)">⌨</button>');
      $q('#gsBtn', hb).onclick = globalSearch; $q('#rvBtn', hb).onclick = review; $q('#kbBtn', hb).onclick = shortcuts;
      setTimeout(() => dueCount().then((n) => { const s = $q('#rvN'); if (s && n) s.textContent = `Review (${n})`; }), 800);
    }
    const tb = $q('.topbar .themeBtn');
    if (tb && !$q('#gsBtn2')) { const b = document.createElement('button'); b.className = 'tb-btn'; b.id = 'gsBtn2'; b.title = 'Search everything (Ctrl+K)'; b.textContent = '🔍'; b.onclick = globalSearch; tb.before(b); }
  }
  new MutationObserver(() => inject()).observe(document.getElementById('app'), { childList: true, subtree: false });
  inject();
  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); e.stopPropagation(); globalSearch(); return; }
    if (e.key === '?' && !typing() && !modalOpen()) { e.preventDefault(); shortcuts(); }
  }, true);
  // remember the autoplay choice
  try { autoNext = LS.get('autoNext', true); } catch {}
  document.addEventListener('change', (e) => { if (e.target && e.target.id === 'auto') LS.set('autoNext', e.target.checked); });
  // gentle daily update check
  if (Date.now() - LS.get('updChecked', 0) > 864e5) { LS.set('updChecked', Date.now()); setTimeout(() => checkUpdate(false), 4000); }
})();
