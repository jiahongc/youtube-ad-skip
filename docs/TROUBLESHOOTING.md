# Troubleshooting

## Extension does not skip on a video

Possible reasons:

- YouTube did not provide Jump Ahead data for that video.
- The video has no usable chapter metadata.
- The video was classified as music and skips were blocked.

What to do:

1. Refresh the YouTube tab.
2. Confirm both toggles are ON in the popup.
3. Try another video to verify baseline behavior.

## Works on some videos but not others

This is expected for some content. The extension depends on YouTube-provided metadata.

## Skipped a chapter you did not want skipped

Chapter matching is heuristic and based on chapter titles.

Workaround:

1. Turn OFF `Skip Sponsored/Ad Chapters` for that session.
2. Keep `Skip to Jump Ahead Section` ON.

## Settings not sticking

The extension uses `chrome.storage.sync`.

Check:

1. Chrome sync is enabled.
2. You are using the same Chrome profile.

## Collect useful debug info

If you open an issue, include:

- Example video URL(s)
- Approximate timestamp(s)
- Whether skip was expected or unexpected
- Console logs that include `[AutoSkip]`
