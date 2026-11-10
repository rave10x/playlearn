// Injected into every frame by the host app; only acts inside the YouTube embed.
// Provides (1) the in-player ad skipper / chrome hider and (2) captions + audio-track ops over postMessage.
(() => {
  if (!/^https:\/\/www\.youtube(-nocookie)?\.com\/embed\//.test(location.href)) return;
  if (window.__plEmbed) return; window.__plEmbed = true;

  const css = 'embedded-player-video-details,.ytmVideoInfoOverlay,.ytPlayerControlsContainerHost,.new-controls,.player-controls-background,.player-controls-background-container,.player-controls-content,.ytp-pause-overlay,.ytp-pause-overlay-container,.ytp-endscreen-content,.ytp-ce-element,.ytp-cards-teaser,.ytp-suggested-action,.ytp-videowall-still,.ytp-chrome-top,.ytp-gradient-top,.ytp-show-cards-title,.ytp-watermark,.ytp-impression-link,.iv-branding,.annotation{display:none!important}';
  const addCss = () => { const st = document.createElement('style'); st.textContent = css; (document.head || document.documentElement).appendChild(st); };
  if (document.head) addCss(); else document.addEventListener('DOMContentLoaded', addCss);

  let mutedByUs = false;
  setInterval(() => {
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
  }, 250);

  const P = () => document.getElementById('movie_player');
  const OPS = {
    audioList: () => {
      const p = P(); if (!p || !p.getAvailableAudioTracks) return null;
      const info = (t) => { for (const k of Object.keys(t)) { const v = t[k]; if (v && typeof v === 'object' && 'isAutoDubbed' in v) return v; } return {}; };
      const l = p.getAvailableAudioTracks() || []; const c = p.getAudioTrack && p.getAudioTrack();
      return { tracks: l.map((t, i) => { const x = info(t); return { i, name: x.name || ('Track ' + (i + 1)), dubbed: !!x.isAutoDubbed, def: !!x.isDefault }; }), cur: c ? l.findIndex((t) => t.id === c.id) : -1 };
    },
    audioSet: (i) => { const p = P(); const l = p.getAvailableAudioTracks(); if (!l[+i]) return false; p.setAudioTrack(l[+i]); return true; },
    ccList: () => {
      const p = P(); if (!p || !p.getOption) return null; try { p.loadModule('captions'); } catch (e) {}
      let l = p.getOption('captions', 'tracklist') || [];
      if (!l.length && p.getAvailableAudioTracks) {
        const a = p.getAvailableAudioTracks() || []; const c = p.getAudioTrack && p.getAudioTrack();
        const t = (c && a.find((x) => x.id === c.id)) || a[0]; l = (t && t.captionTracks) || [];
      }
      const seen = {}; const out = [];
      for (const t of l) { if (seen[t.languageCode]) continue; seen[t.languageCode] = 1; out.push({ code: t.languageCode, name: t.displayName || t.languageName, kind: t.kind || '', tr: !!t.isTranslateable }); }
      const c = p.getOption('captions', 'track') || {};
      return { tracks: out, cur: c.languageCode || null };
    },
    ccSet: (code) => { const p = P(); try { p.loadModule('captions'); } catch (e) {} p.setOption('captions', 'track', code ? { languageCode: String(code) } : {}); return true; },
    ccOff: () => { const p = P(); p.setOption('captions', 'track', {}); try { p.unloadModule('captions'); } catch (e) {} return true; },
  };
  window.addEventListener('message', (e) => {
    const d = e.data; if (!d || typeof d !== 'object' || !d.__pl || !OPS[d.__pl]) return;
    let result = null; try { result = OPS[d.__pl](d.arg); } catch (err) { result = null; }
    try { e.source.postMessage({ __plr: d.id, result }, '*'); } catch (err) {}
  });
})();
