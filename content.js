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
      position:      'absolute',
      bottom:        '64px',
      left:          '50%',
      transform:     'translateX(-50%)',
      background:    'rgba(0,0,0,0.78)',
      color:         '#fff',
      padding:       '7px 16px',
      borderRadius:  '20px',
      fontSize:      '14px',
      fontFamily:    'Roboto, sans-serif',
      fontWeight:    '500',
      letterSpacing: '0.01em',
      zIndex:        '9999',
      pointerEvents: 'none',
      opacity:       '0',
      transition:    'opacity 0.15s ease',
      whiteSpace:    'nowrap',
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
  if (Date.now() - lastClick < 800) return;

  for (const selector of SKIP_SELECTORS) {
    const btn = document.querySelector(selector);
    if (btn && isVisible(btn)) {
      const label = (btn.getAttribute('aria-label') || btn.innerText || 'Jumped ahead').trim();
      clickAndNotify(btn, label);
      return;
    }
  }

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

// ── Smart nudge ───────────────────────────────────────────────────────────────
// Only nudge when controls are already hidden (ytp-autohide on the player).
// Immediately re-add ytp-autohide after the check so controls collapse again
// instead of staying visible for YouTube's full 3-second idle timer.

function nudgeIfHidden() {
  const player = document.querySelector('#movie_player, .html5-video-player');
  if (!player) return;

  const video = document.querySelector('video');
  if (!video || video.paused) return; // no need to nudge when paused

  // If controls are already visible the user is interacting — MutationObserver handles it
  if (!player.classList.contains('ytp-autohide')) return;

  const r = player.getBoundingClientRect();
  player.dispatchEvent(new MouseEvent('mousemove', {
    bubbles: true, cancelable: true, view: window,
    clientX: r.left + r.width / 2,
    clientY: r.top + r.height / 2,
  }));

  // Give YouTube ~300ms to render the button, then click + re-hide immediately
  setTimeout(() => {
    tryClick();
    player.classList.add('ytp-autohide');
  }, 300);
}

// ── Observers ─────────────────────────────────────────────────────────────────

// React instantly when button appears while user is already interacting
const observer = new MutationObserver(tryClick);
observer.observe(document.body, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ['class', 'style', 'aria-label'],
});

// Periodic nudge when controls are hidden
setInterval(nudgeIfHidden, 1000);
