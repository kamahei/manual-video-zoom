const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const manifest = JSON.parse(read('manifest.json'));
const FILES = manifest.content_scripts[0].js;
const FIXED = manifest.content_scripts[0].matches;
// The stub honours only the origin prefix of a match pattern, which is all the
// worker ever queries with.
const matchesTab = (pattern, url) => url.startsWith(pattern.replace(/\*$/, ''));
// Objects built inside the vm come from another realm, so compare their shape.
const plain = value => JSON.parse(JSON.stringify(value));
function worker({origins = [], registered = [], tabs = []} = {}) {
  const on = {};
  const state = {origins, registered: registered.map(id => ({id})), unregistered: [], injected: []};
  const context = vm.createContext({
    importScripts: () => vm.runInContext(read('constants.js'), context),
    chrome: {
      runtime: {
        getManifest: () => manifest,
        onInstalled: {addListener: fn => { on.installed = fn; }},
        onStartup: {addListener: fn => { on.startup = fn; }}
      },
      permissions: {
        getAll: async () => ({origins: state.origins}),
        onAdded: {addListener: fn => { on.added = fn; }},
        onRemoved: {addListener: fn => { on.removed = fn; }}
      },
      scripting: {
        getRegisteredContentScripts: async () => state.registered.map(script => ({...script})),
        registerContentScripts: async scripts => { state.registered.push(...scripts); },
        unregisterContentScripts: async ({ids}) => {
          state.unregistered.push(...ids);
          state.registered = state.registered.filter(script => !ids.includes(script.id));
        },
        executeScript: async ({target, files}) => { state.injected.push([target.tabId, files]); }
      },
      tabs: {
        query: async query => tabs.filter(tab => !query.url || matchesTab(query.url, tab.url)),
        sendMessage: async () => {}
      },
      commands: {onCommand: {addListener: fn => { on.command = fn; }}}
    }
  });
  vm.runInContext(read('background.js'), context);
  return {on, state, id: context.VideoZoom.scriptId};
}
test('a clean install registers nothing beyond the fixed list', async () => {
  const w = worker();
  await w.on.installed();
  assert.deepEqual(plain(w.state.registered), []);
  assert.deepEqual(plain(w.state.unregistered), []);
});
test('origins already covered by the manifest are never registered again', async () => {
  const w = worker({origins: FIXED});
  await w.on.startup();
  assert.deepEqual(plain(w.state.registered), [], 'the built-in sites already have a declared script');
});
test('a granted origin is registered for later page loads', async () => {
  const pattern = 'https://example.com/*';
  const w = worker({origins: [...FIXED, pattern]});
  await w.on.startup();
  assert.deepEqual(plain(w.state.registered), [{
    id: w.id(pattern), matches: [pattern], js: FILES, runAt: 'document_idle'
  }]);
});
test('a revoked origin drops its registration', async () => {
  const stale = 'site-https-gone-example-com-';
  const w = worker({origins: [], registered: [stale]});
  await w.on.removed();
  assert.deepEqual(plain(w.state.unregistered), [stale]);
  assert.deepEqual(plain(w.state.registered), []);
});
test('reconciling twice does not duplicate a registration', async () => {
  const pattern = 'https://example.com/*';
  const w = worker({origins: [pattern]});
  await w.on.startup();
  await w.on.startup();
  assert.equal(w.state.registered.length, 1);
  assert.deepEqual(plain(w.state.unregistered), []);
});
test('granting a site injects into the tabs already open on it', async () => {
  const pattern = 'https://example.com/*';
  const w = worker({
    origins: [pattern],
    tabs: [{id: 7, url: 'https://example.com/watch'}, {id: 8, url: 'https://example.com/other'},
           {id: 9, url: 'https://elsewhere.test/'}]
  });
  await w.on.added({origins: [pattern]});
  assert.equal(w.state.registered.length, 1, 'and it keeps working after a reload');
  assert.deepEqual(plain(w.state.injected), [[7, FILES], [8, FILES]]);
});
test('a tab that refuses injection does not stop the rest', async () => {
  const pattern = 'https://example.com/*';
  const w = worker({origins: [pattern], tabs: [{url: 'https://example.com/a'}, {id: 8, url: 'https://example.com/b'}]});
  await w.on.added({origins: [pattern]});
  assert.deepEqual(plain(w.state.injected), [[8, FILES]]);
});
test('the shortcut handler still targets only the active tab', async () => {
  const sent = [];
  const context = vm.createContext({
    importScripts: () => vm.runInContext(read('constants.js'), context),
    chrome: {
      runtime: {getManifest: () => manifest, onInstalled: {addListener() {}}, onStartup: {addListener() {}}},
      permissions: {getAll: async () => ({origins: []}), onAdded: {addListener() {}}, onRemoved: {addListener() {}}},
      scripting: {getRegisteredContentScripts: async () => [], registerContentScripts: async () => {},
        unregisterContentScripts: async () => {}, executeScript: async () => {}},
      tabs: {
        query: async () => [{id: 3}],
        sendMessage: async (tabId, message, options) => { sent.push([tabId, message, options]); }
      },
      commands: {onCommand: {addListener: fn => { context.command = fn; }}}
    }
  });
  vm.runInContext(read('background.js'), context);
  await context.command('zoom-in');
  await context.command('unknown-command');
  assert.deepEqual(plain(sent), [[3, {type: 'video-zoom', action: 'delta', value: 1}, {frameId: 0}]]);
});
