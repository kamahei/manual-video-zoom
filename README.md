# Manual Video Zoom

[![tests](https://github.com/kamahei/manual-video-zoom/actions/workflows/test.yml/badge.svg)](https://github.com/kamahei/manual-video-zoom/actions/workflows/test.yml)

A small, dependency-free Chrome Manifest V3 extension that manually zooms and crops HTML5 video, so the black bars disappear on a 21:9 or 32:9 ultrawide screen. English and Japanese controls, following Chrome's language setting. See [日本語の導入手順](INSTALL.ja.md).

## Features
- Aspect-preserving 100–400% zoom: type the number, drag the slider with a live preview, tap a 100/125/150/200% preset, or hold −/+ to step by 1%.
- **Fill the frame** computes the zoom that removes the bars from the video's own dimensions — no guessing, and no inspection of the picture itself. Use it in fullscreen.
- Local per-origin persistence; reapplied to replacement video elements. Rechecking pauses while the tab is hidden.
- Popup follows the browser's light or dark theme.
- Alt+Shift+U / J: ±1%; Alt+Shift+K: reset. Reassign in `chrome://extensions/shortcuts` if unavailable.
- Works on a fixed list of major streaming sites out of the box, and **on any other site once you allow it from the popup** — the grant is per site and survives reloads. See [site scopes and limitations](docs/sites.md).

## Install
From the Chrome Web Store: *listing URL, added after approval*.

To run this source directly instead:
1. Keep this folder at a stable location and open `chrome://extensions`.
2. Enable Developer mode, select **Load unpacked**, and choose this folder containing manifest.json.
3. Reload the video site, start playback and open the pinned extension popup.
4. Enter fullscreen and increase zoom until the bars disappear. The image edges will be cropped.

## Privacy and access
API permissions: `storage`, `activeTab` and `scripting`. Static content-script matches grant page access on the listed site scopes; nothing else is granted at install time. Any further site access is an `optional_host_permissions` grant you make yourself from the popup, per origin or for all sites, and Chrome shows its own dialog each time. `activeTab` lets the popup read the current tab's address so its button can name the site, and grants nothing until you invoke the extension. Chrome may show a read/change site-data warning: this is the actual technical capability, even though this code only operates on video elements. No install-time all-sites access, no cookies API, history API, analytics, network requests, remote scripts, build tools or third-party packages. The extension does not collect playback URLs or account details. Review all source files before installation if desired; this is not an independent security audit.

Saved data is one integer per origin in `chrome.storage.local`, never `sync`. Existing tabs keep their own zoom until changed; the last saved value becomes the default on future page loads. Reset saves 100%. Removing the extension deletes its stored settings; reload open video tabs to clear any injected code/styles. Chrome site-access controls can further restrict access, and grants you made from the popup are removed there too (Details, Site access).

The published policy is at <https://kamahei.github.io/manual-video-zoom/privacy.html>, mirrored in [PRIVACY.md](PRIVACY.md).

## Limits
Largest visible main-document video only. No iframe/shadow-root traversal, automatic black-bar detection, stretch, pan, DRM decoding or capture. The extension changes CSS, not video data. Site-specific transforms, fullscreen compositing, player changes or ancestor clipping may need follow-up adjustments. Native picture-in-picture is not supported. **Playback on the listed streaming services has not been tested in a signed-in session**; see [verification](docs/verification.md) for exactly what has and has not been checked.

Separate subtitle/control elements are not scaled; burned-in subtitles and image edges can be cropped. A 32:9 monitor cannot display a narrower movie edge-to-edge without cropping or distortion. Saved zoom also applies to trailers/previews on the same origin: reset when unwanted.

## Development
No build step and no dependencies. `constants.js` holds the bounds, message type, action list and storage key shared by the content script, popup and service worker. Chrome 110+; Node.js 18+ to run `node --test tests/*.test.cjs`. Reload the extension and then the site after edits. Read [design](docs/design.md), [verification](docs/verification.md) and AGENTS.md. The design file consolidates the scope, architecture, data model, implementation sequence and acceptance criteria for this small project.

## Contributing
Issues and small pull requests are welcome. Pull requests that add a runtime dependency, widen `permissions` or `optional_host_permissions`, add a site to `content_scripts.matches`, or introduce a build step will not be merged without prior discussion in an issue. Run `node --test tests/*.test.cjs` before opening one.

## Store distribution
The packaged extension for each release is attached to the corresponding [GitHub Release](https://github.com/kamahei/manual-video-zoom/releases) and is built by `node scripts/package.mjs`, which writes `dist/manual-video-zoom-<version>.zip` containing only the runtime files with `manifest.json` at the archive root. The build is reproducible: identical sources produce a byte-identical archive, and each release lists its SHA-256. `node scripts/package.mjs --verify` reads the archive back and checks it against the manifest.

## License
MIT — see [LICENSE](LICENSE). Copyright (c) 2026 Kamahei.

Manual Video Zoom is an independent project. It is not affiliated with, endorsed by or sponsored by any of the video services it works on. Those names are used only to describe where the extension works, and all trademarks are the property of their respective owners.
