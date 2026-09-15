# Verification

The **Version 1.0.0** section at the end of this file is the current record, and the only one
backed by a real browser. The sections above it document earlier, unreleased iterations and are
kept for history.

## Completed
- Node.js v24.12.0: `node --test --test-isolation=none tests/controller.test.cjs`: 7 tests passed.
- `node --check` passed for content.js, background.js and popup.js.
- Manifest test checked MV3, exact site allowlist, storage-only API access and referenced entrypoints.
- Controller tests checked default no-op, bounds, malformed settings, CSS restoration including !important, largest-video selection, replacement, no-video state, concurrent write order, save failure and sender validation.
- Source review: no network calls, remote code, external dependencies, browsing-history storage or dynamic HTML insertion.

The default Node test runner could not spawn its child process in this restricted environment (EPERM). Running the same tests with process isolation disabled succeeded. Tests use a mocked DOM and Chrome API; they do not prove browser rendering or real playback compatibility.

## Manual acceptance checklist — not yet executed
1. Load unpacked in Chrome; confirm no manifest errors and only the intended site access.
2. Open an unrelated site: popup should explain supported sites; shortcuts should do nothing.
3. On Netflix, U-NEXT, Hulu (Japan) and YouTube, start a video; test 101%, 150%, 200%, 400%, then reset.
4. In fullscreen on a 32:9 monitor, adjust until black bars disappear. Check image shape, clipping, controls and separate/burned-in subtitles. Try entering and exiting fullscreen while zoomed.
5. Reload: saved zoom returns. Switch episodes or title without reloading: the replacement video receives the zoom within about one second.
6. Test each shortcut; check chrome://extensions/shortcuts for conflicts.
7. Open a second tab: confirm initial stored zoom and documented independent live state.
8. Reset, disable the extension and reload: original rendering returns.

Version 0.6.0 adds exact Hulu Japan and YouTube host matches; no new API permissions. Browser playback on these added sites remains unverified. YouTube Shorts, previews and ads share the saved origin zoom; reset when undesired. Embedded YouTube players on other sites remain outside scope. Official domain references: https://help.hulu.jp/hc/ja/articles/360048812053 and https://support.google.com/youtube/answer/3802431 .

No claim of an independent security audit or signed-in streaming-service compatibility is made.

## Version 0.7.0 verification
All 11 Node tests passed with process isolation disabled; all three runtime JavaScript files passed syntax checks. The store ZIP contains 12 runtime files with manifest.json at its root; archive integrity and manifest equality were checked.
Controller, locale completeness, translated popup behavior, actual shortcut display and PNG dimensions are covered by Node tests. A real Chrome render attempt was blocked by this environment (spawn EPERM); browser screenshot and installation validation remain pending. No screenshots of real extension execution were generated. Promotional graphics are original geometric artwork. All target service playback remains unverified; use sites.md for the expanded manual matrix.

## Version 0.8.0 verification

Date: 2026-09-15. Node.js v24.12.0. Nothing has been released yet; the sections above record earlier pre-release iterations.

### Completed
- `node --test --test-isolation=none tests/*.test.cjs`: 36 tests passed (14 controller, 8 service worker, 14 popup/locale). Default isolation still fails to spawn in this environment (EPERM), as before.
- `node --check` passed for constants.js, content.js, background.js and popup.js.
- Manifest test pins `permissions` to `['storage', 'activeTab', 'scripting']`, `optional_host_permissions` to `['*://*/*']`, `content_scripts[0].js` to `['constants.js', 'content.js']`, and the 19-entry site allowlist unchanged. `host_permissions` and `externally_connectable` are still absent, so the install-time warning is unchanged from the fixed list.
- Controller tests cover: fill-the-frame arithmetic for a 16:9 source in a 32:9 box (200%), a 2.35:1 source (151%) and a pillarboxed source (clamped to 100%); `fitPercent` null without metadata and under a non-contain object-fit; `persist: false` applying with zero storage writes; the recheck interval stopping while hidden and reapplying on becoming visible; mutation records filtered to those touching a video and coalesced per animation frame; fullscreenchange and resize scheduling a reapply; and a second injection into the same document being ignored.
- Service worker tests run background.js against stubbed `permissions`, `scripting` and `tabs` APIs and cover: a clean install registering nothing; origins already in the fixed list never being registered again; a granted origin registering with the right id, matches and files; a revoked origin being unregistered; repeated reconciliation not duplicating; a grant injecting into exactly the open tabs of that origin; one uninjectable tab not stopping the others; and the shortcut handler still messaging only the active tab.
- Popup tests cover presets and active-preset marking, steppers, slider preview versus release, clamping and blank input, fill-the-frame enablement, the no-video warning, and the whole access flow: the offer naming the current host, a grant requesting the right origin pattern and injecting, a refused grant changing nothing, `chrome://` / `about:` / `file://` pages being reported as unreachable instead of offered, and the allow-every-site button disappearing once granted.
- Source review: no new network calls, remote code, dependencies or dynamic HTML insertion. `chrome.tabs.create('chrome://extensions/shortcuts')` needs no permission the popup lacked.

