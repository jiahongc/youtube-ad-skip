# YouTube Auto Skip Promotions

A lightweight Chrome extension that automatically clicks YouTube's built-in **"Skip promotion"** button so you never have to.

> **How it works:** YouTube already detects paid/sponsored segments in videos and surfaces a native skip button in the bottom-right of the player. This extension just clicks it for you the moment it appears.

---

## Features

- Auto-clicks YouTube's native skip button (no third-party segment database needed)
- Works for skip-intro buttons and promoted segment skips
- Uses `MutationObserver` for instant reaction — no noticeable delay
- Polling fallback every 500 ms for edge cases
- No permissions required — runs only on `youtube.com`
- Zero external dependencies

---

## Installation

This extension is not on the Chrome Web Store. Load it manually:

1. Clone or download this repo
   ```bash
   git clone https://github.com/jiahongc/youtube-ad-skip.git
   ```
2. Open Chrome and go to `chrome://extensions/`
3. Enable **Developer mode** (toggle, top-right)
4. Click **Load unpacked** and select the repo folder
5. Visit any YouTube video — the extension is active immediately

---

## How to find the skip button selector

YouTube can change its CSS class names. If the extension stops working:

1. Play a video with a sponsored segment until the skip button appears
2. Right-click the skip button → **Inspect**
3. Note the class name on the `<button>` element (e.g. `.ytp-skip-intro-button`)
4. Add it to the `SKIP_SELECTORS` array in `content.js`

The text-based fallback in `content.js` will still catch most cases even if class names change.

---

## Files

| File | Purpose |
|------|---------|
| `manifest.json` | Chrome extension manifest (Manifest V3) |
| `content.js` | Content script — detects and clicks the skip button |
| `generate-icons.py` | Generates `icon16/48/128.png` (pure Python, no deps) |

---

## License

MIT
