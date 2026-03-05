// YouTube Auto Skip Promotions
// Watches for YouTube's native skip button (paid promotions / intros) and clicks it automatically.

// Known selectors for YouTube's skip buttons
const SKIP_SELECTORS = [
  '.ytp-skip-intro-button',        // Skip intro (chapters feature)
  '.ytp-ad-skip-button',           // Skippable pre-roll ads
  '.ytp-skip-ad-button',           // Alt ad skip class
  'button.ytp-ad-skip-button-modern', // Modern ad skip variant
];

// Fallback: find any visible button inside the player that says "Skip"
function findSkipButtonByText() {
  const player = document.querySelector('#movie_player, .html5-video-player');
  if (!player) return null;

  const buttons = player.querySelectorAll('button, .ytp-button');
  for (const btn of buttons) {
    const text = btn.innerText || btn.textContent || '';
    if (/skip/i.test(text) && btn.offsetParent !== null) {
      return btn;
    }
  }
  return null;
}

function tryClickSkip() {
  // Try known selectors first
  for (const selector of SKIP_SELECTORS) {
    const btn = document.querySelector(selector);
    if (btn && btn.offsetParent !== null) {
      btn.click();
      console.log('[AutoSkip] Clicked:', selector);
      return;
    }
  }

  // Fallback: text-based search within the player
  const btn = findSkipButtonByText();
  if (btn) {
    btn.click();
    console.log('[AutoSkip] Clicked skip button by text match');
  }
}

// MutationObserver reacts immediately when the button appears
const observer = new MutationObserver(tryClickSkip);

observer.observe(document.body, {
  childList: true,
  subtree: true,
  attributes: true,
  attributeFilter: ['class', 'style'],
});

// Polling fallback every 500ms
setInterval(tryClickSkip, 500);
