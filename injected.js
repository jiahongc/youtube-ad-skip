// Runs in YouTube's page context (world: "MAIN").
// Extracts SMART_SKIP segment timestamps from YouTube's entity store
// and posts them to the content script so it can auto-seek.

(function () {
  'use strict';

  // ── Extract skip segments from YouTube's entity batch store ────────────────

  function findSkipSegments(data) {
    const mutations =
      data?.frameworkUpdates?.entityBatchUpdate?.mutations;
    if (!mutations) return [];

    const segments = [];

    for (const m of mutations) {
      if (!m.entityKey || !m.payload) continue;

      // Entity keys are base64-encoded protobufs — decode to look for SMART_SKIP
      let isSkip = false;
      try {
        const decoded = atob(decodeURIComponent(m.entityKey));
        isSkip = decoded.includes('SMART_SKIP');
      } catch (_) {
        try { isSkip = atob(m.entityKey).includes('SMART_SKIP'); } catch (_2) {}
      }

      if (!isSkip) continue;

      // Walk the payload to find timing fields
      const timing = extractTiming(m.payload);
      if (timing) {
        segments.push(timing);
        console.log('[AutoSkip] Found SMART_SKIP segment:', timing);
      } else {
        // Log the raw payload so we can discover the field names
        console.log('[AutoSkip] SMART_SKIP entity (no timing extracted):', JSON.stringify(m.payload));
      }
    }

    return segments;
  }

  // Recursively search an object for pairs of start/end millisecond fields.
  function extractTiming(obj, depth) {
    if (!obj || typeof obj !== 'object' || (depth || 0) > 10) return null;

    const keys = Object.keys(obj);
    // YouTube typically uses camelCase names ending in Ms
    const startKey = keys.find(k => /^start.*ms$/i.test(k));
    const endKey   = keys.find(k => /^end.*ms$/i.test(k));
    const durKey   = keys.find(k => /^duration.*ms$/i.test(k));

    if (startKey) {
      const startMs = parseInt(obj[startKey], 10);
      let endMs = endKey ? parseInt(obj[endKey], 10) : NaN;
      if (isNaN(endMs) && durKey) endMs = startMs + parseInt(obj[durKey], 10);
      if (!isNaN(startMs) && !isNaN(endMs) && endMs > startMs) {
        return { startMs, endMs };
      }
    }

    for (const v of Object.values(obj)) {
      const r = extractTiming(v, (depth || 0) + 1);
      if (r) return r;
    }
    return null;
  }

  // ── Broadcast to content script ───────────────────────────────────────────

  function post(segments) {
    window.postMessage({ source: 'autoskip', type: 'segments', segments }, '*');
  }

  function run(data) {
    const segments = findSkipSegments(data);
    if (segments.length) post(segments);
  }

  // ── Triggers ──────────────────────────────────────────────────────────────

  // 1. Initial page load — wait for ytInitialData to exist
  const poll = setInterval(() => {
    if (window.ytInitialData) {
      clearInterval(poll);
      run(window.ytInitialData);
    }
  }, 400);

  // 2. SPA navigation (YouTube is a single-page app)
  document.addEventListener('yt-navigate-finish', () => {
    setTimeout(() => {
      if (window.ytInitialData) run(window.ytInitialData);
    }, 1500);
  });

  // 3. Intercept fetch — some data arrives via /youtubei/v1/next after navigation
  const origFetch = window.fetch;
  window.fetch = async function (...args) {
    const resp = await origFetch.apply(this, args);
    try {
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
      if (url.includes('/youtubei/v1/next') || url.includes('/youtubei/v1/player')) {
        resp.clone().json().then(d => run(d)).catch(() => {});
      }
    } catch (_) {}
    return resp;
  };
})();