### Popup rendered in headless Chrome, outside the extension runtime
The popup markup, stylesheet and script were rendered by the locally installed Chrome (`--headless=new`, 332px wide) from a standalone harness that inlines popup.html/popup.css/constants.js/popup.js and stubs `chrome.i18n`, `chrome.commands`, `chrome.permissions`, `chrome.scripting` and `chrome.tabs`. Confirmed visually in Japanese and English, in both palettes: the normal applied state, the no-video state, the expanded detail sections, and the not-enabled state with its dimmed controls and the access card naming the host. Nothing overflowed or wrapped badly in either language.

This is a render of the same files, not a run of the installed extension. It proves layout and localization, and nothing about the content script, the messaging, the permission dialogs, or any streaming service.

### Not executed
The extension was never loaded into a browser for 0.8.0. Everything involving Chrome itself is unverified: the real permission dialog and whether the popup survives it, dynamic content script registration and its persistence across restarts, injection into already-open tabs, `activeTab` actually yielding the tab URL, hold-to-repeat timing, live preview against a real video, the fill-the-frame result on an actual player, the background-tab CPU saving, and every streaming service. The Node tests use a mocked DOM and Chrome API; a stub agreeing with the code proves only internal consistency.

### Manual acceptance checklist for 0.8.0 — not yet executed
1. Load unpacked; confirm the install warning lists only the fixed sites, not all sites.
2. Upgrade path: a zoom saved by an earlier build must still load (`zoom:<origin>` is unchanged).
3. On a site in the fixed list, confirm it still works with no permission prompt at all.
4. On a site outside the list, open the popup: the access card must name that host. Grant it, and the current page must start working without a reload.
5. Reload that page, then restart Chrome: the site must still work, which is what proves the dynamic registration persisted.
6. Open two tabs of a new site, grant from one, and confirm the other tab also starts working.
7. Deny the permission dialog: the popup must say so and change nothing.
8. Open the popup on `chrome://extensions`, a PDF and a `file://` page: it must report that extensions cannot run there, with no access button.
9. Remove the grant in chrome://extensions, Details, Site access; reload: the site must stop working and the popup must offer the grant again.
10. Allow every site, then confirm the button disappears and a random new site works immediately on load.
11. Drag the slider during playback; type 137, then 999 (clamps to 400); clear the field and tab away; each preset; reset; hold the steppers.
12. Fullscreen, then Fill the frame: the bars must disappear. In a windowed 16:9 player the button must be disabled with its tooltip.
13. Switch the OS between light and dark; focus outlines must stay visible in both.
14. Chrome Task Manager: several video tabs, switch away, confirm the background tabs stop consuming CPU.
15. Episode change without reload: the replacement video must pick up the zoom.
16. Reset, disable the extension, reload: original rendering returns.

## Version 1.0.0 verification

Date: 2026-09-15. Node.js v24.12.0. **Chrome 152.0.7977.83, the installed branded build.**
This is the first version that was actually loaded into a browser.

### How it was driven
`--load-extension` and `--disable-extensions-except` no longer work in branded Chrome: the flags
were removed in M137, the `DisableLoadExtensionCommandLineSwitch` escape hatch was removed in
M142, and on this build Chrome starts normally and **silently ignores them**. The extension was
therefore loaded through the CDP `Extensions.loadUnpacked` command, reached with
`--remote-debugging-pipe` plus `--enable-unsafe-extension-debugging`, driven by puppeteer-core
25.11.0 against the installed Chrome. The harness lives outside this repository; the repository
itself still has no dependencies and no build step.

