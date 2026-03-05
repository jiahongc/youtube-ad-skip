// YouTube Auto Skip — content script (ISOLATED world).
// Strategy 1: Auto-seek using timestamps from injected.js
// Strategy 2: Targeted nudge at skip-point timestamp to reveal + click button
// Strategy 3: MutationObserver fallback when user moves mouse naturally

const SKIP_SELECTORS = [
  '[aria-label="Jump ahead"]',
  '[title="Jump ahead"]',
  '.ytp-jump-ahead-button',
  '.ytp-skip-intro-button',
  '.ytp-ad-skip-button',
  '.ytp-skip-ad-button',
  'button.ytp-ad-skip-button-modern',
];
const SKIP_TEXT = /^jump ahead$|^skip/i;

function isVisible(el) {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function showToast(msg) {
  const player = document.querySelector('#movie_player');
  if (!player) return;

  let t = document.getElementById('autoskip-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'autoskip-toast';
    Object.assign(t.style, {
      position: 'absolute', bottom: '64px', left: '50%',
      transform: 'translateX(-50%)',
      background: 'rgba(0,0,0,0.78)', color: '#fff',
      padding: '7px 16px', borderRadius: '20px',
      fontSize: '14px', fontFamily: 'Roboto, sans-serif',
      fontWeight: '500', letterSpacing: '0.01em',
      zIndex: '9999', pointerEvents: 'none',
      opacity: '0', transition: 'opacity 0.15s ease', whiteSpace: 'nowrap',
    });
    player.appendChild(t);
  }
  t.textContent = `⏭  ${msg}`;
  t.style.opacity = '1';
  clearTimeout(t._t);
  t._t = setTimeout(() => (t.style.opacity = '0'), 4000);
}

// ── Button clicking ───────────────────────────────────────────────────────────

let lastClick = 0;

function tryClick() {
  if (Date.now() - lastClick < 800) return false;

  for (const sel of SKIP_SELECTORS) {
    const btn = document.querySelector(sel);
    if (btn && isVisible(btn)) {
      clickBtn(btn, btn.getAttribute('aria-label') || btn.innerText || 'Jumped ahead');
      return true;
    }
  }

  const player = document.querySelector('#movie_player, .html5-video-player');
  if (!player) return false;
  for (const el of player.querySelectorAll('button, [role="button"]')) {
    const text = (el.innerText || el.textContent || '').trim();
    if (SKIP_TEXT.test(text) && isVisible(el)) {
      clickBtn(el, text);
      return true;
    }
  }
  return false;
}

function clickBtn(btn, label) {
  const video = document.querySelector('video');
  const before = video ? video.currentTime : null;
  btn.click();
  lastClick = Date.now();
  setTimeout(() => {
    if (video && before !== null) {
      const sec = Math.round(video.currentTime - before);
      showToast(sec > 0 ? `${label} · ${sec}s skipped` : label);
    } else {
      showToast(label);
    }
  }, 300);
}

// ── Targeted nudge — only at the exact skip-point timestamp ───────────────

function nudgeOnce() {
  const player = document.querySelector('#movie_player, .html5-video-player');
  if (!player) return;

  const r = player.getBoundingClientRect();
  player.dispatchEvent(new MouseEvent('mousemove', {
    bubbles: true, cancelable: true, view: window,
    clientX: r.left + r.width / 2,
    clientY: r.top + r.height / 2,
  }));

  // Check for button + re-hide controls quickly
  setTimeout(() => {
    tryClick();
    player.classList.add('ytp-autohide');
  }, 400);
}

// ── Strategy 1 & 2: Handle segments from injected.js ─────────────────────

let activeHandler = null;

window.addEventListener('message', (e) => {
  if (e.data?.source !== 'autoskip' || e.data?.type !== 'segments') return;
  setupAutoSeek(e.data.segments);
});

function setupAutoSeek(segments) {
  if (!segments?.length) return;

  const video = document.querySelector('video');
  if (!video) return;

  if (activeHandler) video.removeEventListener('timeupdate', activeHandler);

  const handled = new Set();

  activeHandler = () => {
    const ms = video.currentTime * 1000;
    for (const seg of segments) {
      const key = `${seg.startMs}`;
      if (handled.has(key)) continue;

      // Within 2 seconds of the skip point
      if (ms >= seg.startMs - 500 && ms < seg.startMs + 2000) {
        handled.add(key);

        if (seg.endMs > 0) {
          // Strategy 1: We know the end time — seek directly
          const skipSec = Math.round((seg.endMs - seg.startMs) / 1000);
          video.currentTime = seg.endMs / 1000;
          showToast(`Jump ahead · ${skipSec}s skipped`);
          console.log('[AutoSkip] Seeked to', seg.endMs, 'ms');
        } else {
          // Strategy 2: Duration is 0, we only know the start.
          // Do a targeted nudge RIGHT NOW to make the button appear, then click it.
          console.log('[AutoSkip] At skip point', seg.startMs, 'ms — nudging to reveal button');
          nudgeOnce();
        }
        break;
      }
    }
  };

  video.addEventListener('timeupdate', activeHandler);
  console.log('[AutoSkip] Armed for', segments.length, 'segment(s):', segments);
}

// ── Strategy 3: MutationObserver — catches button if user moves mouse ─────

const observer = new MutationObserver(() => tryClick());
observer.observe(document.body, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ['class', 'style', 'aria-label'],
});
