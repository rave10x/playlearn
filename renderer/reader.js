// ---------- articles: turn a web page into Notion-style blocks you can read, highlight, comment on and edit ----------
// Uses globals from app.js (C, cur, esc, fmtDur, queueSave, setDone, toast, api) at call time only.

const I_DOC = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/></svg>';

function hash36(str) {
  let a = 0x811c9dc5, b = 0x1234567;
  for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); a = Math.imul(a ^ c, 16777619); b = Math.imul(b + c, 2246822519) ^ (b >>> 13); }
  return ((a >>> 0).toString(36) + (b >>> 0).toString(36)).padStart(10, '0');
}
function normUrl(u) {
  try {
    const x = new URL(u); x.hash = '';
    for (const k of [...x.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$|ref$)/.test(k)) x.searchParams.delete(k);
    return x.href.replace(/\/$/, '');
  } catch { return u; }
}

const NOISE = 'script,style,noscript,template,nav,header,footer,aside,form,iframe,svg,button,select,dialog,canvas,[hidden],[aria-hidden="true"],' +
  '[role="navigation"],[role="banner"],[role="complementary"],[role="contentinfo"],[class~="sidebar"],[class~="comments"],[id="comments"],' +
  '[class~="related"],[class~="share"],[class~="social"],[class~="newsletter"],[class~="advert"],[class~="cookie"],[class~="breadcrumbs"]';
const BLOCK_TAGS = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'UL', 'OL', 'PRE', 'BLOCKQUOTE', 'TABLE', 'FIGURE', 'HR', 'DIV', 'SECTION', 'ARTICLE', 'MAIN', 'DETAILS', 'DL', 'FIGCAPTION', 'IMG', 'PICTURE']);