Test pages were served by intercepting requests for a chosen origin and answering them locally, so
the shipped `manifest.json` was never edited to reach a test URL. The page is a real `<video>` fed
by `canvas.captureStream()`, so `videoWidth`/`videoHeight` and the layout box are genuine. Popup
interaction used real trusted input events (`Input.dispatchMouseEvent` / `dispatchKeyEvent`)
against the genuine toolbar popup, opened by simulating a toolbar click.

### Results: 205 assertions, 0 failures
- `core` (63) and `core-ja` (63): the same suite under `--lang=en-US` and `--lang=ja`.
- `access` (43): opt-in site access.
- `package` (12): the extracted store ZIP, loaded as its own extension.
- `shots-en` / `shots-ja` (12 each): store image generation, including brand-safety assertions.

Automated unit tests: `node --test tests/*.test.cjs`, 41 tests, all passing (36 existing plus 5 new
packaging tests). `node --check` passes for `constants.js`, `content.js`, `background.js` and
`popup.js`. Default test isolation still fails to spawn in this sandbox (EPERM), as recorded above;
`--test-isolation=none` runs them.

### What was confirmed in the real browser
- The extension loads with no manifest error, its service worker starts, and
  `chrome.permissions.getAll()` returns **exactly** the 19 manifest match patterns and the three
  API permissions — `*://*/*` is **not** granted at install. No dynamic content script is
  registered on a clean install.
- On a site in the fixed list the content script injects with no prompt, claims the document once,
  and sets `scale`, `transform-origin` and `clip-path` with `!important`. At 150% the clip is
  `inset(16.6667%)`, which is `(1 − 1/1.5) × 50%`.
- **Fill the frame matches the arithmetic the unit tests assert against mocks**, measured against
  real layout and real video metadata: 1280×544 in a 1216×342 box → **151%**; 1280×720 in the same
  box → **200%**; 1280×720 in a 1216×684 box → **100%**, where the button is correctly disabled and
  carries its explanatory tooltip.
- Popup controls, driven by real mouse and keyboard events on the real bubble: presets, a typed
  137, a typed 999 clamping to 400, clearing the field and clicking away restoring the last value,
  a slider drag, and hold-to-repeat on the stepper. **A whole hold commits at most two storage
  writes**, which is the `persist: false` scrubbing behaviour working.
- Reset removes all three properties and persists 100. After uninstall and reload the video carries
  no inline style, the leftover isolated world holds no extension code, and a page opened afterwards
  has no extension realm at all.
- The recheck loop really is suspended while the tab is hidden: a zoom stripped externally from a
  background tab is not reapplied for 2.5 s, and is reapplied immediately on becoming visible.
- A replacement `<video>` picks up the saved zoom within about 1.5 s.
- Both palettes render, and every keyboard-focused control shows a focus ring — `#0f7568` in light,
  `#8ddad1` in dark. (`:focus-visible` needs keyboard focus; calling `.focus()` never lights it.)
- The popup reports the real registered shortcuts:
  `Shortcuts: Alt+Shift+U / Alt+Shift+J (±1%), Alt+Shift+K (reset).`
- Japanese: `chrome.i18n.getUILanguage()` is `ja` under `--lang=ja`, the popup renders the Japanese
  strings, and the whole core suite passes identically. Nothing overflowed or wrapped badly.
- On a site that was never allowed: no content script runs, the video is untouched, the popup says
  "Not enabled on this page yet", the access card names the host read through `activeTab`, and the
  controls are disabled.
- `chrome://extensions` and `about:blank` are reported as pages extensions cannot run on, with no
  access button. `originPattern()` refuses `file://`, `chrome://` and `about:`, and accepts a
  plain `http://` LAN address.
- Clicking the real "Enable on …" button opens Chrome's own consent dialog. **An unanswered dialog
  grants nothing and changes nothing on the page.**
- The extracted store ZIP loads as its own extension and works end to end: content script, fill the
  frame, popup stylesheet, localized strings and registered shortcuts.

