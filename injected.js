// Runs in YouTube's page context (world: "MAIN", document_start).
// Finds SMART_SKIP timestamps and the seek target, then auto-skips.

(function () {
  'use strict';

  console.log('[AutoSkip] injected.js loaded');

  function getPageData() {
    if (window.ytInitialData) return window.ytInitialData;
    try { return window.ytcfg?.get?.('INITIAL_DATA'); } catch (_) {}
    try { return window.yt?.config_?.INITIAL_DATA; } catch (_) {}
    return null;
  }

  // ── Deep search helper ───────────────────────────────────────────────────

  function findDeep(obj, key, depth) {
    if (!obj || typeof obj !== 'object' || (depth || 0) > 20) return null;
    if (obj[key] !== undefined) return obj[key];
    for (const v of Object.values(obj)) {
      const r = findDeep(v, key, (depth || 0) + 1);
      if (r !== null) return r;
    }
    return null;
  }

  // Find ALL occurrences of a key at any depth
  function findAllDeep(obj, key, results, depth) {
    if (!obj || typeof obj !== 'object' || (depth || 0) > 20) return;
    results = results || [];
    if (obj[key] !== undefined) results.push(obj[key]);
    for (const v of Object.values(obj)) {
      findAllDeep(v, key, results, (depth || 0) + 1);
    }
    return results;
  }

  // ── Extract SMART_SKIP start time from entity store ──────────────────────

  function findSkipStartMs(data) {
    if (!data) return null;
    const mutations = data?.frameworkUpdates?.entityBatchUpdate?.mutations;
    if (!mutations) return null;

    for (const m of mutations) {
      if (!m.entityKey || !m.payload) continue;
      let isSkip = false;
      try { isSkip = atob(decodeURIComponent(m.entityKey)).includes('SMART_SKIP'); }
      catch (_) { try { isSkip = atob(m.entityKey).includes('SMART_SKIP'); } catch (_2) {} }
      if (!isSkip) continue;

      console.log('[AutoSkip] SMART_SKIP entity:', JSON.stringify(m.payload));

      const list = m.payload?.macroMarkersListEntity?.markersList?.markers;
      if (list?.length) {
        const ms = parseInt(list[0].startMillis, 10);
        if (!isNaN(ms)) return ms;
      }
    }
    return null;
  }

  // ── Find the Jump ahead seek target from the timely actions command ──────

  function findSeekTarget(data) {
    if (!data) return null;

    // Dump the full timelyActionsOverlayViewModel for debugging
    const timely = findDeep(data, 'timelyActionsOverlayViewModel');
    if (timely) {
      console.log('[AutoSkip] timelyActionsOverlayViewModel:', JSON.stringify(timely));
    }

    // Search for any command that contains a seek/position target
    // YouTube typically uses commands like seekCommand, watchEndpoint with startTimeSeconds, etc.
    const allCommands = findAllDeep(data, 'commandExecutorCommand') || [];
    const allSeeks = findAllDeep(data, 'seekCommand') || [];
    const allWatchEndpoints = findAllDeep(data, 'watchEndpoint') || [];

    for (const cmd of allSeeks) {
      console.log('[AutoSkip] Found seekCommand:', JSON.stringify(cmd));
      if (cmd.positionMs) return parseInt(cmd.positionMs, 10);
      if (cmd.position) return parseInt(cmd.position, 10);
    }

    // Search for any *Ms or *Millis field in the timely actions that could be the target
    if (timely) {
      const msFields = [];
      (function walk(obj, path) {
        if (!obj || typeof obj !== 'object') return;
        for (const [k, v] of Object.entries(obj)) {
          const p = path ? `${path}.${k}` : k;
          if (/millis|Ms$|position|seekTo/i.test(k) && (typeof v === 'string' || typeof v === 'number')) {
            msFields.push({ path: p, value: v });
          }
          if (typeof v === 'object') walk(v, p);
        }
      })(timely, '');
      if (msFields.length) {
        console.log('[AutoSkip] Timing fields in timelyActions:', msFields);
      }
    }

    // Also look for clickCommand / onTap / command near Jump ahead
    const allOnTaps = findAllDeep(data, 'onTap') || [];
    for (const tap of allOnTaps) {
      const str = JSON.stringify(tap);
      if (str.includes('SMART_SKIP') || str.includes('jump') || str.includes('Jump')) {
        console.log('[AutoSkip] onTap command near skip:', str.substring(0, 500));
      }
    }

    return null;
  }

  // ── Arm the auto-skip ────────────────────────────────────────────────────

  let armed = false;

  function armSkip(startMs, endMs) {
    if (armed) return;
    armed = true;

    const video = document.querySelector('video');
    if (!video) return;

    console.log('[AutoSkip] Armed: start=' + startMs + 'ms, end=' + (endMs || 'unknown'));

    video.addEventListener('timeupdate', function handler() {
      const ms = video.currentTime * 1000;
      if (ms < startMs - 500 || ms > startMs + 3000) return;

      if (endMs && endMs > startMs) {
        // We know the destination — seek directly!
        const skipSec = Math.round((endMs - startMs) / 1000);
        video.currentTime = endMs / 1000;
        video.removeEventListener('timeupdate', handler);
        post('skipped', { seconds: skipSec });
        console.log('[AutoSkip] Seeked to', endMs, 'ms (' + skipSec + 's skipped)');
      } else {
        // No end time — try to find and click the button in the DOM
        const player = document.querySelector('#movie_player');
        const btn = player && findSkipButton(player);
        if (btn) {
          const before = video.currentTime;
          btn.click();
          video.removeEventListener('timeupdate', handler);
          setTimeout(() => {
            post('skipped', { seconds: Math.round(video.currentTime - before) });
          }, 300);
          console.log('[AutoSkip] Clicked button at skip point');
        }
        // If no button found, handler stays active and retries on next timeupdate
      }
    });
  }

  function findSkipButton(player) {
    for (const sel of ['[aria-label="Jump ahead"]', '[title="Jump ahead"]']) {
      const el = player.querySelector(sel);
      if (el) return el;
    }
    for (const el of player.querySelectorAll('button, [role="button"]')) {
      if (/jump ahead/i.test(el.textContent || el.ariaLabel || '')) return el;
    }
    return null;
  }

  function post(type, data) {
    window.postMessage({ source: 'autoskip', type, ...data }, '*');
  }

  // ── Process response data ────────────────────────────────────────────────

  function process(data) {
    const startMs = findSkipStartMs(data);
    const endMs = findSeekTarget(data);

    if (startMs) {
      console.log('[AutoSkip] Skip: start=' + startMs + ', end=' + endMs);
      armSkip(startMs, endMs);
    }
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
