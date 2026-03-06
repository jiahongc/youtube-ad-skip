# Youtube Skip In-Video Ads

Chrome extension that skips in-video ad/sponsor sections on YouTube using:

- YouTube Jump Ahead data/buttons
- Chapter title detection for sponsor/ad chapters

No third-party sponsor database is used.

## Quick Start

1. Clone the repo:
   ```bash
   git clone https://github.com/jiahongc/youtube-ad-skip.git
   ```
2. Open Chrome at `chrome://extensions/`.
3. Enable **Developer mode**.
4. Click **Load unpacked** and choose this folder.
5. Open any YouTube video.
6. Click the extension icon to configure toggles.

## What It Does

- Auto-skips when YouTube exposes Jump Ahead data.
- Auto-skips chapter-marked sponsor/ad segments.
- Shows a toast when a skip is performed.
- Saves toggle preferences using `chrome.storage.sync`.

## What It Does Not Do

- Does not use external tracking/analytics.
- Does not use third-party segment services.
- Does not skip all sponsor reads if YouTube provides no usable metadata.

## Default Behavior

- `Skip to Jump Ahead Section`: ON
- `Skip Sponsored/Ad Chapters`: ON
- Music videos: blocked by default
- Intro chapters are not skipped unless the chapter title also contains ad/sponsor cues.

## Documentation

- Usage guide: [docs/USAGE.md](./docs/USAGE.md)
- Troubleshooting: [docs/TROUBLESHOOTING.md](./docs/TROUBLESHOOTING.md)
- Changelog: [CHANGELOG.md](./CHANGELOG.md)
- Privacy policy page: https://jiahongc.github.io/youtube-ad-skip/privacy.html
- Privacy markdown fallback: [PRIVACY.md](./PRIVACY.md)

## Permissions

- `storage`: saves the two toggle preferences.

## Key Files

| File | Purpose |
|------|---------|
| `manifest.json` | Extension metadata (Manifest V3) |
| `content.js` | Fallback button detection + toast UI |
| `injected.js` | Main YouTube data parsing and seek logic |
| `popup.html` / `popup.js` / `popup.css` | Popup settings UI |
| `generate-icons.py` | Rebuilds `icon16/48/128.png` |

## License

MIT
