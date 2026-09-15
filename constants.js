'use strict';
// Shared between the content script, the popup and the service worker.
// All three are classic scripts, so the contract is published on globalThis
// rather than exported as a module.
globalThis.VideoZoom = Object.freeze({
  MIN_PERCENT: 100,
  MAX_PERCENT: 400,
  DEFAULT_PERCENT: 100,
  MESSAGE_TYPE: 'video-zoom',
  ACTIONS: Object.freeze(['status', 'set', 'delta', 'reset', 'fit']),
  ALL_SITES: '*://*/*',
  // Match pattern covering one page's whole origin, or null for a page no
  // content script can run in (chrome://, about:, the Web Store, a file).
  originPattern: url => {
    let parsed;
    try { parsed = new URL(url); } catch { return null; }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (!parsed.host) return null;
    return `${parsed.protocol}//${parsed.host}/*`;
  },
  scriptId: pattern => `site-${pattern.replace(/[^a-zA-Z0-9]+/g, '-')}`,
  storageKey: origin => `zoom:${origin}`,
  normalize: value => typeof value === 'number' && Number.isFinite(value)
    ? Math.min(400, Math.max(100, Math.round(value))) : 100
});
