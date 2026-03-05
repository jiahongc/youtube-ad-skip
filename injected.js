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
    if (!timely?.timelyActionsOverlayViewModel?.timelyActions) {
      console.log('[AutoSkip] No timelyActions found in data');
      return [];
    }

    const segments = [];

    for (const action of timely.timelyActionsOverlayViewModel.timelyActions) {
      const vm = action?.timelyActionViewModel;
      if (!vm) continue;
      if (vm.content?.buttonViewModel?.title !== 'Jump ahead') continue;

      const triggerMs = parseInt(vm.startTimeMilliseconds, 10);
      if (isNaN(triggerMs)) continue;

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
      }
    }

    return segments;
  }

  // ── Arm the auto-skip ────────────────────────────────────────────────────

  let activeSegments = [];
  let handler = null;
  let lastLogTime = 0;

  function armSkip(segments) {
    if (!segments.length) return;

    const video = document.querySelector('video');
    if (!video) {
      console.log('[AutoSkip] No <video> element found');
      return;
    }

    // Merge new segments (avoid duplicates)
    for (const seg of segments) {
      const key = seg.triggerMs + '-' + seg.seekTargetMs;
      if (!activeSegments.some(s => s.triggerMs === seg.triggerMs)) {
        activeSegments.push({ ...seg, done: false });
        console.log('[AutoSkip] Armed: skip at',
          (seg.triggerMs / 1000).toFixed(1) + 's →',
          (seg.seekTargetMs / 1000).toFixed(1) + 's',
          '(' + Math.round((seg.seekTargetMs - seg.triggerMs) / 1000) + 's jump)');
      }
    }

    // Only attach handler once
    if (handler) return;

    handler = () => {
      const ms = video.currentTime * 1000;

      // Periodic debug log (every 30s)
      if (ms - lastLogTime > 30000) {
        lastLogTime = ms;
        const pending = activeSegments.filter(s => !s.done);
        if (pending.length) {
          console.log('[AutoSkip] ▶ At', (ms / 1000).toFixed(1) + 's,',
            pending.length, 'pending skip(s). Next:',
            (pending[0].triggerMs / 1000).toFixed(1) + 's');
        }
      }

      for (const seg of activeSegments) {
        if (seg.done) continue;

        // Wide trigger window: from trigger point to trigger + 5s
        if (ms >= seg.triggerMs && ms < seg.triggerMs + 5000) {
          const skipSec = Math.round((seg.seekTargetMs - seg.triggerMs) / 1000);

          console.log('[AutoSkip] ⏭ Triggering skip at', (ms / 1000).toFixed(1) + 's →',
            (seg.seekTargetMs / 1000).toFixed(1) + 's');

          const player = document.querySelector('#movie_player');
          if (player && typeof player.seekTo === 'function') {
            player.seekTo(seg.seekTargetMs / 1000, true);
          } else {
            video.currentTime = seg.seekTargetMs / 1000;
          }

          // Verify the seek worked after a short delay
          setTimeout(() => {
            const after = video.currentTime * 1000;
            if (after >= seg.seekTargetMs - 2000) {
              seg.done = true;
              console.log('[AutoSkip] ✓ Seek confirmed at', (after / 1000).toFixed(1) + 's');
              window.postMessage({
                source: 'autoskip', type: 'skipped', seconds: skipSec,
              }, '*');
            } else {
              console.log('[AutoSkip] ✗ Seek may have failed. Video at',
                (after / 1000).toFixed(1) + 's, expected ≥', (seg.seekTargetMs / 1000).toFixed(1) + 's');
              // Don't mark done — will retry on next timeupdate
            }
          }, 500);

          break;
        }
      }
    };

    video.addEventListener('timeupdate', handler);
    console.log('[AutoSkip] Handler attached to <video>');
  }

  // ── Process data ─────────────────────────────────────────────────────────

  function process(data) {
    const segments = extractSkipSegments(data);
    if (segments.length) {
      armSkip(segments);
    } else {
      console.log('[AutoSkip] No Jump ahead segments in this data');
    }
  }

  // ── Reset on video change ────────────────────────────────────────────────

  function reset() {
    activeSegments = [];
    if (handler) {
      const video = document.querySelector('video');
      if (video) video.removeEventListener('timeupdate', handler);
      handler = null;
    }
    lastLogTime = 0;
  }

  // ── Triggers ─────────────────────────────────────────────────────────────

  let attempts = 0;
  const poll = setInterval(() => {
    attempts++;
    const data = getPageData();
    if (data) {
      clearInterval(poll);
      console.log('[AutoSkip] Page data found (attempt ' + attempts + ')');
      process(data);
    } else if (attempts > 50) {
      clearInterval(poll);
      console.log('[AutoSkip] No page data found');
    }
  }, 300);

  document.addEventListener('yt-navigate-finish', () => {
    console.log('[AutoSkip] Navigation detected — resetting');
    reset();
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
      if (url.includes('/youtubei/v1/next')) {
        resp.clone().json().then(d => {
          console.log('[AutoSkip] Intercepted /next response');
          process(d);
        }).catch(() => {});
      }
    } catch (_) {}
    return resp;
  };
})();
