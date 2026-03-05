// YouTube Auto Skip — auto-clicks "Jump ahead" and other native skip buttons.

// Known selectors (best-effort; YouTube changes these periodically)
const SKIP_SELECTORS = [
  '.ytp-jump-ahead-button',           // Jump ahead (guessed from ytp- naming convention)
  '.ytp-skip-intro-button',           // Skip intro (chapters)
  '.ytp-ad-skip-button',              // Skippable pre-roll ads
  '.ytp-skip-ad-button',              // Alt ad skip class
  'button.ytp-ad-skip-button-modern', // Modern ad skip variant
];

// Text patterns to match against button labels
const SKIP_TEXT = /jump ahead|skip/i;

// Find any visible button inside the player whose label matches
function findButtonByText() {
  const player = document.querySelector('#movie_player, .html5-video-player');
  if (!player) return null;

  for (const el of player.querySelectorAll('button, [role="button"]')) {
    const text = el.innerText || el.textContent || '';
    if (SKIP_TEXT.test(text) && el.offsetParent !== null) {
      return el;
    }
  }
  return null;
}

function tryClick() {
  // Try known selectors first (faster)
  for (const selector of SKIP_SELECTORS) {
    const btn = document.querySelector(selector);
    if (btn && btn.offsetParent !== null) {
      btn.click();
      console.log('[AutoSkip] Clicked:', selector);
      return;
    }
  }

  // Fallback: search by button text ("Jump ahead", "Skip", etc.)
  const btn = findButtonByText();
  if (btn) {
    btn.click();
    console.log('[AutoSkip] Clicked by text:', btn.innerText.trim());
  }
}

// React immediately when the DOM changes
const observer = new MutationObserver(tryClick);
observer.observe(document.body, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ['class', 'style'],
});

// Polling fallback every 500ms
setInterval(tryClick, 500);
