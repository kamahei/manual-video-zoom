const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
test('all manifest and popup messages exist in both languages', () => {
 const html = read('popup.html');
 const js = read('popup.js');
 const keys = [...read('manifest.json').matchAll(/__MSG_(\w+)__/g), ...html.matchAll(/data-i18n="(\w+)"/g), ...js.matchAll(/t\('(\w+)'/g)].map(m=>m[1]);
 const en = JSON.parse(read('_locales/en/messages.json'));
 const ja = JSON.parse(read('_locales/ja/messages.json'));
 assert.deepEqual(Object.keys(en).sort(), Object.keys(ja).sort());
 for (const locale of [en,ja]) {
  for (const key of keys) assert.ok(locale[key]?.message, key);
  assert.ok(locale.appDescription.message.length<=132);
  for (const n of [1,2,3]) assert.ok(locale.keys.message.includes(`$${n}`));
 }
});
test('icons are valid PNGs at their declared sizes', () => {
 const m = JSON.parse(read('manifest.json'));
 for (const [size,file] of Object.entries(m.icons)) {
  const png=fs.readFileSync(path.join(root,file));
  assert.equal(png.subarray(1,4).toString(),'PNG');
  assert.equal(png.readUInt32BE(16),Number(size));
  assert.equal(png.readUInt32BE(20),Number(size));
 }
});
// Minimal DOM: every selector popup.js uses resolves to its own stub node, and an
// unexpected selector throws so the markup and the script cannot drift apart.
function popup(language, {url = 'https://example.com/watch?v=1', allSites = false} = {}) {
 const dict = JSON.parse(read(`_locales/${language}/messages.json`));
 const manifest = JSON.parse(read('manifest.json'));
 const node = (props = {}) => ({
  textContent: '', value: '', disabled: false, title: '', dataset: {}, attrs: {}, events: {},
  setAttribute(name, value) { this.attrs[name] = value; },
  addEventListener(type, fn) { this.events[type] = fn; },
  ...props
 });
 const elements = new Map();
 const query = selector => {
  if (!elements.has(selector)) elements.set(selector, node());
  return elements.get(selector);
 };
 const presets = [100, 125, 150, 200].map(value => node({dataset: {percent: String(value)}}));
 const localized = [...read('popup.html').matchAll(/data-i18n="(\w+)"/g)].map(m => node({dataset: {i18n: m[1]}}));
 const document = {
  documentElement: {}, activeElement: null, querySelector: query,
  querySelectorAll(selector) {
   if (selector === '[data-i18n]') return localized;
   if (selector === '[data-percent]') return presets;
   throw new Error(`unexpected selector ${selector}`);
  }
 };
 const frames = [];
 const opened = [];
 const sent = [];
 const controller = {percent: 100, found: true, saveError: false, fitPercent: null, fail: false};
 const access = {origins: allSites ? ['*://*/*'] : [], grant: true, requested: [], injected: []};
 const context = vm.createContext({
  document,
  requestAnimationFrame: fn => frames.push(fn),
  addEventListener() {},
  URL,
  setTimeout, clearTimeout, setInterval, clearInterval,
  chrome: {
   runtime: {getManifest: () => manifest},
   i18n: {getUILanguage: () => language, getMessage: (key, subs = []) => dict[key].message.replace(/\$(\d)/g, (_, n) => subs[n - 1])},
   permissions: {
    contains: async ({origins}) => origins.every(origin => access.origins.includes(origin)),
    request: async ({origins}) => {
     access.requested.push(...origins);
     if (!access.grant) return false;
     access.origins.push(...origins);
     controller.fail = false;
     return true;
    }
   },
   scripting: {executeScript: async ({target, files}) => { access.injected.push([target.tabId, files]); }},
   commands: {getAll: async () => [{name: 'zoom-in', shortcut: 'Alt+Shift+P'}, {name: 'reset', shortcut: 'Alt+Shift+R'}]},
   tabs: {
    query: async () => [{id: 1, url}],
    create: async options => { opened.push(options.url); },
    sendMessage: async (_, message) => {
     sent.push(message);
     if (controller.fail) throw new Error('No receiver');
     const {normalize} = context.VideoZoom;
     if (message.action === 'set') controller.percent = normalize(message.value);
     if (message.action === 'delta') controller.percent = normalize(controller.percent + message.value);
     if (message.action === 'reset') controller.percent = 100;
     if (message.action === 'fit' && controller.fitPercent !== null) controller.percent = controller.fitPercent;
     const {percent, found, saveError, fitPercent} = controller;
     return {percent, found, saveError, fitPercent};
    }
   }
  }
 });
 for (const file of ['constants.js', 'popup.js']) vm.runInContext(read(file), context);
 return {
  dict, document, query, presets, controller, sent, opened, access, manifest,
  flush: () => new Promise(resolve => setImmediate(resolve)),
  flushFrames: () => { for (const fn of frames.splice(0)) fn(); }
 };
}
for (const language of ['en','ja']) test(`${language}: popup translates its controls and displays actual reassigned shortcuts`, async () => {
 const p = popup(language);
 await p.flush();
 assert.equal(p.document.documentElement.lang, language);
 assert.ok(p.query('#keys').textContent.includes('Alt+Shift+P'));
 assert.ok(p.query('#keys').textContent.includes(p.dict.unassigned.message));
 assert.equal(p.query('#range-min').textContent, '100%');
 assert.equal(p.query('#range-max').textContent, '400%');
 assert.equal(p.query('#amount').max, 400);
 assert.equal(p.query('#decrease').attrs['aria-label'], p.dict.decrease.message);
 assert.equal(p.query('#status').textContent, p.dict.applied.message);
 assert.equal(p.query('#status').dataset.state, 'ok');
});
test('presets, steppers and reset move the zoom and mark the active preset', async () => {
 const p = popup('en');
 await p.flush();
 p.presets[2].events.click();
 await p.flush();
 assert.equal(p.query('#amount').value, 150);
 assert.equal(p.presets[2].attrs['aria-pressed'], 'true');
 assert.equal(p.presets[0].attrs['aria-pressed'], 'false');
 p.query('#increase').events.click();
 await p.flush();
 assert.equal(p.query('#zoom').value, 151);
 p.query('#decrease').events.click();
 await p.flush();
 assert.equal(p.query('#zoom').value, 150);
 p.query('#reset').events.click();
 await p.flush();
 assert.equal(p.query('#amount').value, 100);
 assert.equal(p.presets[0].attrs['aria-pressed'], 'true');
});
test('dragging the slider previews without saving and the release commits', async () => {
 const p = popup('en');
 await p.flush();
 const slider = p.query('#zoom');
 slider.value = 175;
 slider.events.input();
 assert.equal(p.query('#amount').value, 175);
 p.flushFrames();
 await p.flush();
 assert.equal(p.sent.at(-1).persist, false);
 slider.events.change();
 await p.flush();
 assert.equal(p.sent.at(-1).persist, true);
 assert.equal(p.controller.percent, 175);
});
test('typed values are clamped and blank input keeps the current zoom', async () => {
 const p = popup('en');
 await p.flush();
 const amount = p.query('#amount');
 amount.value = 999;
 amount.events.change();
 await p.flush();
 assert.equal(p.controller.percent, 400);
 amount.value = '';
 amount.events.change();
 await p.flush();
 assert.equal(p.controller.percent, 400);
 assert.equal(amount.value, 400);
});
test('fill the frame is offered only when the controller reports a usable target', async () => {
 const p = popup('en');
 await p.flush();
 const fit = p.query('#fit');
 assert.equal(fit.disabled, true);
 assert.equal(fit.title, p.dict.fitUnavailable.message);
 p.controller.fitPercent = 200;
 p.query('#reset').events.click();
 await p.flush();
 assert.equal(fit.disabled, false);
 assert.equal(fit.title, p.dict.fitHint.message);
 fit.events.click();
 await p.flush();
 assert.equal(p.controller.percent, 200);
 assert.equal(fit.disabled, true, 'already at the fitted zoom');
});
test('an unreachable controller offers to enable the site it is on', async () => {
 const p = popup('en', {url: 'https://videos.example.com/watch'});
 p.controller.fail = true;
 await p.flush();
 assert.equal(p.query('#controls').disabled, true);
 assert.equal(p.query('#status').textContent, p.dict.notEnabled.message);
 assert.equal(p.query('#status').dataset.state, 'warn');
 assert.equal(p.query('#access').hidden, false);
 assert.equal(p.query('#enable-site').textContent, 'Enable on videos.example.com');
 p.query('#edit-shortcuts').events.click();
 assert.deepEqual(p.opened, ['chrome://extensions/shortcuts']);
});
test('granting the site injects the controller and hides the prompt', async () => {
 const p = popup('en', {url: 'https://videos.example.com/watch'});
 p.controller.fail = true;
 await p.flush();
 p.query('#enable-site').events.click();
 await p.flush();
 assert.deepEqual(p.access.requested, ['https://videos.example.com/*']);
 assert.deepEqual(p.access.injected, [[1, p.manifest.content_scripts[0].js]]);
 assert.equal(p.query('#access').hidden, true);
 assert.equal(p.query('#controls').disabled, false);
 assert.equal(p.query('#status').textContent, p.dict.applied.message);
});
test('a refused grant leaves the page unchanged and says so', async () => {
 const p = popup('en', {url: 'https://videos.example.com/watch'});
 p.controller.fail = true;
 p.access.grant = false;
 await p.flush();
 p.query('#enable-site').events.click();
 await p.flush();
 assert.deepEqual(p.access.injected, []);
 assert.equal(p.query('#status').textContent, p.dict.permissionDenied.message);
 assert.equal(p.query('#controls').disabled, true);
});
test('pages no extension can reach are reported instead of offered', async () => {
 for (const url of ['chrome://extensions/', 'about:blank', 'file:///C:/clip.mp4']) {
  const p = popup('en', {url});
  p.controller.fail = true;
  await p.flush();
  assert.equal(p.query('#status').textContent, p.dict.unsupportedPage.message, url);
  assert.equal(p.query('#status').dataset.state, 'error', url);
  assert.equal(p.query('#access').hidden, true, url);
 }
});
test('the allow-every-site button is offered only until it is granted', async () => {
 const p = popup('en');
 await p.flush();
 assert.equal(p.query('#enable-all').hidden, false);
 p.query('#enable-all').events.click();
 await p.flush();
 assert.deepEqual(p.access.requested, ['*://*/*']);
 assert.equal(p.query('#enable-all').hidden, true);
 const already = popup('en', {allSites: true});
 await already.flush();
 assert.equal(already.query('#enable-all').hidden, true);
});
test('no video found is reported as a warning rather than a failure', async () => {
 const p = popup('en');
 p.controller.found = false;
 await p.flush();
 assert.equal(p.query('#status').textContent, p.dict.noVideo.message);
 assert.equal(p.query('#status').dataset.state, 'warn');
});