function extractArticle(html, url) {
  const doc = new DOMParser().parseFromString(html, 'text/html'); // inert: no scripts run, nothing loads
  const meta = (sel) => { const m = doc.querySelector(sel); return m ? (m.getAttribute('content') || '').trim() : ''; };
  const abs = (h) => { try { const u = new URL(h, url); return /^https?:$/.test(u.protocol) ? u.href : ''; } catch { return ''; } };
  const host = new URL(url).hostname.replace(/^www\./, '');
  const h1 = doc.querySelector('h1');
  const title = (meta('meta[property="og:title"]') || (doc.title || '').trim() || (h1 && h1.textContent.trim()) || host).replace(/\s+/g, ' ').slice(0, 200);
  const site = meta('meta[property="og:site_name"]') || host;
  const byline = (meta('meta[name="author"]') || meta('meta[property="article:author"]')).slice(0, 80);
  const image = abs(meta('meta[property="og:image"]'));
  doc.querySelectorAll(NOISE).forEach((e) => e.remove());

  const len = (e) => (e.textContent || '').replace(/\s+/g, ' ').trim().length;
  let root = null;
  const arts = [...doc.querySelectorAll('article')].sort((a, b) => len(b) - len(a));
  if (arts[0] && len(arts[0]) > 600) root = arts[0];
  if (!root) for (const sel of ['[role="main"]', 'main', '.post-content', '.entry-content', '.article-body', '.article-content', '.post-body', '.markdown-body', '#content']) {
    const e = doc.querySelector(sel); if (e && len(e) > 600) { root = e; break; }
  }
  if (!root) {
    const score = new Map();
    doc.querySelectorAll('p').forEach((p) => {
      const n = len(p); if (n < 60) return;
      const a = p.parentElement; if (!a) return;
      score.set(a, (score.get(a) || 0) + n);
      if (a.parentElement) score.set(a.parentElement, (score.get(a.parentElement) || 0) + n / 2);
    });
    let best = 0; for (const [e, v] of score) if (v > best) { best = v; root = e; }
  }
  if (!root) root = doc.body;
  if (!root) throw new Error('could not read this page');

  const one = (c) => {
    if (c.nodeType === 3) return esc(c.nodeValue.replace(/\s+/g, ' '));
    if (c.nodeType !== 1) return '';
    const t = c.tagName;
    if (t === 'B' || t === 'STRONG') return '<b>' + inl(c) + '</b>';
    if (t === 'I' || t === 'EM') return '<i>' + inl(c) + '</i>';
    if (t === 'CODE' || t === 'KBD' || t === 'SAMP') return '<code>' + esc(c.textContent) + '</code>';
    if (t === 'A') { const u = abs(c.getAttribute('href') || ''), inner = inl(c); return u && inner.trim() ? `<a href="${esc(u)}" data-ext>${inner}</a>` : inner; }
    if (t === 'BR') return ' ';
    if (t === 'IMG' || t === 'SCRIPT' || t === 'STYLE') return '';
    return inl(c);
  };
  const inl = (n) => [...n.childNodes].map(one).join('');
  const plain = (h) => { const d = document.createElement('div'); d.innerHTML = h; return d.textContent.replace(/\s+/g, ' ').trim(); };

  const out = []; let words = 0;
  const push = (k, h, extra = {}) => {
    if (out.length >= 1500) return;
    h = (h || '').trim();
    const t = k === 'code' ? extra.t : plain(h);
    if (!t && k !== 'hr' && k !== 'img') return;
    const prev = out[out.length - 1];
    if (prev && prev.k === k && prev.t === t) return;
    if (k !== 'code' && k !== 'img') words += t.split(/\s+/).length;
    out.push({ k, h, t, ...extra });
  };
  const img = (c) => {
    const raw = c.getAttribute('src') || c.getAttribute('data-src') || (c.getAttribute('srcset') || '').split(',')[0].trim().split(' ')[0];
    const src = raw && !raw.startsWith('data:') ? abs(raw) : '';
    const w = +c.getAttribute('width') || 999, h = +c.getAttribute('height') || 999;
    if (!src || w < 120 || h < 60 || /sprite|avatar|logo|icon|pixel|tracking|badge/i.test(src)) return;
    push('img', '', { src, alt: (c.getAttribute('alt') || '').slice(0, 200) });
  };
  const list = (el, depth, ordered) => {
    let n = 0;
    for (const li of el.children) {
      if (li.tagName !== 'LI') continue;
      n++;
      push('li', [...li.childNodes].filter((x) => !(x.nodeType === 1 && /^(UL|OL)$/.test(x.tagName))).map(one).join(''), { n: ordered ? n : 0, d: Math.min(depth, 3) });
      for (const sub of li.children) if (/^(UL|OL)$/.test(sub.tagName)) list(sub, depth + 1, sub.tagName === 'OL');
    }
  };
  const walk = (el) => {
    let buf = '';
    const flush = () => { if (buf.trim()) push('p', buf); buf = ''; };
    for (const c of el.childNodes) {
      if (c.nodeType === 3) { buf += esc(c.nodeValue.replace(/\s+/g, ' ')); continue; }
      if (c.nodeType !== 1) continue;
      const t = c.tagName;
      if (!BLOCK_TAGS.has(t)) { buf += one(c); continue; }
      flush();
      if (/^H[1-6]$/.test(t)) { const h = inl(c); if (plain(h) !== title) push('h', h, { lvl: t <= 'H2' ? 2 : t === 'H3' ? 3 : 4 }); }
      else if (t === 'P') push('p', inl(c));
      else if (t === 'UL' || t === 'OL') list(c, 0, t === 'OL');
      else if (t === 'PRE') push('code', '', { t: c.textContent.replace(/\n+$/, '') });
      else if (t === 'BLOCKQUOTE') push('q', inl(c));
      else if (t === 'HR') push('hr');
      else if (t === 'IMG') img(c);
      else if (t === 'TABLE') c.querySelectorAll('tr').forEach((tr) => push('p', [...tr.children].map((x) => esc(x.textContent.replace(/\s+/g, ' ').trim())).filter(Boolean).join(' | ')));
      else if (t === 'FIGURE' || t === 'PICTURE') {
        c.querySelectorAll('img').forEach(img);
        const cap = c.querySelector('figcaption'); if (cap) push('cap', inl(cap));
      } else if (t === 'FIGCAPTION') push('cap', inl(c));
      else walk(c); // div / section / article / main / details / dl
    }
    flush();
  };
  walk(root);
  // drop page chrome: everything before the heading that repeats the page title, and the footer links after the text
  const norm = (x) => String(x || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(), nt = norm(title);
  const wc = (arr) => arr.reduce((n, b) => n + (b.k === 'code' || b.k === 'img' ? 0 : (b.t || '').split(/\s+/).length), 0);
  const hi = out.findIndex((b, i) => i > 0 && b.k === 'h' && b.t.length > 15 && nt.includes(norm(b.t)));
  if (hi > 0 && wc(out.slice(hi + 1)) >= 80) out.splice(0, hi + 1);
  const fi = out.findIndex((b, i) => i > out.length * 0.4 && /^(download app|support|terms|privacy policy|copyright|©|all rights reserved|cookie)/i.test(b.t || ''));
  if (fi > 0 && wc(out.slice(0, fi)) >= 80) out.length = fi;
  words = wc(out);
  if (words < 80) throw new Error('no readable text found (the page may need JavaScript or a login)');
  const u = normUrl(url);
  return {
    id: 'a' + hash36(u), type: 'article', url: u, title, channel: site, byline, image,
    duration: Math.max(60, Math.round(words / 230 * 60)), words, blocks: typeof mergeFlight === 'function' ? mergeFlight(out, html) : out, v: 2,
  };
}

// raw result of api.resolveVideos -> { lessons, errors } with articles extracted
function prepareResolved(r) {
  const lessons = [], errors = [...(r.errors || [])], seen = new Set();
  for (const l of r.lessons) {
    let x = l;
    if (l.type === 'article') {
      try { x = extractArticle(l.html, l.url); } catch (e) { errors.push(`${l.url.slice(0, 60)} – ${e.message}`); continue; }
    }
    if (!seen.has(x.id)) { seen.add(x.id); lessons.push(x); }
  }
  return { lessons, errors };
}


// ---------- syntax colouring (tiny language-agnostic tokenizer) ----------
const KW = new Set(('abstract as async await break case catch class const continue crate def default defer del delete do elif else enum except export extends extern final finally fn for from func function go goto if impl implements import in instanceof interface is lambda let loop match mod mut namespace new not of or override package pass private protected pub public raise readonly ref return self static struct super switch synchronized this throw throws trait try type typeof unsafe use val var virtual void volatile where while with yield and select insert update create table values join on group by order limit having union distinct begin end').split(' '));
const LIT = new Set('true false null nil None True False undefined NaN Infinity'.split(' '));
const TYP = new Set('int long short byte char float double boolean bool string str String i8 i16 i32 i64 u8 u16 u32 u64 usize isize f32 f64 Integer List Map Set Array Object Vec Option Result void number any'.split(' '));
const TOK = /(\/\*[\s\S]*?\*\/|\/\/[^\n]*|#[^\n]*|--[^\n]*)|("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)|(\b0x[\da-fA-F]+\b|\b\d[\d_]*\.?\d*(?:[eE][+-]?\d+)?\b)|([A-Za-z_$][\w$]*)(\s*\()?|([{}()[\];,.:<>=!+\-*\/%&|^~?@]+)/g;
function highlightCode(src, lang) {
  if (window.hljs) {
    try {
      const l = String(lang || '').toLowerCase().replace(/^language-/, '');
      if (l && hljs.getLanguage(l)) return hljs.highlight(src, { language: l, ignoreIllegals: true }).value;
      if (!l) { const r = hljs.highlightAuto(src); if (r.relevance >= 6) return r.value; }
    } catch {}
  }
  return tinyHighlight(src, lang);
}
function tinyHighlight(src, lang) {
  const hashOk = !/^(java|c|cpp|c\+\+|cs|csharp|js|javascript|ts|typescript|go|rust|rs|kotlin|swift|php)$/i.test(lang || '');
  let out = '', last = 0, m;
  TOK.lastIndex = 0;
  while ((m = TOK.exec(src))) {
    out += esc(src.slice(last, m.index)); last = TOK.lastIndex;
    const t = m[0];
    if (m[1]) out += (t[0] === '#' && !hashOk) || (t[0] === '-' && /^(java|c|cpp|js|javascript|ts|typescript|go|rust|kotlin|swift)$/i.test(lang || '')) ? esc(t) : `<span class="tk-c">${esc(t)}</span>`;
    else if (m[2]) out += `<span class="tk-s">${esc(t)}</span>`;
    else if (m[3]) out += `<span class="tk-n">${esc(t)}</span>`;
    else if (m[4]) {
      const w = m[4], rest = m[5] ? esc(m[5]) : '';
      if (KW.has(w) || KW.has(w.toLowerCase()) && /^(sql|mysql|postgres)/i.test(lang || '')) out += `<span class="tk-k">${w}</span>${rest}`;
      else if (LIT.has(w)) out += `<span class="tk-l">${w}</span>${rest}`;
      else if (TYP.has(w) || /^[A-Z][a-z]/.test(w)) out += `<span class="tk-t">${w}</span>${rest}`;
      else if (m[5]) out += `<span class="tk-f">${w}</span>${rest}`;
      else out += esc(w);
    } else out += `<span class="tk-p">${esc(t)}</span>`;
  }
  return out + esc(src.slice(last));
}

// ---------- reader view ----------
const gutter = (t) => String(t).split('\n').map((_, i) => i + 1).join('\n');
function blockHtml(b, i) {
  const ed = 'contenteditable="plaintext-only" spellcheck="false"';
  let inner = '';
  switch (b.k) {
    case 'h': inner = `<h${b.lvl} class="bt" ${ed}>${b.h}</h${b.lvl}>`; break;
    case 'li': inner = `<div class="bt li" style="--d:${b.d || 0}" data-n="${b.n || 0}" ${ed}>${b.h}</div>`; break;
    case 'q': inner = `<blockquote class="bt" ${ed}>${b.h}</blockquote>`; break;
    case 'code': inner = `<div class="codewrap"><div class="cacts"><button data-act="ln" title="Line numbers">#</button><button data-act="wrap" title="Wrap long lines">↩</button><button data-act="copy" title="Copy code">Copy</button></div><div class="gut" aria-hidden="true">${gutter(b.t)}</div><pre class="bt code" ${b.alt ? `data-lang="${esc(b.alt)}"` : ''} ${ed}>${highlightCode(b.t, b.alt)}</pre></div>`; break;
    case 'mermaid': inner = `<div class="bt mmd" data-code="${esc(b.t)}">Drawing diagram…</div>`; break;
    case 'cap': inner = `<div class="bt cap" ${ed}>${b.h}</div>`; break;
    case 'img': inner = `<img class="bimg" src="${esc(b.src)}" alt="${esc(b.alt)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.closest('.blk').remove()">`; break;
    case 'hr': inner = '<hr class="bhr">'; break;
    default: inner = `<p class="bt" ${ed}>${b.h}</p>`;
  }
  const cm = b.c !== undefined;
  return `<div class="blk ${b.hl ? 'hl' : ''} ${cm ? 'hascm' : ''}" data-b="${i}">
    <div class="bctl"><button data-act="hl" title="Highlight">🖍</button><button data-act="cm" title="Add a comment">💬</button><button data-act="hide" title="Hide this block">✕</button><button data-act="above" title="Hide everything above this block">⤒</button><button data-act="below" title="Hide everything from here down">⤓</button></div>
    ${inner}${cm ? `<div class="bcm"><span>💬</span><input value="${esc(b.c)}" placeholder="Your note on this…" maxlength="500"></div>` : ''}</div>`;
}

function mdInline(h) {
  return String(h || '')
    .replace(/<a href="([^"]*)"[^>]*>(.*?)<\/a>/g, (_m, u, t) => `[${t}](${u.replace(/&amp;/g, '&')})`)
    .replace(/<\/?b>/g, '**').replace(/<\/?i>/g, '*').replace(/<\/?code>/g, '`')
    .replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
}
function articleMarkdown(L) {
  let md = `# ${L.title}\n\n> Source: ${L.url}${L.byline ? ' · ' + L.byline : ''}\n\n`;
  for (const b of L.blocks) {
    if (b.x) continue;
    const star = b.hl ? '⭐ ' : '';
    switch (b.k) {
      case 'h': md += `${'#'.repeat(b.lvl)} ${mdInline(b.h)}\n\n`; break;
      case 'li': md += `${'  '.repeat(b.d || 0)}${b.n ? b.n + '.' : '-'} ${star}${mdInline(b.h)}\n`; break;
      case 'q': md += `> ${star}${mdInline(b.h)}\n\n`; break;
      case 'code': md += '```' + (b.alt || '') + '\n' + b.t + '\n```\n\n'; break;
      case 'mermaid': md += '```mermaid\n' + b.t + '\n```\n\n'; break;
      case 'img': md += `![${b.alt || ''}](${b.src})\n\n`; break;
      case 'hr': md += '---\n\n'; break;
      case 'cap': md += `*${mdInline(b.h)}*\n\n`; break;
      default: md += `${star}${mdInline(b.h)}\n\n`;
    }
    if (b.c) md += `${b.k === 'li' ? '  ' : ''}> 💬 ${b.c}\n\n`;
  }
  if ((L.notes || '').trim()) md += `\n## My notes\n\n${L.notes.trim()}\n`;
  return md.replace(/\n{3,}/g, '\n\n');
}

let pendingBlock = null;
function applyCodePrefs() {
  document.body.classList.toggle('code-ln', !!LS.get('codeLn', true));
  document.body.classList.toggle('code-wrap', !!LS.get('codeWrap', false));
}
function renderReader(L) {
  const box = document.getElementById('reader'), sc = document.querySelector('.left');
  const hidden = L.blocks.filter((b) => b.x).length;
  box.innerHTML = `<div class="rpage">
    ${L.image ? `<img class="rcover" src="${esc(L.image)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}
    <h1 class="rtitle">${esc(L.title)}</h1>
    <div class="rmeta">${esc(L.channel || '')}${L.byline ? ' · ' + esc(L.byline) : ''} · ${fmtDur(L.duration)} read · <a href="${esc(L.url)}" data-ext>Open original ↗</a></div>
    <div class="rtools"><button class="btn ghost" id="rHl">Highlights only</button><button class="btn ghost" id="rMd">Copy as Markdown</button>${hidden ? `<button class="btn ghost" id="rUnhide">Restore ${hidden} hidden block${hidden === 1 ? '' : 's'}</button>` : ''}</div>
    <div class="hint">Hover a block to highlight it, comment on it or hide it. Click any text to edit it. Everything is saved on this computer.</div>
    <div class="rbody" id="rbody">${L.blocks.map((b, i) => (b.x ? '' : blockHtml(b, i))).join('')}</div>
    <h3 class="nh">My notes</h3>
    <textarea class="notes" id="notes" placeholder="Write anything you want to remember…">${esc(L.notes)}</textarea>
    <div class="rfoot"><button class="btn" id="rDone"></button></div></div>`;
  const body = document.getElementById('rbody');
  applyCodePrefs();
  if (typeof drawMermaid === 'function') drawMermaid(body);
  const doneBtn = document.getElementById('rDone');
  const doneLabel = () => { doneBtn.textContent = L.done ? '✓ Marked as read – undo' : 'Mark as read'; doneBtn.classList.toggle('ghost', !!L.done); };
  doneLabel();
  doneBtn.onclick = () => { setDone(cur, !L.done); doneLabel(); };
  document.getElementById('notes').oninput = (e) => { L.notes = e.target.value; queueSave(); };
  document.getElementById('rHl').onclick = (e) => { const on = body.classList.toggle('onlyhl'); e.target.textContent = on ? 'Show everything' : 'Highlights only'; };
  document.getElementById('rMd').onclick = async () => {
    const md = articleMarkdown(L);
    try { await navigator.clipboard.writeText(md); toast('Copied as Markdown – paste it into Notion, Obsidian, anywhere'); }
    catch {
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([md], { type: 'text/markdown' }));
      a.download = (L.title.replace(/[^\w\- ]+/g, '').trim().slice(0, 60) || 'article') + '.md'; a.click();
    }
  };
  const un = document.getElementById('rUnhide'); if (un) un.onclick = () => { L.blocks.forEach((b) => delete b.x); queueSave(); renderReader(L); };

  const blk = (el) => el.closest('.blk');
  const redo = (el, i) => { const t = document.createElement('div'); t.innerHTML = blockHtml(L.blocks[i], i); el.replaceWith(t.firstElementChild); };
  body.onclick = (e) => {
    const a = e.target.closest('a[data-ext]'); if (a) { e.preventDefault(); api.openExternal(a.href); return; }
    const btn = e.target.closest('[data-act]'); if (!btn) return;
    const el = blk(btn), i = +el.dataset.b, b = L.blocks[i];
    if (btn.dataset.act === 'copy') { navigator.clipboard.writeText(b.t).then(() => { btn.textContent = 'Copied ✓'; setTimeout(() => (btn.textContent = 'Copy'), 1400); }); return; }
    if (btn.dataset.act === 'ln' || btn.dataset.act === 'wrap') { const k = btn.dataset.act === 'ln' ? 'codeLn' : 'codeWrap'; LS.set(k, !LS.get(k, k === 'codeLn')); applyCodePrefs(); return; }
    if (btn.dataset.act === 'hl') { b.hl = !b.hl; if (!b.hl) delete b.hl; el.classList.toggle('hl', !!b.hl); }
    else if (btn.dataset.act === 'cm') { if (b.c === undefined) { b.c = ''; redo(el, i); } const inp = body.querySelector(`.blk[data-b="${i}"] .bcm input`); if (inp) inp.focus(); }
    else if (btn.dataset.act === 'hide') { const top = sc.scrollTop; b.x = true; renderReader(L); sc.scrollTop = top; }
    else if (btn.dataset.act === 'above' || btn.dataset.act === 'below') {
      const up = btn.dataset.act === 'above'; let n = 0;
      L.blocks.forEach((x, k) => { if ((up ? k < i : k > i) && !x.x) { x.x = true; n++; } });
      queueSave(); renderReader(L); toast(`Hid ${n} block${n === 1 ? '' : 's'} – use “Restore” at the top to bring them back`);
      return;
    }
    queueSave();
  };
  body.addEventListener('focusin', (e) => {
    const p = e.target.closest && e.target.closest('pre.code'); if (!p || p.dataset.raw) return;
    p.dataset.raw = '1'; p.textContent = L.blocks[+blk(p).dataset.b].t;
  });
  body.addEventListener('input', (e) => {
    const el = blk(e.target); if (!el) return;
    const b = L.blocks[+el.dataset.b];
    if (e.target.matches('.bcm input')) { b.c = e.target.value; queueSave(); }
    else if (e.target.isContentEditable) { e.target.dataset.dirty = '1'; const g = el.querySelector('.gut'); if (g) g.textContent = gutter(e.target.innerText.replace(/\n$/, '')); }
  });
  body.addEventListener('focusout', (e) => {
    const el = blk(e.target); if (!el) return;
    const i = +el.dataset.b, b = L.blocks[i];
    if (e.target.matches('.bcm input')) { if (!e.target.value.trim()) { delete b.c; redo(el, i); queueSave(); } }
    else if (e.target.dataset && e.target.dataset.dirty) {
      delete e.target.dataset.dirty;
      const txt = e.target.innerText.replace(/ /g, ' ');
      b.t = b.k === 'code' ? txt.replace(/\n+$/, '') : txt.replace(/\s+/g, ' ').trim();
      b.h = esc(b.t); queueSave();
    }
    if (e.target.matches && e.target.matches('pre.code')) { delete e.target.dataset.raw; e.target.innerHTML = highlightCode(b.t, b.alt); }
  });

  // reading position + auto "read" at the end
  let st = null;
  if (sc._rs) sc.removeEventListener('scroll', sc._rs);
  sc.addEventListener('scroll', (sc._rs = () => {
    clearTimeout(st);
    st = setTimeout(() => {
      const max = sc.scrollHeight - sc.clientHeight; if (max < 50) return;
      const f = sc.scrollTop / max;
      L.pos = Math.round(f * 1000); queueSave();
      if (f >= 0.97 && !L.done && !L.autoDone && max > 400) { L.autoDone = true; setDone(cur, true); doneLabel(); toast('Marked as read'); }
    }, 300);
  }));
  const goto = pendingBlock && pendingBlock.id === L.id ? pendingBlock.b : null; pendingBlock = null;
  setTimeout(() => {
    if (goto !== null) {
      const el = body.querySelector(`.blk[data-b="${goto}"]`);
      if (el) { el.scrollIntoView({ block: 'center' }); el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1800); }
    } else if (L.pos > 0 && L.pos < 980) sc.scrollTop = (L.pos / 1000) * (sc.scrollHeight - sc.clientHeight);
  }, 150);
}
