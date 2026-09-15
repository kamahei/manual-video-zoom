'use strict';
importScripts('constants.js');
const {MESSAGE_TYPE, scriptId} = globalThis.VideoZoom;

const declared = () => chrome.runtime.getManifest().content_scripts[0];
const scriptFiles = () => declared().js;

// Origins the user granted at runtime, excluding the ones already covered by
// the manifest's fixed list.
async function optionalOrigins() {
  const fixed = new Set(declared().matches);
  const granted = await chrome.permissions.getAll();
  return (granted.origins || []).filter(pattern => !fixed.has(pattern));
}

// Keep exactly one registered content script per granted origin, so those sites
// behave like the built-in list on every later page load. Reconciling against
// the live permission set also cleans up grants revoked from chrome://extensions
// while the browser was closed.
async function syncSiteScripts() {
  try {
    const wanted = new Map((await optionalOrigins()).map(pattern => [scriptId(pattern), pattern]));
    const registered = await chrome.scripting.getRegisteredContentScripts();
    const stale = registered.filter(script => !wanted.has(script.id)).map(script => script.id);
    if (stale.length) await chrome.scripting.unregisterContentScripts({ids: stale});
    const known = new Set(registered.map(script => script.id));
    const missing = [...wanted].filter(([id]) => !known.has(id));
    if (missing.length) {
      await chrome.scripting.registerContentScripts(missing.map(([id, pattern]) => ({
        id, matches: [pattern], js: scriptFiles(), runAt: 'document_idle'
      })));
    }
  } catch { /* A revoked or malformed pattern must not break the worker. */ }
}

// Already-open tabs have no content script yet, so a fresh grant injects one.
// Filtering tabs by URL is allowed here because the grant covers that origin.
async function injectOpenTabs(origins) {
  for (const pattern of origins || []) {
    let tabs = [];
    try { tabs = await chrome.tabs.query({url: pattern}); } catch { continue; }
    for (const tab of tabs) {
      if (!tab.id) continue;
      try {
        await chrome.scripting.executeScript({target: {tabId: tab.id}, files: scriptFiles()});
      } catch { /* Restricted or discarded tabs cannot be injected. */ }
    }
  }
}

chrome.runtime.onInstalled.addListener(syncSiteScripts);
chrome.runtime.onStartup.addListener(syncSiteScripts);
chrome.permissions.onRemoved.addListener(syncSiteScripts);
chrome.permissions.onAdded.addListener(async permissions => {
  await syncSiteScripts();
  await injectOpenTabs(permissions.origins);
});

chrome.commands.onCommand.addListener(async command => {
  const actions = {'zoom-in': ['delta', 1], 'zoom-out': ['delta', -1], reset: ['reset', 0]};
  if (!actions[command]) return;
  const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
  if (!tab?.id) return;
  const [action, value] = actions[command];
  try {
    await chrome.tabs.sendMessage(tab.id, {type: MESSAGE_TYPE, action, value}, {frameId: 0});
  } catch { /* Pages without a granted or matched content script have no receiver. */ }
});