### A finding worth recording
`chrome.tabs.query({url: …})` returns nothing for a site that is only in `content_scripts.matches`.
A match pattern is a *scriptable* host permission and does not grant access to tab URLs; an
explicit host grant or `activeTab` does. This is why `injectOpenTabs` in `background.js` may filter
tabs by URL — it runs only for origins the user actually granted — and it means the fixed site list
gives the extension no ability to read tab addresses.

### The grant machinery, and the one deviation
`chrome.permissions.request()` needs a user gesture and shows native UI. No Chrome switch
auto-accepts it, and it is not a CDP target in headless or headful mode. Chrome's own
`developerPrivate` site-access API was also measured and rejected as a route: it records a grant
for an origin the manifest never declared but never activates it, in the same session or after a
restart.

So registration, injection, revocation and persistence were verified against a **copy** of the
extension whose only manifest difference is that the two test origins are declared as
`host_permissions` instead of being requested at runtime. `background.js` cannot tell the
difference — it reads `chrome.permissions.getAll()` and subtracts the `content_scripts` matches —
so every line of that machinery ran unmodified. With that copy:

- `syncSiteScripts()` registered one dynamic script per non-manifest origin, with the ids
  `site-https-example-com-` and `site-https-example-org-`, the right match pattern, the right two
  files and `document_idle`.
- Revoking one origin fired `permissions.onRemoved` and unregistered **exactly** that script,
  leaving the other. After a reload the controller no longer ran there.
- Re-granting fired `permissions.onAdded`, re-registered the script, and `injectOpenTabs()` reached
  **both** tabs that were already open on that origin, with no reload.
- Zoom is stored per origin and never shared between origins.
- After a **real browser restart** the grants survived, `onStartup` reconciliation re-registered
  both scripts without duplicating them, the site still worked, and the zoom saved before the
  restart was reapplied.

### Store images
Generated from the real popup — real `chrome.i18n`, real `chrome.commands.getAll()`, real
messaging to the real content script — over an original canvas animation. The only shim is
`chrome.tabs.query({active, currentWindow})`, because a popup opened in a tab is its own active
tab. The harness asserts that no captured popup contains any of the ten service names, and records
which collapsed sections were open; the section that lists services is never opened. No
third-party logo, interface, artwork or branding appears in any store image.

### Still not verified — do not claim otherwise
- **Answering the native permission dialog**, granting or denying. The pre-dialog state and the
  no-answer outcome are covered; the post-dialog message is not.
- **Every streaming service.** DRM/EME playback, each player's DOM, ancestor clipping, separate
  versus burned-in subtitles and site-specific transforms are all untested. No signed-in session
  was used on any service.
- **A physical 32:9 monitor in real fullscreen.** The element box is emulated, which is the only
  thing `computeFitPercent()` reads, but not the compositor or display path.
- **Actual `Alt+Shift+U` keystrokes.** The commands are registered and the popup shows the real
  shortcut strings, but CDP cannot fire browser-level accelerators.
- **Chrome Task Manager CPU figures.** The visibility-gating behaviour is proven; the power saving
  is not measured.
- **The install-time permission warning bubble's wording.**
- **The toolbar bubble's own sizing and scrolling** for the store images, which were captured from
  the popup rendered in a tab.
- Chrome Web Store review outcome.

### Manual acceptance checklist for 1.0.0 — for a human, in a signed-in browser
1. Load the extracted ZIP unpacked; confirm the install warning lists only the fixed sites.
2. On Netflix, U-NEXT, Hulu, YouTube, Disney+, Prime Video, Apple TV, ABEMA and TVer: start
   playback, go fullscreen on a 32:9 monitor, press Fill the frame, and check the picture shape,
   clipping, player controls and both kinds of subtitle. Reset afterwards.
3. Enter and leave fullscreen while zoomed; switch episodes without reloading.
4. On a site outside the list, press the access button and **accept** Chrome's dialog: the page
   must start working with no reload, and keep working after a reload and after restarting Chrome.
5. Repeat and **decline** the dialog: the popup must say so and change nothing.
6. Remove the grant in `chrome://extensions` → Details → Site access; reload; the site must stop
   working and the popup must offer the grant again.
7. Press each keyboard shortcut; check `chrome://extensions/shortcuts` for conflicts.
8. Chrome Task Manager: several video tabs, switch away, confirm the background tabs settle.
