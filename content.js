// YouTube Auto Skip — content script (ISOLATED world).
// Strategy 1: Receive skip-segment timestamps from injected.js → seek directly.
// Strategy 2: MutationObserver fallback — click the button if user reveals it.

// ── Inject the MAIN-world script into YouTube's page context ────────────────
const s = document.createElement('script');
s.src = chrome.runtime.getURL('injected.js');
(document.head || document.documentElement).appendChild(s);
s.onload = () => s.remove();

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

// ── Strategy 1: Auto-seek from injected.js timestamps ─────────────────────

let activeHandler = null;

window.addEventListener('message', (e) => {
  if (e.data?.source !== 'autoskip' || e.data?.type !== 'segments') return;
  setupAutoSeek(e.data.segments);
});

function setupAutoSeek(segments) {
  if (!segments?.length) return;

  const video = document.querySelector('video');
  if (!video) return;

  // Remove previous listener
  if (activeHandler) video.removeEventListener('timeupdate', activeHandler);

  const skipped = new Set();

  activeHandler = () => {
    const ms = video.currentTime * 1000;
    for (const seg of segments) {
      const key = `${seg.startMs}-${seg.endMs}`;
      if (skipped.has(key)) continue;
      // Trigger when within 1.5 s of the segment start
      if (ms >= seg.startMs && ms < seg.startMs + 1500) {
        const skipSec = Math.round((seg.endMs - seg.startMs) / 1000);
        video.currentTime = seg.endMs / 1000;
        skipped.add(key);
        showToast(`Jump ahead · ${skipSec}s skipped`);
        console.log('[AutoSkip] Seeked past segment', seg);
        break;
      }
    }
  };

  video.addEventListener('timeupdate', activeHandler);
  console.log('[AutoSkip] Auto-seek armed for', segments.length, 'segment(s)');
}

// ── Strategy 2: Button-click fallback (when user moves mouse) ─────────────

let lastClick = 0;

function tryClick() {
  if (Date.now() - lastClick < 800) return;

  for (const sel of SKIP_SELECTORS) {
    const btn = document.querySelector(sel);
    if (btn && isVisible(btn)) {
      clickBtn(btn, btn.getAttribute('aria-label') || btn.innerText || 'Jumped ahead');
      return;
    }
  }

  const player = document.querySelector('#movie_player, .html5-video-player');
  if (!player) return;
  for (const el of player.querySelectorAll('button, [role="button"]')) {
    const text = (el.innerText || el.textContent || '').trim();
    if (SKIP_TEXT.test(text) && isVisible(el)) {
      clickBtn(el, text);
      return;
    }
  }
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

// MutationObserver catches the button appearing when user moves their mouse
const observer = new MutationObserver(tryClick);
observer.observe(document.body, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ['class', 'style', 'aria-label'],
});
