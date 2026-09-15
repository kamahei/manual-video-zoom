# Manual Video Zoom design

## Goal and scope
Provide manual, aspect-preserving HTML5 video zoom for 32:9 displays. A fixed list of site scopes is in sites.md and frozen in manifest regression tests; any other site works once the user grants it from the popup. Adding to the fixed list still requires an explicit reviewed manifest change. No DRM access, capture, analytics, dependencies, or remote code. No detection of black bars from the decoded image: the fill-the-frame helper below is geometry over the intrinsic size, and never samples a pixel.

## Product behavior
Popup: 100–400% integer zoom through a direct numeric field, a slider, ±1% steppers that repeat while held, 100/125/150/200% presets, fill the frame, and reset. Browser commands: zoom in/out/reset. Persist zoom per origin locally and restore on navigation. Default is 100%. Select the largest visible video in the main document. Reset restores the original inline CSS properties touched by the extension. At 100% no CSS is changed.

Dragging the slider or typing in the field previews live: the popup sends persist:false so a scrub applies without writing to storage, and commits the released value once. The popup reflects the controller state it is given — it never keeps its own copy of the zoom.

Fill the frame answers the one question the product exists for, "what number removes the bars". From the intrinsic videoWidth/videoHeight and the element's layout box under the default object-fit: contain, the letterboxed picture size is fixed, so the zoom that makes it span the box is arithmetic. It is offered only when the metadata is loaded, the computed object-fit is contain or scale-down, and the result differs from the current zoom. It is meaningful in fullscreen; in a 16:9 window the box already matches the picture and the answer is 100%.

The controller reapplies when a video is added or removed (MutationObserver on the document, filtered to records that touch a video element and coalesced to one pass per animation frame), on fullscreenchange and resize, and from a one-second interval as a safety net for changes that produce no mutation. The interval is stopped while the document is hidden and resumed with an immediate reapply when it becomes visible, so background video tabs cost nothing.

## Site access
Two tiers. The fixed `content_scripts.matches` list installs with the extension and needs no interaction. Everywhere else the controller is simply absent, so the popup's status message becomes an offer: one button requests `chrome.permissions.request` for that page's origin, and a second, in the Site access section, requests `*://*/*` for people who want it everywhere.

A grant does three things. `permissions.onAdded` in the service worker registers a dynamic content script for the origin, so the site behaves like the fixed list on every later load; it injects into tabs already open on that origin, so the current page works without a reload; and the popup injects too, covering the case where it survived the permission dialog. Both injection paths are idempotent because the content script claims the document with a flag on the isolated world's globalThis and later copies return immediately.

`syncSiteScripts` reconciles registrations against `permissions.getAll()` on install, on startup and on every permission change, subtracting the manifest's fixed matches so a built-in site is never registered twice. That is also what removes registrations for access revoked from chrome://extensions while the browser was closed. Revocation is left to Chrome's own site-access UI rather than duplicated in the popup, because Chrome's is always correct about what it can actually remove.

`activeTab` is what lets the popup read the current tab's URL to name the site on its button, and it grants nothing until the user invokes the extension. `optional_host_permissions` produces no install-time warning, so a fresh install still asks for exactly the fixed list and nothing more.

## Architecture and permissions
Static and dynamically registered isolated-world content scripts, popup, command and permission service worker. constants.js publishes the shared contract (bounds, message type, action list, storage key, normalize) on globalThis; all three surfaces are classic scripts, so the content script lists it first in content_scripts.js, the popup loads it with a script tag, and the service worker pulls it in with importScripts. API permissions: storage, activeTab, scripting. Optional host permissions: `*://*/*`, granted only per user request. Default site access is limited to content_scripts.matches; no install-time all_urls, no tabs, cookies or webRequest. A site permission means the script can technically read that page's DOM; implementation reads video geometry and edits three video style properties only, on the fixed list and on granted sites alike. No network APIs. Default MV3 local-script CSP.

CSS individual scale preserves the site's transform declaration. Center origin plus an inset clip keeps enlarged content inside the original video rectangle. Existing site transforms/clips may still conflict. No ancestor layout edits, to keep controls and separate subtitles intact. Burned-in subtitles are cropped with the image.

## Messages
Request {type: 'video-zoom', action, value, persist}; action is one of status, set, delta, reset, fit. persist:false applies without writing. Reply {percent, found, saveError, fitPercent}, where fitPercent is null when fill the frame cannot be computed. The sender id and the action list are validated before anything runs.

## Data model
storage.local key zoom:<origin>, value integer percent in [100,400]. Invalid values normalize to 100. No URLs, titles, account data or history saved. Tabs keep independent live state; last saved value wins for future loads. Writes are serialized. No synchronization to a cloud account.

## Implementation order
1. Document scope and access boundaries.
2. Implement isolated video controller and local persistence.
3. Implement popup and command routing.
4. Verify bounds, restore, replacement, serialization and permission contract with local tests.
5. Package sources and document actual-service manual acceptance checks.

## Acceptance and unknowns
Tests must cover zoom clamping, invalid stored values, style restoration, video replacement and unsupported/no-video behavior. Netflix/U-NEXT/Hulu DRM playback and YouTube rendering, fullscreen compositor behavior, subtitles and current player DOM require manual testing in a signed-in Chrome session. Cross-origin iframes, shadow roots and picture-in-picture are outside this initial version. A video element with its own fullscreen mode may need service-specific adaptation.

## Official references
- https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts
- https://developer.chrome.com/docs/extensions/reference/api/storage
- https://developer.chrome.com/docs/extensions/reference/api/commands

## Version 0.8.0 changes
Shared constants module, popup rebuilt around a direct numeric field with presets and live preview, fill-the-frame geometry, light and dark palettes from prefers-color-scheme, a button to chrome://extensions/shortcuts, visibility-gated rechecking, and opt-in access to sites outside the fixed list. The fixed list and the stored data model are unchanged. The ±5% buttons are gone; the presets, the slider and holding a stepper cover coarse moves. 0.6.0 and 0.7.0 were earlier pre-release iterations.

## Distribution
Chrome i18n with English fallback and Japanese locale. Popup reads registered keyboard shortcuts. `scripts/package.mjs` builds the store ZIP from a hardcoded allowlist of the 14 runtime files, with manifest.json at the archive root and a fixed entry timestamp so the archive is reproducible; `tests/package.test.cjs` keeps that allowlist in step with the manifest. See sites.md for the expanded, finite list and Amazon path-limited access. Streaming playback and browser store acceptance remain unverified.

## Version 1.0.0 changes
First public release. No behavioural change from 0.8.0: the controller, the popup, the site list, the message contract and the `zoom:<origin>` data model are all unchanged. What is new is everything around the code — a reproducible packaging script and its regression test, MIT licensing, a published privacy policy, store listing assets, and the first real-browser verification pass recorded in verification.md. The short description in both locales was rewritten to lead with the ultrawide problem rather than with a list of services.
