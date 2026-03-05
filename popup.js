const DEFAULT_SETTINGS = {
  skipJumpAhead: true,
  skipAdChapter: true,
};

const jumpToggle = document.getElementById('skipJumpAhead');
const chapterToggle = document.getElementById('skipAdChapter');

function bindSummaryToggle(toggleId) {
  const input = document.getElementById(toggleId);
  const summary = input?.closest('summary');
  if (!input || !summary) return;

  summary.addEventListener('click', (event) => {
    if (event.target === input || event.target.closest('label.switch')) {
      event.preventDefault();
      input.checked = !input.checked;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
}

async function init() {
  const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  jumpToggle.checked = stored.skipJumpAhead !== false;
  chapterToggle.checked = stored.skipAdChapter !== false;

  jumpToggle.addEventListener('change', () => {
    chrome.storage.sync.set({ skipJumpAhead: jumpToggle.checked });
  });
  chapterToggle.addEventListener('change', () => {
    chrome.storage.sync.set({ skipAdChapter: chapterToggle.checked });
  });
}

bindSummaryToggle('skipJumpAhead');
bindSummaryToggle('skipAdChapter');
init();
