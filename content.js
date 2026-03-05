// YouTube Auto Skip — auto-clicks "Jump ahead" and other native skip buttons.

const SKIP_SELECTORS = [
  '[aria-label="Jump ahead"]',        // Jump ahead (ViewModel renderer)
  '[title="Jump ahead"]',             // Alt attribute
  '.ytp-jump-ahead-button',           // ytp- guess
  '.ytp-skip-intro-button',           // Skip intro
  '.ytp-ad-skip-button',              // Pre-roll ad skip
  '.ytp-skip-ad-button',
  'button.ytp-ad-skip-button-modern',
];

const SKIP_TEXT = /^jump ahead$|^skip/i;

// offsetParent is null for position:fixed/absolute overlays — use getBoundingClientRect instead
function isVisible(el) {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

// ── Toast notification ────────────────────────────────────────────────────────

function showToast(label) {
  const player = document.querySelector('#movie_player');
  if (!player) return;

  let toast = document.getElementById('autoskip-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'autoskip-toast';
    Object.assign(toast.style, {
      position:       'absolute',
      bottom:         '64px',
      left:           '50%',
      transform:      'translateX(-50%)',
      background:     'rgba(0,0,0,0.78)',
      color:          '#fff',
      padding:        '7px 16px',
      borderRadius:   '20px',
      fontSize:       '14px',
      fontFamily:     'Roboto, sans-serif',
      fontWeight:     '500',
      letterSpacing:  '0.01em',
      zIndex:         '9999',
      pointerEvents:  'none',
      opacity:        '0',
      transition:     'opacity 0.15s ease',
      whiteSpace:     'nowrap',
    });
    player.appendChild(toast);
  }

  toast.textContent = `⏭  ${label}`;
  toast.style.opacity = '1';
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (toast.style.opacity = '0'), 4000);
}

// ── Click logic ───────────────────────────────────────────────────────────────

let lastClick = 0;

function clickAndNotify(btn, label) {
  const video = document.querySelector('video');
  const timeBefore = video ? video.currentTime : null;

  btn.click();
  lastClick = Date.now();

  // Measure how many seconds were actually skipped
  setTimeout(() => {
    if (video && timeBefore !== null) {
      const skipped = Math.round(video.currentTime - timeBefore);
      showToast(skipped > 0 ? `${label} · ${skipped}s skipped` : label);
    } else {
      showToast(label);
    }
  }, 300);

  console.log('[AutoSkip] Clicked:', label);
}

function tryClick() {
  if (Date.now() - lastClick < 800) return; // debounce

  for (const selector of SKIP_SELECTORS) {
    const btn = document.querySelector(selector);
    if (btn && isVisible(btn)) {
      const label = (btn.getAttribute('aria-label') || btn.innerText || 'Jumped ahead').trim();
      clickAndNotify(btn, label);
      return;
    }
  }

  // Last resort: search by visible text inside the player
  const player = document.querySelector('#movie_player, .html5-video-player');
  if (!player) return;
  for (const el of player.querySelectorAll('button, [role="button"]')) {
    const text = (el.innerText || el.textContent || '').trim();
    if (SKIP_TEXT.test(text) && isVisible(el)) {
      clickAndNotify(el, text);
      return;
    }
  }
}

// ── Observers ─────────────────────────────────────────────────────────────────

const observer = new MutationObserver(tryClick);
observer.observe(document.body, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ['class', 'style', 'aria-label'],
});

// Periodically nudge the player with a synthetic mousemove so YouTube reveals
// the Jump ahead button even when the user isn't moving their mouse.
function nudgePlayer() {
  const player = document.querySelector('#movie_player, .html5-video-player');
  if (!player) return;
  const r = player.getBoundingClientRect();
  player.dispatchEvent(new MouseEvent('mousemove', {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX: r.left + r.width / 2,
    clientY: r.top + r.height / 2,
  }));
}

setInterval(() => { nudgePlayer(); tryClick(); }, 500);
