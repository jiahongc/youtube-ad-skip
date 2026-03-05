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

  function getPageData() {
    if (window.ytInitialData) return window.ytInitialData;
    try { return window.ytcfg?.get?.('INITIAL_DATA'); } catch (_) {}
    return null;
  }

  function collectChapterLists(node, out, depth, seen) {
    if (!node || typeof node !== 'object' || (depth || 0) > 20) return;
    if (!seen) seen = new WeakSet();
    if (seen.has(node)) return;
    seen.add(node);

    if (node.chapterRenderer && typeof node.chapterRenderer === 'object') {
      out.push([node.chapterRenderer]);
      return;
    }

    if (Array.isArray(node) && node.length && node.every(item => item?.chapterRenderer)) {
      out.push(node.map(item => item.chapterRenderer));
      return;
    }

    for (const v of Object.values(node)) collectChapterLists(v, out, (depth || 0) + 1, seen);
  }

  // Chapter titles that indicate a break/sponsored section to skip
  const BREAK_PATTERN = /\b(ad|ads|ad[- ]?break|break|sponsor(?:ed|ship)?|paid|promo(?:tion)?|commercial|message from|word from)\b/i;

  // ── Extract Jump ahead segments ──────────────────────────────────────────

  function extractJumpAheadSegments(data) {
    const timelyVm = findDeep(data, 'timelyActionsOverlayViewModel');
    const timelyActions = timelyVm?.timelyActions || timelyVm?.timelyActionsOverlayViewModel?.timelyActions;
    if (!Array.isArray(timelyActions)) return [];

    const segments = [];
    for (const action of timelyActions) {
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
        console.log('[AutoSkip] Jump ahead: trigger', (triggerMs / 1000).toFixed(1) + 's ->',
          (seekTargetMs / 1000).toFixed(1) + 's (' + Math.round((seekTargetMs - triggerMs) / 1000) + 's)');
      }
    }
    return segments;
  }

  // ── Extract chapter-break segments ──────────────────────────────────────

  function extractChapterSegments(data) {
    const segments = [];

    // Keep chapter collections separate so "next chapter" stays in the same list.
    const chapterLists = [];
    collectChapterLists(data, chapterLists, 0, new WeakSet());
    if (!chapterLists.length) return segments;

    for (const rawList of chapterLists) {
      const chapters = rawList
        .map(c => ({
          title: c.title?.simpleText || c.title?.runs?.[0]?.text || '',
          startMs: parseInt(c.timeRangeStartMillis, 10),
        }))
        .filter(c => !isNaN(c.startMs))
        .sort((a, b) => a.startMs - b.startMs);

      if (!chapters.length) continue;

      console.log('[AutoSkip] Chapters found:', chapters.map(c => '"' + c.title + '" @' + (c.startMs / 1000).toFixed(0) + 's').join(', '));

      for (let i = 0; i < chapters.length; i++) {
        const ch = chapters[i];
        if (!BREAK_PATTERN.test(ch.title)) continue;

        const nextChapter = chapters[i + 1];
        if (!nextChapter) continue;

        segments.push({
          label: '"' + ch.title + '"',
          triggerMs: ch.startMs,
          seekTargetMs: nextChapter.startMs,
        });
        console.log('[AutoSkip] Break chapter:', '"' + ch.title + '"',
          (ch.startMs / 1000).toFixed(1) + 's ->', (nextChapter.startMs / 1000).toFixed(1) + 's');
      }
    }

    return segments;
  }

  // ── Arm the auto-skip handler ────────────────────────────────────────────

  let activeSegments = [];
  let handler = null;
  let attachedVideo = null;
  let lastLogTime = -99999;

  function attachHandlerIfReady() {
    const video = document.querySelector('video');
    if (!video) return false;

    if (handler && attachedVideo === video) return true;

    if (handler && attachedVideo) {
      attachedVideo.removeEventListener('timeupdate', handler);
    }

    handler = () => {
      const ms = video.currentTime * 1000;

      // Re-arm if user seeked back before a segment's trigger
      for (const seg of activeSegments) {
        if (seg.done && ms < seg.triggerMs) seg.done = false;
      }

      // Status log every 30s
      if (ms - lastLogTime > 30000) {
        lastLogTime = ms;
        const pending = activeSegments.filter(s => !s.done);
        if (pending.length) {
          console.log('[AutoSkip] At', (ms / 1000).toFixed(1) + 's |',
            pending.map(s => s.label + ' @' + (s.triggerMs / 1000).toFixed(1) + 's').join(', '));
        }
      }

      for (const seg of activeSegments) {
        if (seg.done) continue;
        // Trigger anywhere between start and end of the skip zone
        if (ms >= seg.triggerMs && ms < seg.seekTargetMs - 500) {
          console.log('[AutoSkip] Skipping', seg.label, 'at',
            (ms / 1000).toFixed(1) + 's -> ' + (seg.seekTargetMs / 1000).toFixed(1) + 's');

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
              console.log('[AutoSkip] Confirmed at', (after / 1000).toFixed(1) + 's');
              window.postMessage({ source: 'autoskip', type: 'skipped', seconds: skipSec, label: seg.label }, '*');
            } else {
              console.log('[AutoSkip] Seek failed, retrying...');
            }
          }, 500);
          break;
        }
      }
    };

    video.addEventListener('timeupdate', handler);
    attachedVideo = video;
    console.log('[AutoSkip] Handler attached |', activeSegments.length, 'segment(s)');
    return true;
  }

  function armSkip(newSegments) {
    if (!newSegments.length) return;

    // Merge, avoiding duplicates by full skip window and label.
    for (const seg of newSegments) {
      if (!activeSegments.some(s => s.triggerMs === seg.triggerMs && s.seekTargetMs === seg.seekTargetMs && s.label === seg.label)) {
        activeSegments.push({ ...seg, done: false });
      }
    }

    if (!attachHandlerIfReady()) {
      console.log('[AutoSkip] No <video> found yet; will attach when ready');
    }
  }

  // ── Process a data payload ───────────────────────────────────────────────

  function process(data) {
    const jumpAhead = extractJumpAheadSegments(data);
    let chapters = [];
    try {
      chapters = extractChapterSegments(data);
    } catch (e) {
      console.log('[AutoSkip] Chapter extraction error:', e);
    }
    const all = [...jumpAhead, ...chapters];
    if (all.length) armSkip(all);
  }

  // ── Reset on video change ────────────────────────────────────────────────

  function reset() {
    activeSegments = [];
    lastLogTime = -99999;
    if (handler && attachedVideo) {
      attachedVideo.removeEventListener('timeupdate', handler);
    }
    handler = null;
    attachedVideo = null;
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
      attachHandlerIfReady();
    } else if (attempts > 50) {
      clearInterval(poll);
    }
  }, 200);

  // 2. SPA navigation — try immediately, then retry at 500ms + 1500ms
  document.addEventListener('yt-navigate-finish', () => {
    console.log('[AutoSkip] Navigation - resetting');
    reset();
    const immediate = getPageData();
    if (immediate) {
      process(immediate);
      attachHandlerIfReady();
      return;
    }
    setTimeout(() => {
      const d = getPageData();
      if (d) process(d);
      attachHandlerIfReady();
    }, 500);
    setTimeout(() => {
      const d = getPageData();
      if (d) process(d);
      attachHandlerIfReady();
    }, 1500);
  });

  // Keep trying to attach if segments are known but the video element appears later.
  const rootObserver = new MutationObserver(() => {
    if (activeSegments.length && !handler) attachHandlerIfReady();
  });
  rootObserver.observe(document.documentElement || document, { childList: true, subtree: true });

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
          attachHandlerIfReady();
        }).catch(() => {});
      }
    } catch (_) {}
    return resp;
  };
})();
