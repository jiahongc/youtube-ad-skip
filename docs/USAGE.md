# Usage Guide

## Open Settings

1. Click the extension icon in Chrome.
2. You will see two toggles:
   - `Skip to Jump Ahead Section`
   - `Skip Sponsored/Ad Chapters`

Both are enabled by default.

## How Skipping Works

### Jump Ahead

- Uses YouTube's own Jump Ahead/seek metadata.
- If present, playback seeks forward automatically.

### Chapter-based Sponsor Skips

- Reads chapter metadata from YouTube page data.
- Skips chapters that look like sponsor/ad sections.
- Does not skip generic intro chapters unless ad cues are present in the title.

### Music Video Rule

- Music videos are excluded by default.
- If a video is classified as music, skips are blocked.

### Where Preferences Are Saved

- Toggle values are stored in `chrome.storage.sync`.
- Stored keys:
  - `skipJumpAhead`
  - `skipAdChapter`
