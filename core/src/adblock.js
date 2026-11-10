// Always-on ad blocker for the YouTube embed. Runs at document start, before the player's own scripts.
// (1) removes ad data from the player's JSON so no ad is ever scheduled, (2) blocks ad/tracking requests.
// The DOM skipper in embed.js stays as the last line of defence. Shared with the Android app.
(() => {
  if (!/^https:\/\/www\.youtube(-nocookie)?\.com\/embed\//.test(location.href)) return;
  if (window.__plAdb) return; window.__plAdb = true;

  const HOSTS = ['doubleclick.net', 'googlesyndication.com', 'googleadservices.com', 'adservice.google.com', 'google-analytics.com',
    'googletagmanager.com', 'googletagservices.com', 'moatads.com', 'adsafeprotected.com', 'imasdk.googleapis.com'];
  const PATHS = [/\/pagead\//, /\/api\/stats\/ads/, /\/ptracking/, /\/get_midroll_/, /\/youtubei\/v1\/player\/ad_break/, /[?&]ad_type=/,
    /\/api\/stats\/qoe\?.*adformat/, /\/generate_204\?.*ad/];
  const isAd = (u) => {
    try {
      const x = new URL(String(u), location.href), h = x.hostname;
      if (HOSTS.some((d) => h === d || h.endsWith('.' + d))) return true;
      return /(^|\.)(youtube\.com|googlevideo\.com)$/.test(h) && PATHS.some((r) => r.test(x.pathname + x.search));
    } catch (e) { return false; }
  };
  const KEYS = ['adPlacements', 'playerAds', 'adSlots', 'adBreakHeartbeatParams'];
  const strip = (o) => { if (o && typeof o === 'object') for (const k of KEYS) if (k in o) { try { delete o[k]; } catch (e) {} } return o; };

  const jp = JSON.parse;
  JSON.parse = function (t, r) {
    const v = jp.call(this, t, r);
    try { if (v && typeof v === 'object') { strip(v); if (v.playerResponse) strip(v.playerResponse); } } catch (e) {}
    return v;
  };

  const f = window.fetch;
  if (f) window.fetch = function (i, o) {
    const u = typeof i === 'string' ? i : (i && i.url);
    if (isAd(u)) return Promise.resolve(new Response(null, { status: 204 }));
    const p = f.apply(this, arguments);
    if (!/\/youtubei\/v1\/(player|next)/.test(String(u))) return p;
    return p.then(async (res) => {
      try {
        const j = await res.clone().json();
        strip(j);
        const h = new Headers(res.headers); h.delete('content-length'); h.delete('content-encoding');
        return new Response(JSON.stringify(j), { status: res.status, statusText: res.statusText, headers: h });
      } catch (e) { return res; }
    });
  };

  const xo = XMLHttpRequest.prototype.open, xs = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (m, u) { this.__plAd = isAd(u); return xo.apply(this, arguments); };
  XMLHttpRequest.prototype.send = function () { if (this.__plAd) { try { this.abort(); } catch (e) {} return; } return xs.apply(this, arguments); };

  const sb = navigator.sendBeacon;
  if (sb) navigator.sendBeacon = function (u) { return isAd(u) ? true : sb.apply(this, arguments); };

  // ad scripts/pixels added to the DOM
  for (const [proto, attr] of [[HTMLScriptElement.prototype, 'src'], [HTMLImageElement.prototype, 'src'], [HTMLIFrameElement.prototype, 'src']]) {
    const d = Object.getOwnPropertyDescriptor(proto, attr);
    if (d && d.set) Object.defineProperty(proto, attr, { configurable: true, enumerable: d.enumerable, get: d.get, set(v) { if (!isAd(v)) d.set.call(this, v); } });
  }
})();
