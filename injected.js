// Runs in YouTube's page context (world: "MAIN", document_start).
// 1. Skips Jump ahead segments from timelyActionsOverlayViewModel
// 2. Skips chapters whose titles match ad/break/sponsor patterns

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

  function findAllDeep(obj, key, out, depth) {
    if (!obj || typeof obj !== 'object' || (depth || 0) > 20) return out;
    out = out || [];
    if (obj[key] !== undefined) out.push(obj[key]);
    for (const v of Object.values(obj)) findAllDeep(v, key, out, (depth || 0) + 1);
    return out;
  }

  function getPageData() {
    if (window.ytInitialData) return window.ytInitialData;
    try { return window.ytcfg?.get?.('INITIAL_DATA'); } catch (_) {}
    return null;
  }

  // Chapter titles that indicate a break/sponsored section to skip
  const BREAK_PATTERN = /\b(ad|ads|ad[- ]?break|break|sponsor(?:ed|ship)?|paid|promo(?:tion)?|commercial|message from|word from)\b/i;

  // ── Extract Jump ahead segments ──────────────────────────────────────────

  function extractJumpAheadSegments(data) {
    const timely = findDeep(data, 'timelyActionsOverlayViewModel');
    if (!timely?.timelyActionsOverlayViewModel?.timelyActions) return [];

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
        segments.push({ label: 'Jump ahead', triggerMs, seekTargetMs });
        console.log('[AutoSkip] Jump ahead: trigger', (triggerMs/1000).toFixed(1) + 's →',
          (seekTargetMs/1000).toFixed(1) + 's (' + Math.round((seekTargetMs-triggerMs)/1000) + 's)');
      }
    }
    return segments;
  }

  // ── Extract chapter-break segments ──────────────────────────────────────

  function extractChapterSegments(data) {
    const segments = [];

    // Chapters can live in multiple places in YouTube's data
    const allChapters = findAllDeep(data, 'chapterRenderer');
    if (!allChapters?.length) return segments;

    // Sort by start time
    const chapters = allChapters
      .map(c => ({
        title: c.title?.simpleText || c.title?.runs?.[0]?.text || '',
        startMs: parseInt(c.timeRangeStartMillis, 10),
      }))
      .filter(c => !isNaN(c.startMs))
      .sort((a, b) => a.startMs - b.startMs);

    console.log('[AutoSkip] Chapters found:', chapters.map(c => `"${c.title}" @${(c.startMs/1000).toFixed(0)}s`).join(', '));

    for (let i = 0; i < chapters.length; i++) {
      const ch = chapters[i];
      if (!BREAK_PATTERN.test(ch.title)) continue;

      // Seek target is the start of the NEXT chapter
      const nextChapter = chapters[i + 1];
      if (!nextChapter) continue; // last chapter — can't determine end

      segments.push({
        label: `"${ch.title}"`,
        triggerMs: ch.startMs,
        seekTargetMs: nextChapter.startMs,
      });
      console.log('[AutoSkip] Break chapter:', `"${ch.title}"`,
        (ch.startMs/1000).toFixed(1) + 's →', (nextChapter.startMs/1000).toFixed(1) + 's');
    }

    return segments;
  }

  // ── Arm the auto-skip handler ────────────────────────────────────────────

  let activeSegments = [];
  let handler = null;
  let lastLogTime = -99999;

  function armSkip(newSegments) {
    if (!newSegments.length) return;

    const video = document.querySelector('video');
    if (!video) { console.log('[AutoSkip] No <video> found'); return; }

    // Merge, avoiding duplicates
    for (const seg of newSegments) {
      if (!activeSegments.some(s => s.triggerMs === seg.triggerMs)) {
        activeSegments.push({ ...seg, done: false });
      }
    }

    if (handler) return; // already attached

    handler = () => {
      const ms = video.currentTime * 1000;

      // Status log every 30s
      if (ms - lastLogTime > 30000) {
        lastLogTime = ms;
        const pending = activeSegments.filter(s => !s.done);
        if (pending.length) {
          console.log('[AutoSkip] ▶ At', (ms/1000).toFixed(1) + 's |',
            pending.map(s => s.label + ' @' + (s.triggerMs/1000).toFixed(1) + 's').join(', '));
        }
      }

      for (const seg of activeSegments) {
        if (seg.done) continue;
        // Trigger anywhere between start and end of the skip zone
        if (ms >= seg.triggerMs && ms < seg.seekTargetMs - 500) {
          console.log('[AutoSkip] ⏭ Skipping', seg.label, 'at',
            (ms/1000).toFixed(1) + 's → ' + (seg.seekTargetMs/1000).toFixed(1) + 's');

          const player = document.querySelector('#movie_player');
          if (player && typeof player.seekTo === 'function') {
            player.seekTo(seg.seekTargetMs / 1000, true);
          } else {
            video.currentTime = seg.seekTargetMs / 1000;
          }

          setTimeout(() => {
            const after = video.currentTime * 1000;
            if (after >= seg.seekTargetMs - 2000) {
              seg.done = true;
              const skipSec = Math.round((seg.seekTargetMs - seg.triggerMs) / 1000);
              console.log('[AutoSkip] ✓ Confirmed at', (after/1000).toFixed(1) + 's');
              window.postMessage({ source: 'autoskip', type: 'skipped', seconds: skipSec, label: seg.label }, '*');
            } else {
              console.log('[AutoSkip] ✗ Seek failed, retrying...');
            }
          }, 500);
          break;
        }
      }
    };

    video.addEventListener('timeupdate', handler);
    console.log('[AutoSkip] Handler attached |', activeSegments.length, 'segment(s)');
  }

  // ── Process a data payload ───────────────────────────────────────────────

  function process(data) {
    const jumpAhead = extractJumpAheadSegments(data);
    const chapters  = extractChapterSegments(data);
    const all = [...jumpAhead, ...chapters];
    if (all.length) armSkip(all);
  }

  // ── Reset on video change ────────────────────────────────────────────────

  function reset() {
    activeSegments = [];
    lastLogTime = -99999;
    if (handler) {
      const video = document.querySelector('video');
      if (video) video.removeEventListener('timeupdate', handler);
      handler = null;
    }
  }

  // ── Triggers ─────────────────────────────────────────────────────────────

  // 1. Initial page load — poll for ytInitialData
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
    }
  }, 200); // faster polling: 200ms instead of 300ms

  // 2. SPA navigation — try immediately, then retry at 500ms + 1500ms
  document.addEventListener('yt-navigate-finish', () => {
    console.log('[AutoSkip] Navigation — resetting');
    reset();
    // Try immediately (ytInitialData may already be updated)
    const immediate = getPageData();
    if (immediate) { process(immediate); return; }
    // Retry with short delays
    setTimeout(() => { const d = getPageData(); if (d) process(d); }, 500);
    setTimeout(() => { const d = getPageData(); if (d) process(d); }, 1500);
  });

  // 3. Intercept /next API responses
  const origFetch = window.fetch;
  window.fetch = async function (...args) {
    const resp = await origFetch.apply(this, args);
    try {
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
      if (url.includes('/youtubei/v1/next')) {
        resp.clone().json().then(d => {
          console.log('[AutoSkip] Intercepted /next');
          process(d);
        }).catch(() => {});
      }
    } catch (_) {}
    return resp;
  };
})();
