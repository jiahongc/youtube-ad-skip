# Youtube Skip In-Video Ads

A lightweight Chrome extension that skips in-video sponsored segments using:

- YouTube Jump Ahead data/buttons
- Sponsor/ad chapter titles

It does not use third-party segment databases.

## Current behavior

- Two popup toggles (both ON by default):
  - `Skip to Jump Ahead Section`
  - `Skip Sponsored/Ad Chapters`
- Music videos are excluded by default.
- Runs only on `www.youtube.com`.
- Uses resilient detection for YouTube SPA navigation and payload updates.

## Permissions

- `storage`: saves popup toggle settings (`chrome.storage.sync`).

## Installation

This extension is not on the Chrome Web Store. Load it manually:

1. Clone or download this repo:
   ```bash
   git clone https://github.com/jiahongc/youtube-ad-skip.git
   ```
2. Open Chrome and go to `chrome://extensions/`.
3. Enable **Developer mode**.
4. Click **Load unpacked** and select this repo folder.
5. Open a YouTube video.
6. Click the extension icon to adjust toggle settings.

## Notes

- Skip reliability depends on what YouTube exposes for a given video (Jump Ahead data or chapter metadata).
- YouTube frequently changes internal payload shape and UI classes; this repo uses multiple fallback paths to reduce breakage.

## Key files

| File | Purpose |
|------|---------|
| `manifest.json` | Extension metadata (Manifest V3) |
| `content.js` | Isolated-world script for UI/button fallback and toast notifications |
| `injected.js` | Main-world script for Jump Ahead/chapter extraction and seeking |
| `popup.html` / `popup.js` / `popup.css` | Popup UI and toggle persistence |
| `generate-icons.py` | Regenerates `icon16/48/128.png` |

## License

MIT
