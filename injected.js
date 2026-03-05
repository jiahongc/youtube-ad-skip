// Runs in YouTube's page context (world: "MAIN", document_start).
// Extracts Jump ahead timing from timelyActionsOverlayViewModel,
// then auto-seeks using player.seekTo() — no button or mouse needed.

(function () {
  'use strict';

  console.log('[AutoSkip] injected.js loaded');

  // ── Helpers ──────────────────────────────────────────────────────────────

  function findDeep(obj, key, depth) {
    if (!obj || typeof obj !== 'object' || (depth || 0) > 20) return null;
    if (obj[key] !== undefined) return obj[key];
    for (const v of Object.values(obj)) {
      const r = findDeep(v, key, (depth || 0) + 1);
      if (r !== null) return r;
    }
    return null;
  }

  function getPageData() {
    if (window.ytInitialData) return window.ytInitialData;
    try { return window.ytcfg?.get?.('INITIAL_DATA'); } catch (_) {}
    return null;
  }

  // ── Extract skip segments from timelyActionsOverlayViewModel ─────────────

  function extractSkipSegments(data) {
    const timely = findDeep(data, 'timelyActionsOverlayViewModel');
    if (!timely?.timelyActionsOverlayViewModel?.timelyActions) return [];

    const segments = [];

    for (const action of timely.timelyActionsOverlayViewModel.timelyActions) {
      const vm = action?.timelyActionViewModel;
      if (!vm) continue;

      // The button title must be "Jump ahead"
      if (vm.content?.buttonViewModel?.title !== 'Jump ahead') continue;

      // When to trigger: startTimeMilliseconds
      const triggerMs = parseInt(vm.startTimeMilliseconds, 10);
      if (isNaN(triggerMs)) continue;

      // Where to seek: find seekToVideoTimestampCommand in the onTap serial commands
      let seekTargetMs = null;
      const commands = vm.rendererContext?.commandContext?.onTap?.serialCommand?.commands;
      if (commands) {
        for (const cmd of commands) {
          const seek = cmd?.innertubeCommand?.seekToVideoTimestampCommand;
          if (seek?.offsetFromVideoStartMilliseconds) {
            seekTargetMs = parseInt(seek.offsetFromVideoStartMilliseconds, 10);
            break;
          }
        }
      }

      if (seekTargetMs && seekTargetMs > triggerMs) {
        segments.push({ triggerMs, seekTargetMs });
        console.log('[AutoSkip] Segment: trigger at', triggerMs + 'ms, seek to', seekTargetMs + 'ms',
          '(' + Math.round((seekTargetMs - triggerMs) / 1000) + 's skip)');
      }
    }

    return segments;
  }

  // ── Arm the auto-skip ────────────────────────────────────────────────────

  let currentVideoId = null;
  let handler = null;

  function armSkip(segments) {
    if (!segments.length) return;

    const video = document.querySelector('video');
    if (!video) return;

    // Remove previous handler if re-arming for a new video
    if (handler) video.removeEventListener('timeupdate', handler);

    const skipped = new Set();

    handler = () => {
      const ms = video.currentTime * 1000;

      for (const seg of segments) {
        const key = seg.triggerMs + '-' + seg.seekTargetMs;
        if (skipped.has(key)) continue;

        // Trigger when within 1.5s of the trigger point
        if (ms >= seg.triggerMs && ms < seg.triggerMs + 1500) {
          skipped.add(key);

          const skipSec = Math.round((seg.seekTargetMs - seg.triggerMs) / 1000);

          // Seek directly — no button, no mouse events
          const player = document.querySelector('#movie_player');
          if (player && typeof player.seekTo === 'function') {
            player.seekTo(seg.seekTargetMs / 1000, true);
            console.log('[AutoSkip] Seeked to', seg.seekTargetMs + 'ms');
          } else {
            video.currentTime = seg.seekTargetMs / 1000;
            console.log('[AutoSkip] Set currentTime to', seg.seekTargetMs + 'ms');
          }

          // Notify content script for toast
          window.postMessage({
            source: 'autoskip', type: 'skipped', seconds: skipSec,
          }, '*');

          break;
        }
      }
    };

    video.addEventListener('timeupdate', handler);
    console.log('[AutoSkip] Armed', segments.length, 'segment(s)');
  }

  // ── Process data ─────────────────────────────────────────────────────────

  function process(data) {
    const segments = extractSkipSegments(data);
    if (segments.length) armSkip(segments);
  }

  // ── Triggers ─────────────────────────────────────────────────────────────

  // 1. Poll for initial page data
  let attempts = 0;
  const poll = setInterval(() => {
    attempts++;
    const data = getPageData();
    if (data) {
      clearInterval(poll);
      process(data);
    } else if (attempts > 50) {
      clearInterval(poll);
    }
  }, 300);

  // 2. SPA navigation
  document.addEventListener('yt-navigate-finish', () => {
    currentVideoId = null;
    setTimeout(() => {
      const data = getPageData();
      if (data) process(data);
    }, 1500);
  });

  // 3. Intercept fetch for /next responses (SPA + additional data)
  const origFetch = window.fetch;
  window.fetch = async function (...args) {
    const resp = await origFetch.apply(this, args);
    try {
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
      if (url.includes('/youtubei/v1/next')) {
        resp.clone().json().then(d => process(d)).catch(() => {});
      }
    } catch (_) {}
    return resp;
  };
})();
