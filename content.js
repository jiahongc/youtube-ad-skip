// YouTube Auto Skip — content script (ISOLATED world).
// Receives skip notifications from injected.js (MAIN world), shows toast,
// and forwards toggle settings from extension storage to injected.js.

const DEFAULT_SETTINGS = {
  skipJumpAhead: true,
  skipAdChapter: true,
};

let settings = { ...DEFAULT_SETTINGS };

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

function postSettingsToPage() {
  window.postMessage({
    source: 'autoskip-config',
    type: 'settings',
    settings,
  }, '*');
}

async function loadSettings() {
  try {
    const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
    settings = {
      skipJumpAhead: stored.skipJumpAhead !== false,
      skipAdChapter: stored.skipAdChapter !== false,
    };
  } catch (_) {
    settings = { ...DEFAULT_SETTINGS };
  }
  postSettingsToPage();
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') return;
  let changed = false;

  if (changes.skipJumpAhead) {
    settings.skipJumpAhead = changes.skipJumpAhead.newValue !== false;
    changed = true;
  }
  if (changes.skipAdChapter) {
    settings.skipAdChapter = changes.skipAdChapter.newValue !== false;
    changed = true;
  }

  if (changed) postSettingsToPage();
});

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

// ── Listen for skip notifications from injected.js ───────────────────────

window.addEventListener('message', (e) => {
  if (e.source !== window) return;
  if (e.data?.source !== 'autoskip') return;

  if (e.data.type === 'skipped') {
    const { seconds: sec, label } = e.data;
    showToast(sec > 0 ? `${label} · ${sec}s skipped` : label);
  }
});

// ── MutationObserver fallback — click skip/jump button ───────────────────

let lastClick = 0;

function tryClick() {
  if (!settings.skipJumpAhead) return;
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

const observer = new MutationObserver(() => tryClick());
if (document.body) {
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'aria-label'],
  });
} else {
  window.addEventListener('DOMContentLoaded', () => {
    if (document.body) {
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style', 'aria-label'],
      });
    }
  }, { once: true });
}

loadSettings();
