# Changelog

All notable changes to Manual Video Zoom are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-09-15

First public release, on the Chrome Web Store and on GitHub.

### Added
- Aspect-preserving manual zoom from 100% to 400% on the largest visible HTML5
  video in the main document, applied with the CSS `scale`, `transform-origin`
  and `clip-path` properties only.
- **Fill the frame**: computes the zoom that makes the picture span the player
  from the video's own `videoWidth`/`videoHeight` and its layout box. The
  decoded image is never sampled.
- Popup controls: direct numeric entry, a slider with live preview, 100/125/
  150/200% presets, ±1% steppers with hold-to-repeat, and reset.
- Keyboard commands: `Alt+Shift+U` (+1%), `Alt+Shift+J` (−1%), `Alt+Shift+K`
  (reset), reassignable at `chrome://extensions/shortcuts`.
- Per-origin persistence of one integer in `chrome.storage.local`, reapplied to
  replacement video elements and on later page loads.
- Built-in support, with no permission prompt, for Netflix, U-NEXT, Hulu (Japan
  and US), YouTube, Disney+, Prime Video (including the Amazon JP/US video
  pages), Apple TV, ABEMA and TVer.
- Opt-in access to any other site: a per-origin grant from the popup, or an
  all-sites grant from the Site access section, registered as a dynamic content
  script so it survives reloads and browser restarts.
- English and Japanese interface, following Chrome's language setting.
- Light and dark popup palettes from `prefers-color-scheme`.
- The recheck loop is suspended while the tab is hidden.

### Security and privacy
- No network requests, no analytics, no remote code, no third-party
  dependencies and no build step in the shipped package.
- No use of the cookies, history, bookmarks, downloads, tabs or webRequest
  APIs. `chrome.storage.sync` is not used.

### Notes
- Versions 0.6.0 to 0.8.0 were unreleased development iterations and are not
  listed here. See `docs/design.md` for their scope.

[Unreleased]: https://github.com/kamahei/manual-video-zoom/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/kamahei/manual-video-zoom/releases/tag/v1.0.0
