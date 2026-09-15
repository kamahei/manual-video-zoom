const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
function video(width = 800) {
  const styles = new Map([['transform-origin', ['20% 30%', 'important']]]);
  return {
    clientWidth: width, clientHeight: 450, videoWidth: 0, videoHeight: 0,
    getBoundingClientRect: () => ({width, height: 450, top: 0, left: 0, right: width, bottom: 450}),
    style: {
      getPropertyValue: p => styles.get(p)?.[0] || '',
      getPropertyPriority: p => styles.get(p)?.[1] || '',
      setProperty: (p, v, priority) => styles.set(p, [v, priority]),
      removeProperty: p => styles.delete(p)
    }
  };
}
// Reshape a stub video so it reports a letterboxed picture inside a wider box.
function frame(element, {boxWidth, boxHeight, videoWidth, videoHeight}) {
  return Object.assign(element, {clientWidth: boxWidth, clientHeight: boxHeight, videoWidth, videoHeight});
}
async function controller(stored = 100, failSave = false, objectFit = 'contain') {
  let tick;
  let observe = null;
  const first = video();
  const videos = [first];
  const writes = [];
  const frames = [];
  const documentEvents = {};
  const windowEvents = {};
  const timers = new Set();
  const listeners = [];
  let nextTimer = 1;
  const document = {
    hidden: false, documentElement: {},
    querySelectorAll: () => videos,
    addEventListener: (type, fn) => { documentEvents[type] = fn; }
  };
  const context = vm.createContext({
    location: {origin: 'https://video.unext.jp'}, innerWidth: 1920, innerHeight: 1080,
    document,
    getComputedStyle: () => ({visibility: 'visible', display: 'block', opacity: '1', objectFit}),
    setInterval: fn => { tick = fn; const id = nextTimer++; timers.add(id); return id; },
    clearInterval: id => { timers.delete(id); },
    requestAnimationFrame: fn => frames.push(fn),
    addEventListener: (type, fn) => { windowEvents[type] = fn; },
    MutationObserver: class { constructor(fn) { observe = fn; } observe() {} },
    chrome: {
      runtime: {id: 'test', onMessage: {addListener: fn => listeners.push(fn)}},
      storage: {local: {
        get: async key => ({[key]: stored}),
        set: async data => { if (failSave) throw Error('Storage failed'); writes.push(data); }
      }}
    }
  });
  for (const file of ['constants.js', 'content.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context);
  }
  const inject = () => vm.runInContext(fs.readFileSync(path.join(root, 'content.js'), 'utf8'), context);
  const listener = listeners[0];
  const send = (action, value, extra = {}) => new Promise(resolve =>
    listener({type: 'video-zoom', action, value, ...extra}, {id: 'test'}, resolve));
  await send('status');
  return {
    first, videos, writes, send, listener, document, documentEvents, windowEvents, timers,
    tick: () => tick(),
    inject,
    listenerCount: () => listeners.length,
    mutate: records => observe(records),
    flushFrames: () => { for (const fn of frames.splice(0)) fn(); },
    frameCount: () => frames.length
  };
}
const added = nodes => [{addedNodes: nodes, removedNodes: []}];
test('manifest restricts access and contains only local existing entrypoints', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json')));
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ['storage', 'activeTab', 'scripting']);
  // Wider reach is opt-in: nothing beyond the fixed list is granted at install.
  assert.deepEqual(manifest.optional_host_permissions, ['*://*/*']);
  assert.deepEqual(manifest.content_scripts[0].js, ['constants.js', 'content.js']);
  assert.deepEqual(manifest.content_scripts[0].matches, ["https://*.netflix.com/*","https://video.unext.jp/*","https://www.hulu.jp/*","https://hulu.jp/*","https://www.youtube.com/*","https://youtube.com/*","https://www.disneyplus.com/*","https://disneyplus.com/*","https://www.primevideo.com/*","https://primevideo.com/*","https://www.amazon.co.jp/gp/video/*","https://www.amazon.co.jp/detail/*","https://www.amazon.com/gp/video/*","https://www.amazon.com/detail/*","https://tv.apple.com/*","https://abema.tv/*","https://tver.jp/*","https://www.hulu.com/*","https://hulu.com/*"]);
  assert.equal(manifest.host_permissions, undefined);
  assert.equal(manifest.externally_connectable, undefined);
  for (const file of [...manifest.content_scripts[0].js, manifest.background.service_worker, manifest.action.default_popup]) {
    assert.ok(fs.existsSync(path.join(root, file)));
  }
});
test('default does not mutate the video; zoom clamps and reset restores original priority', async () => {
  const c = await controller();
  assert.equal(c.first.style.getPropertyValue('scale'), '');
  assert.equal((await c.send('set', 999)).percent, 400);
  assert.equal(c.first.style.getPropertyValue('scale'), '4');
  assert.equal(c.first.style.getPropertyValue('clip-path'), 'inset(37.5%)');
  assert.equal((await c.send('delta', -1000)).percent, 100);
  assert.equal(c.first.style.getPropertyValue('scale'), '');
  await c.send('set', 150);
  await c.send('reset');
  assert.equal(c.first.style.getPropertyValue('transform-origin'), '20% 30%');
  assert.equal(c.first.style.getPropertyPriority('transform-origin'), 'important');
  assert.equal(c.first.style.getPropertyValue('clip-path'), '');
  assert.equal(c.writes.at(-1)['zoom:https://video.unext.jp'], 100);
});
test('stored values are bounded and invalid values fall back safely', async () => {
  for (const [input, expected] of [[150, 150], [1000, 400], [-1, 100], ['200', 100], [NaN, 100], [Infinity, 100], [null, 100]]) {
    const c = await controller(input);
    assert.equal((await c.send('status')).percent, expected);
  }
});
test('replacement restores previous element and applies current zoom to largest video', async () => {
  const c = await controller(150);
  const next = video(1200);
  c.videos.push(next);
  c.tick();
  assert.equal(c.first.style.getPropertyValue('scale'), '');
  assert.equal(next.style.getPropertyValue('scale'), '1.5');
  c.videos.length = 0;
  assert.equal((await c.send('status')).found, false);
  assert.equal(next.style.getPropertyValue('scale'), '');
});
test('concurrent commands preserve final storage ordering', async () => {
  const c = await controller();
  await Promise.all([c.send('delta', 1), c.send('delta', 1), c.send('reset')]);
  assert.deepEqual(c.writes.map(v => v['zoom:https://video.unext.jp']), [101, 102, 100]);
});
test('storage failures are reported without blocking reset', async () => {
  const c = await controller(150, true);
  const state = await c.send('reset');
  assert.equal(state.saveError, true);
  assert.equal(c.first.style.getPropertyValue('scale'), '');
});
test('messages from another sender and unknown actions are ignored', async () => {
  const c = await controller();
  assert.equal(c.listener({type: 'video-zoom', action: 'reset'}, {id: 'other'}, () => assert.fail()), undefined);
  assert.equal(c.listener({type: 'video-zoom', action: 'unknown'}, {id: 'test'}, () => assert.fail()), undefined);
});
test('fill the frame derives the zoom from intrinsic size and layout box', async () => {
  const cases = [
    [{boxWidth: 3840, boxHeight: 1080, videoWidth: 1920, videoHeight: 1080}, 200],
    [{boxWidth: 3840, boxHeight: 1080, videoWidth: 2350, videoHeight: 1000}, 151],
    [{boxWidth: 1080, boxHeight: 1080, videoWidth: 1920, videoHeight: 1080}, 100]
  ];
  for (const [geometry, expected] of cases) {
    const c = await controller();
    frame(c.first, geometry);
    assert.equal((await c.send('status')).fitPercent, expected);
    assert.equal((await c.send('fit')).percent, expected);
    assert.equal(c.first.style.getPropertyValue('scale'), expected === 100 ? '' : String(expected / 100));
  }
});
test('fill the frame reports unavailable without metadata or with a non-contain fit', async () => {
  const withoutMetadata = await controller();
  assert.equal((await withoutMetadata.send('status')).fitPercent, null);
  assert.equal((await withoutMetadata.send('fit')).percent, 100);
  const cropped = await controller(100, false, 'cover');
  frame(cropped.first, {boxWidth: 3840, boxHeight: 1080, videoWidth: 1920, videoHeight: 1080});
  assert.equal((await cropped.send('status')).fitPercent, null);
});
test('a preview applies the zoom without writing it to storage', async () => {
  const c = await controller();
  const state = await c.send('set', 150, {persist: false});
  assert.equal(state.percent, 150);
  assert.equal(c.first.style.getPropertyValue('scale'), '1.5');
  assert.deepEqual(c.writes, []);
  await c.send('set', 150);
  assert.deepEqual(c.writes.map(v => v['zoom:https://video.unext.jp']), [150]);
});
test('the recheck interval stops while hidden and reapplies on becoming visible', async () => {
  const c = await controller(150);
  assert.equal(c.timers.size, 1);
  c.document.hidden = true;
  c.documentEvents.visibilitychange();
  assert.equal(c.timers.size, 0);
  const next = video(1200);
  c.videos.push(next);
  c.document.hidden = false;
  c.documentEvents.visibilitychange();
  assert.equal(c.timers.size, 1);
  assert.equal(next.style.getPropertyValue('scale'), '1.5');
});
test('mutations reapply only when a video element is added or removed, coalesced per frame', async () => {
  const c = await controller(150);
  c.mutate(added([{nodeType: 3}, {nodeType: 1, localName: 'div', querySelector: () => null}]));
  assert.equal(c.frameCount(), 0);
  const next = video(1200);
  c.mutate(added([{nodeType: 1, localName: 'video'}]));
  c.mutate(added([{nodeType: 1, localName: 'div', querySelector: () => next}]));
  assert.equal(c.frameCount(), 1, 'a burst collapses into one scheduled pass');
  c.videos.push(next);
  c.flushFrames();
  assert.equal(next.style.getPropertyValue('scale'), '1.5');
  assert.equal(c.first.style.getPropertyValue('scale'), '');
});
test('a second injection into the same document is ignored', async () => {
  const c = await controller(150);
  assert.equal(c.listenerCount(), 1);
  c.inject();
  c.inject();
  assert.equal(c.listenerCount(), 1, 'only the first copy takes the document');
  assert.equal((await c.send('status')).percent, 150);
});
test('fullscreen and resize schedule a reapply', async () => {
  const c = await controller(150);
  c.documentEvents.fullscreenchange();
  assert.equal(c.frameCount(), 1);
  c.flushFrames();
  c.windowEvents.resize();
  assert.equal(c.frameCount(), 1);
});
