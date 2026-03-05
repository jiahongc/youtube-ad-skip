// Runs in YouTube's page context (world: "MAIN", document_start).
// Finds SMART_SKIP segment data and posts timestamps to the content script.

(function () {
  'use strict';

  console.log('[AutoSkip] injected.js loaded');

  // ── Find page data from multiple sources ─────────────────────────────────

  function getPageData() {
    if (window.ytInitialData) return window.ytInitialData;
    try { const d = window.ytcfg?.get?.('INITIAL_DATA'); if (d) return d; } catch (_) {}
    try { if (window.yt?.config_?.INITIAL_DATA) return window.yt.config_.INITIAL_DATA; } catch (_) {}
    return null;
  }

  // ── Extract SMART_SKIP markers from entity mutations ─────────────────────

  function findSkipSegments(data) {
    if (!data) return [];

    const mutations = data?.frameworkUpdates?.entityBatchUpdate?.mutations;
    if (!mutations) return [];

    const segments = [];

    for (const m of mutations) {
      if (!m.entityKey || !m.payload) continue;

      // Decode the base64 entity key to check for SMART_SKIP
      let isSkip = false;
      try {
        isSkip = atob(decodeURIComponent(m.entityKey)).includes('SMART_SKIP');
      } catch (_) {
        try { isSkip = atob(m.entityKey).includes('SMART_SKIP'); } catch (_2) {}
      }
      if (!isSkip) continue;

      console.log('[AutoSkip] SMART_SKIP entity:', JSON.stringify(m.payload));

      // YouTube stores markers in: payload.macroMarkersListEntity.markersList.markers[]
      // Each marker has: startMillis (string), durationMillis (string), sourceType
      const markers =
        m.payload?.macroMarkersListEntity?.markersList?.markers;

      if (!markers?.length) continue;

      for (const marker of markers) {
        const startMs = parseInt(marker.startMillis, 10);
        const durMs   = parseInt(marker.durationMillis, 10);

        if (isNaN(startMs)) continue;

        // durationMillis:"0" means the marker is a point, not a range.
        // YouTube's Jump ahead seeks forward from this point — we need the
        // end position. Look for the next marker or use a fallback.
        segments.push({
          startMs,
          durationMs: durMs || 0,
          // We'll resolve the end time later if there are multiple markers
          raw: marker,
        });
      }
    }

    // If we have multiple markers, each one's "end" is the next one's "start".
    // If there's only one marker with duration 0, we can't know the end time
    // from the data alone — fall back to button-clicking.
    return segments;
  }

  // ── Resolve end times and post to content script ─────────────────────────

  function process(data) {
    const raw = findSkipSegments(data);
    if (!raw.length) return;

    const resolved = [];

    for (let i = 0; i < raw.length; i++) {
      const seg = raw[i];
      let endMs;

      if (seg.durationMs > 0) {
        endMs = seg.startMs + seg.durationMs;
      } else if (i + 1 < raw.length) {
        // End at the next marker's start
        endMs = raw[i + 1].startMs;
      } else {
        // Single marker, duration 0 — can't determine end.
        // Signal content script to use button-click fallback at this timestamp.
        endMs = 0;
      }

      resolved.push({ startMs: seg.startMs, endMs });
    }

    window.postMessage(
      { source: 'autoskip', type: 'segments', segments: resolved },
      '*'
    );
    console.log('[AutoSkip] Posted segments:', resolved);
  }

  // ── Triggers ─────────────────────────────────────────────────────────────

  // 1. Poll for page data
  let attempts = 0;
  const poll = setInterval(() => {
    attempts++;
    const data = getPageData();
    if (data) {
      clearInterval(poll);
      console.log('[AutoSkip] Page data found on attempt', attempts);
      process(data);
    } else if (attempts > 50) {
      clearInterval(poll);
      console.log('[AutoSkip] No page data after', attempts, 'attempts');
    }
  }, 300);

  // 2. SPA navigation
  document.addEventListener('yt-navigate-finish', () => {
    setTimeout(() => {
      const data = getPageData();
      if (data) process(data);
    }, 1500);
  });

  // 3. Intercept fetch — catches /next and /player API responses
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
