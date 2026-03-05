// Runs in YouTube's page context (world: "MAIN", document_start).
// Finds SMART_SKIP timestamps and skips directly using the player API.

(function () {
  'use strict';

  console.log('[AutoSkip] injected.js loaded');

  // ── Find page data ───────────────────────────────────────────────────────

  function getPageData() {
    if (window.ytInitialData) return window.ytInitialData;
    try { return window.ytcfg?.get?.('INITIAL_DATA'); } catch (_) {}
    try { return window.yt?.config_?.INITIAL_DATA; } catch (_) {}
    return null;
  }

  // ── Extract SMART_SKIP markers ───────────────────────────────────────────

  function findSkipMarkers(data) {
    if (!data) return [];
    const mutations = data?.frameworkUpdates?.entityBatchUpdate?.mutations;
    if (!mutations) return [];

    const markers = [];
    for (const m of mutations) {
      if (!m.entityKey || !m.payload) continue;
      let isSkip = false;
      try { isSkip = atob(decodeURIComponent(m.entityKey)).includes('SMART_SKIP'); }
      catch (_) { try { isSkip = atob(m.entityKey).includes('SMART_SKIP'); } catch (_2) {} }
      if (!isSkip) continue;

      const list = m.payload?.macroMarkersListEntity?.markersList?.markers;
      if (list) {
        for (const mk of list) {
          const ms = parseInt(mk.startMillis, 10);
          if (!isNaN(ms)) markers.push(ms);
        }
      }
      console.log('[AutoSkip] SMART_SKIP payload:', JSON.stringify(m.payload));
    }
    return markers;
  }

  // ── Discover player API ──────────────────────────────────────────────────

  function getPlayer() {
    return document.querySelector('#movie_player');
  }

  function discoverPlayerAPI() {
    const player = getPlayer();
    if (!player) return;

    // getApiInterface() lists all public methods on the player
    if (typeof player.getApiInterface === 'function') {
      const methods = player.getApiInterface();
      console.log('[AutoSkip] Player API methods:', methods);

      // Find anything related to skip/jump/ahead/marker/chapter
      const relevant = methods.filter(m =>
        /skip|jump|ahead|marker|chapter|overlay|action|seek|annotation/i.test(m)
      );
      console.log('[AutoSkip] Relevant player methods:', relevant);
    }

    // Also log available chapters/markers
    if (typeof player.getVideoData === 'function') {
      console.log('[AutoSkip] Video data:', JSON.stringify(player.getVideoData()));
    }
  }

  // ── Auto-skip using player.seekTo() ──────────────────────────────────────
  // Since durationMillis is "0", we watch for the button to appear in the DOM
  // and read its click handler's seek target, OR we try the player's internal
  // methods to trigger the skip.

  let armed = false;

  function armSkip(skipStartMs) {
    if (armed) return;
    armed = true;

    const video = document.querySelector('video');
    if (!video) return;

    console.log('[AutoSkip] Armed at', skipStartMs, 'ms');

    video.addEventListener('timeupdate', function handler() {
      const ms = video.currentTime * 1000;
      if (ms < skipStartMs - 1000 || ms > skipStartMs + 3000) return;

      // We're at the skip point. Try multiple approaches:
      const player = getPlayer();
      if (!player) return;

      // Approach 1: Try calling player methods that might trigger skip
      const tryMethods = [
        'handleSkipIntro',
        'handleJumpAhead',
        'skipAhead',
        'handleSmartSkip',
      ];
      for (const method of tryMethods) {
        if (typeof player[method] === 'function') {
          console.log('[AutoSkip] Calling player.' + method + '()');
          player[method]();
          video.removeEventListener('timeupdate', handler);
          post('skipped', { method });
          return;
        }
      }

      // Approach 2: Find the button in DOM even if CSS-hidden, and click it
      const btn = findSkipButton(player);
      if (btn) {
        const timeBefore = video.currentTime;
        btn.click();
        console.log('[AutoSkip] Clicked hidden button from MAIN world');

        setTimeout(() => {
          const skipped = Math.round(video.currentTime - timeBefore);
          post('skipped', { seconds: skipped });
        }, 300);

        video.removeEventListener('timeupdate', handler);
        return;
      }

      // Approach 3: Force-show controls by calling player's internal wakeup
      const wakeUpMethods = [
        'wakeUpControls',
        'showControls',
        'onMouseMove_',
        'cancelHideControls',
      ];
      for (const method of wakeUpMethods) {
        if (typeof player[method] === 'function') {
          console.log('[AutoSkip] Calling player.' + method + '()');
          player[method]();
          // After waking up controls, wait for button to appear
          setTimeout(() => {
            const b = findSkipButton(player);
            if (b) {
              const t = video.currentTime;
              b.click();
              setTimeout(() => {
                post('skipped', { seconds: Math.round(video.currentTime - t) });
              }, 300);
              // Re-hide controls
              if (typeof player.hideControls === 'function') player.hideControls();
              player.classList.add('ytp-autohide');
            }
          }, 400);
          video.removeEventListener('timeupdate', handler);
          return;
        }
      }

      console.log('[AutoSkip] No approach worked at skip point');
    });
  }

  function findSkipButton(player) {
    // Try selectors
    for (const sel of ['[aria-label="Jump ahead"]', '[title="Jump ahead"]']) {
      const el = player.querySelector(sel);
      if (el) return el;
    }
    // Try text match (even if not visible)
    for (const el of player.querySelectorAll('button, [role="button"]')) {
      if (/jump ahead/i.test(el.textContent || el.ariaLabel || '')) return el;
    }
    return null;
  }

  // ── Post to content script ───────────────────────────────────────────────

  function post(type, data) {
    window.postMessage({ source: 'autoskip', type, ...data }, '*');
  }

  // ── Process data ─────────────────────────────────────────────────────────

  function process(data) {
    const markers = findSkipMarkers(data);
    if (markers.length) {
      console.log('[AutoSkip] Skip markers:', markers);
      post('segments', { markers });
      for (const ms of markers) armSkip(ms);
    }

    // Discover API methods (for debugging)
    discoverPlayerAPI();
  }

  // ── Triggers ─────────────────────────────────────────────────────────────

  let attempts = 0;
  const poll = setInterval(() => {
    attempts++;
    const data = getPageData();
    if (data) {
      clearInterval(poll);
      console.log('[AutoSkip] Page data found (attempt', attempts + ')');
      process(data);
    } else if (attempts > 50) {
      clearInterval(poll);
      console.log('[AutoSkip] No page data after', attempts, 'attempts');
    }
  }, 300);

  document.addEventListener('yt-navigate-finish', () => {
    armed = false;
    setTimeout(() => {
      const data = getPageData();
      if (data) process(data);
    }, 1500);
  });

  const origFetch = window.fetch;
  window.fetch = async function (...args) {
    const resp = await origFetch.apply(this, args);
    try {
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
      if (url.includes('/youtubei/v1/next') || url.includes('/youtubei/v1/player')) {
        resp.clone().json().then(d => {
          console.log('[AutoSkip] Intercepted:', url.split('?')[0]);
          process(d);
        }).catch(() => {});
      }
    } catch (_) {}
    return resp;
  };
})();
