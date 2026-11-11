# YouTube PiP Subtitles

Picture-in-Picture for desktop Chrome and Helium with English subtitles,
play/pause and 10-second seek buttons. Space pauses; Left/Right seek when the
PiP document has focus (buttons retain their normal keyboard behavior).
Subtitle size, font, color, background and position are configurable.

## Install

1. Clone this repository.
2. Open `chrome://extensions` (or `helium://extensions`).
3. Enable Developer mode, click **Load unpacked**, and select this directory.
4. Reload YouTube, open a video and click **PiP** in the player controls.

Requires desktop Chromium 119+ with Document Picture-in-Picture enabled.
Keep the source tab open. After pulling updates, reload the extension and YouTube.

## Behavior and limitations

- Downloads English captions when PiP opens, preferring human captions over ASR.
  Does not translate videos without an English track.
- If YouTube rejects a caption download, uses its English caption renderer when
  available. This temporarily changes the source player's caption selection,
  restoring it when PiP closes. YouTube's internal APIs can change.
- Moves the original video into PiP, then returns it and restores its styles.
  Navigation closes PiP; reopen it for the next video. No captureStream copy.
- No analytics, external fonts, remote scripts or third-party requests.
  Requests caption data from YouTube only. Settings stay in local extension storage.
- Supports regular `/watch` videos. Shorts, embedded players and protected videos
  are outside the supported scope.

`player.js` runs in the page's MAIN world to access YouTube's player.
`content.js` only passes appearance settings from extension storage to that world;
page scripts cannot use the bridge to read other extension data or make requests.

Based on [mehmetkahya0/youtube-pip-subtitles](https://github.com/mehmetkahya0/youtube-pip-subtitles).

## Development

```sh
npm ci
npm test
# To use an installed Helium instead of /usr/bin/chromium:
PIP_BROWSER=/opt/helium-browser-bin/helium npm test
```

The integration test loads the real extension and opens real Document PiP windows
against a local, intercepted YouTube fixture. It covers caption selection,
playback, seeking, navigation, fallback and restoration. It does not prove
compatibility with the current live YouTube player.

Original copyright and MIT license retained in [LICENSE](LICENSE).
