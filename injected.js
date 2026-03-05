// Runs in YouTube's page context (injected via <script> tag).
// Finds SMART_SKIP segment data and posts timestamps to the content script.

(function () {
  'use strict';

  console.log('[AutoSkip] injected.js loaded in MAIN world');

  // ── Find ytInitialData from multiple sources ─────────────────────────────

  function getPageData() {
    // Try known globals
    if (window.ytInitialData) return window.ytInitialData;

    // Try ytcfg
    try {
      const cfg = window.ytcfg?.get?.('INITIAL_DATA');
      if (cfg) return cfg;
    } catch (_) {}

    // Try the yt.config_ path
    try {
      if (window.yt?.config_?.INITIAL_DATA) return window.yt.config_.INITIAL_DATA;
    } catch (_) {}

    return null;
  }

  // ── Extract skip segments from entity store ──────────────────────────────

  function findSkipSegments(data) {
    if (!data) return [];

    const mutations =
      data?.frameworkUpdates?.entityBatchUpdate?.mutations;
    if (!mutations) {
      console.log('[AutoSkip] No entityBatchUpdate.mutations found');
      return [];
    }

    console.log('[AutoSkip] Found', mutations.length, 'entity mutations');

    const segments = [];

    for (const m of mutations) {
      if (!m.entityKey || !m.payload) continue;

      let isSkip = false;
      try {
        const decoded = atob(decodeURIComponent(m.entityKey));
        isSkip = decoded.includes('SMART_SKIP');
      } catch (_) {
        try { isSkip = atob(m.entityKey).includes('SMART_SKIP'); } catch (_2) {}
      }

      if (!isSkip) continue;

      console.log('[AutoSkip] SMART_SKIP entity found:', JSON.stringify(m, null, 2));

      const timing = extractTiming(m.payload);
      if (timing) {
        segments.push(timing);
        console.log('[AutoSkip] Extracted timing:', timing);
      } else {
        console.log('[AutoSkip] Could not extract timing — raw payload keys:',
          flatKeys(m.payload));
      }
    }

    return segments;
  }

  // Walk an object and return all leaf key paths (helps us discover field names)
  function flatKeys(obj, prefix, depth) {
    if (!obj || typeof obj !== 'object' || (depth || 0) > 6) return [];
    const out = [];
    for (const [k, v] of Object.entries(obj)) {
      const path = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === 'object') {
        out.push(...flatKeys(v, path, (depth || 0) + 1));
      } else {
        out.push(`${path}=${v}`);
      }
    }
    return out;
  }

  function extractTiming(obj, depth) {
    if (!obj || typeof obj !== 'object' || (depth || 0) > 10) return null;

    const keys = Object.keys(obj);
    const startKey = keys.find(k => /start.*(ms|millis|time)/i.test(k));
    const endKey   = keys.find(k => /end.*(ms|millis|time)/i.test(k));
    const durKey   = keys.find(k => /duration.*(ms|millis|time)/i.test(k));

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

  // ── Post to content script ───────────────────────────────────────────────

  function post(segments) {
    window.postMessage({ source: 'autoskip', type: 'segments', segments }, '*');
  }

  function run(data) {
    const segments = findSkipSegments(data);
    if (segments.length) {
      post(segments);
      console.log('[AutoSkip] Posted', segments.length, 'segment(s) to content script');
    }
  }

  // ── Triggers ─────────────────────────────────────────────────────────────

  // 1. Poll for page data on initial load
  let attempts = 0;
  const poll = setInterval(() => {
    attempts++;
    const data = getPageData();
    if (data) {
      clearInterval(poll);
      console.log('[AutoSkip] Found page data on attempt', attempts);
      run(data);
    } else if (attempts > 30) {
      clearInterval(poll);
      console.log('[AutoSkip] Gave up polling for page data after', attempts, 'attempts');
    }
  }, 400);

  // 2. SPA navigation
  document.addEventListener('yt-navigate-finish', () => {
    setTimeout(() => {
      const data = getPageData();
      if (data) run(data);
    }, 1500);
  });

  // 3. Intercept fetch for /next API responses
  const origFetch = window.fetch;
  window.fetch = async function (...args) {
    const resp = await origFetch.apply(this, args);
    try {
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
      if (url.includes('/youtubei/v1/next') || url.includes('/youtubei/v1/player')) {
        resp.clone().json().then(d => {
          console.log('[AutoSkip] Intercepted fetch:', url.split('?')[0]);
          run(d);
        }).catch(() => {});
      }
    } catch (_) {}
    return resp;
  };
})();
