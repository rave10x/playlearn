// Provides window.api over the local HTTP API when running outside Electron (the Windows/Tauri build).
(() => {
  if (window.api) return;
  const T = window.__PL_TOKEN__ || '';
  const call = async (cmd, ...args) => {
    const r = await fetch('/api/' + encodeURIComponent(cmd), { method: 'POST', headers: { 'x-pl-token': T, 'content-type': 'application/json' }, body: JSON.stringify(args) });
    if (!r.ok) throw new Error((await r.text()) || 'Request failed');
    return r.json();
  };
  const L = {};
  const on = (n) => (cb) => { (L[n] = L[n] || []).push(cb); };
  (async function poll() {
    let since = null;
    for (;;) {
      try {
        const r = await fetch('/api/poll?t=' + encodeURIComponent(T) + (since === null ? '' : '&since=' + since), { cache: 'no-store' });
        if (!r.ok) throw new Error('poll ' + r.status);
        const j = await r.json(); since = j.next;
        for (const ev of j.events) (L[ev.n] || []).forEach((f) => { try { f(ev.d); } catch (e) { console.error(e); } });
      } catch { await new Promise((res) => setTimeout(res, 1500)); }
    }
  })();

  const pending = new Map(); let seq = 0;
  addEventListener('message', (e) => { const d = e.data; if (d && d.__plr) { const p = pending.get(d.__plr); if (p) { pending.delete(d.__plr); p(d.result); } } });
  const playerOp = (op, arg) => new Promise((res) => {
    const f = [...document.querySelectorAll('iframe')].find((x) => /youtube(-nocookie)?\.com\/embed\//.test(x.src));
    if (!f || !f.contentWindow) return res(null);
    const id = ++seq; pending.set(id, res);
    setTimeout(() => { if (pending.delete(id)) res(null); }, 3000);
    f.contentWindow.postMessage({ __pl: op, arg, id }, '*');
  });

  window.api = {
    list: () => call('courses:list'), get: (id) => call('courses:get', id), save: (c) => call('courses:save', c), remove: (id) => call('courses:delete', id),
    refreshCourse: (id) => call('courses:refresh', id), importPlaylist: (u) => call('courses:import', u), resolveVideos: (t) => call('videos:resolve', t),
    exportData: (p) => call('data:export', p), importData: () => call('data:import'), openDataFolder: () => call('data:folder'),
    playerOp, dnd: (on_) => call('dnd:set', on_),
    dlList: (c) => call('dl:list', c), dlStart: (c, v) => call('dl:start', c, v), dlCancel: (c, v) => call('dl:cancel', c, v), dlDelete: (c, v) => call('dl:delete', c, v), dlOpen: (c) => call('dl:open', c),
    onDlProgress: on('dl:progress'), chapters: (v) => call('chapters:get', v), openExternal: (u) => call('open-external', u),
    onStatus: on('import-status'), onIncomingUrl: on('incoming-url'),
  };
})();
