// YouTube Auto Skip — auto-clicks "Jump ahead" and other native skip buttons.

// Known selectors (covers both old ytp- system and new ViewModel renderer)
const SKIP_SELECTORS = [
  '[aria-label="Jump ahead"]',        // Jump ahead (ViewModel renderer, aria-label)
  '.ytp-jump-ahead-button',           // Jump ahead (ytp- guess)
  '.ytp-skip-intro-button',           // Skip intro (chapters)
  '.ytp-ad-skip-button',              // Skippable pre-roll ads
  '.ytp-skip-ad-button',              // Alt ad skip class
  'button.ytp-ad-skip-button-modern', // Modern ad skip variant
];

// Text patterns to match against button labels (last-resort fallback)
const SKIP_TEXT = /^jump ahead$|^skip/i;

function findButtonByText() {
  const player = document.querySelector('#movie_player, .html5-video-player');
  if (!player) return null;
  for (const el of player.querySelectorAll('button, [role="button"]')) {
    const text = (el.innerText || el.textContent || '').trim();
    if (SKIP_TEXT.test(text) && el.offsetParent !== null) {
      return el;
    }
  }
  return null;
}

function tryClick() {
  for (const selector of SKIP_SELECTORS) {
    const btn = document.querySelector(selector);
    if (btn && btn.offsetParent !== null) {
      btn.click();
      console.log('[AutoSkip] Clicked:', selector);
      return;
    }
  }
  const btn = findButtonByText();
  if (btn) {
    btn.click();
    console.log('[AutoSkip] Clicked by text:', (btn.innerText || btn.textContent).trim());
  }
}

const observer = new MutationObserver(tryClick);
observer.observe(document.body, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ['class', 'style', 'aria-label'],
});

setInterval(tryClick, 500);
