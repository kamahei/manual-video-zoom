'use strict';
const {MIN_PERCENT, MAX_PERCENT, DEFAULT_PERCENT, MESSAGE_TYPE, ALL_SITES, originPattern, normalize} = globalThis.VideoZoom;

const HOLD_DELAY_MS = 400;
const HOLD_INTERVAL_MS = 60;

const t = (key, substitutions) => chrome.i18n.getMessage(key, substitutions);
const $ = selector => document.querySelector(selector);

const controls = $('#controls');
const slider = $('#zoom');
const amount = $('#amount');
const statusLine = $('#status');
const fitButton = $('#fit');
const accessBox = $('#access');
const accessNote = $('#access-note');
const enableSiteButton = $('#enable-site');
const enableAllButton = $('#enable-all');
const SCRIPT_FILES = chrome.runtime.getManifest().content_scripts[0].js;
const presets = [...document.querySelectorAll('[data-percent]')];

let tabId;
let tabUrl = '';
let queue = Promise.resolve();
let latest = {percent: DEFAULT_PERCENT, found: false, saveError: false, fitPercent: null};
let unsaved = false;

/* Rendering */

function setStatus(key, state) {
  statusLine.textContent = t(key);
  statusLine.dataset.state = state;
}

function render(result) {
  latest = result;
  if (document.activeElement !== slider) slider.value = result.percent;
  if (document.activeElement !== amount) amount.value = result.percent;
  for (const button of presets) {
    button.setAttribute('aria-pressed', String(Number(button.dataset.percent) === result.percent));
  }
  const fit = result.fitPercent;
  fitButton.disabled = typeof fit !== 'number' || fit === result.percent;
  fitButton.title = fitButton.disabled ? t('fitUnavailable') : t('fitHint');
  if (result.saveError) setStatus('saveError', 'error');
  else if (!result.found) setStatus('noVideo', 'warn');
  else setStatus('applied', 'ok');
}

/* Controller messaging, serialized so replies cannot arrive out of order */

function send(action, value, persist = true) {
  queue = queue.then(async () => {
    try {
      const result = await chrome.tabs.sendMessage(tabId, {type: MESSAGE_TYPE, action, value, persist}, {frameId: 0});
      if (!result || result.error) throw new Error('Controller unavailable');
      controls.disabled = false;
      accessBox.hidden = true;
      render(result);
    } catch {
      controls.disabled = true;
      offerAccess();
    }
  });
  return queue;
}

// Dragging previews without writing to storage; the release commits the value.
let previewValue = null;
let previewScheduled = false;

function preview(percent) {
  previewValue = percent;
  unsaved = true;
  if (previewScheduled) return;
  previewScheduled = true;
  requestAnimationFrame(() => {
    previewScheduled = false;
    send('set', previewValue, false);
  });
}

function commit(percent) {
  unsaved = false;
  send('set', percent, true);
}

function showValue(percent) {
  slider.value = percent;
  amount.value = percent;
}

/* Site access */

// The controller is unreachable on any page this extension was never allowed
// into, so the popup offers the grant that fixes it rather than an apology.
function offerAccess() {
  const pattern = originPattern(tabUrl);
  if (!pattern) {
    accessBox.hidden = true;
    setStatus('unsupportedPage', 'error');
    return;
  }
  setStatus('notEnabled', 'warn');
  accessNote.textContent = t('notEnabledNote');
  enableSiteButton.textContent = t('enableSite', [new URL(tabUrl).host]);
  accessBox.hidden = false;
}

// Must run straight off the click: awaiting anything first loses the user
// gesture that chrome.permissions.request requires.
function requestAccess(pattern) {
  chrome.permissions.request({origins: [pattern]}).then(async granted => {
    if (!granted) {
      setStatus('permissionDenied', 'warn');
      return;
    }
    // The service worker registers the origin for later loads and injects into
    // open tabs; doing it here too covers the case where the popup survived.
    try {
      await chrome.scripting.executeScript({target: {tabId}, files: SCRIPT_FILES});
    } catch { /* The registered script will load on the next navigation. */ }
    accessBox.hidden = true;
    await showAllSitesOffer();
    send('status');
  }).catch(() => setStatus('permissionDenied', 'warn'));
}

function showAllSitesOffer() {
  return chrome.permissions.contains({origins: [ALL_SITES]})
    .then(granted => { enableAllButton.hidden = granted; })
    .catch(() => {});
}

/* Controls */

function bindStepper(button, delta) {
  let holdTimer = null;
  let repeatTimer = null;
  let repeated = false;
  const repeat = () => {
    repeated = true;
    const next = normalize(Number(slider.value) + delta);
    showValue(next);
    preview(next);
  };
  const stop = () => {
    clearTimeout(holdTimer);
    clearInterval(repeatTimer);
    holdTimer = repeatTimer = null;
    if (repeated) commit(Number(slider.value));
  };
  button.addEventListener('pointerdown', () => {
    repeated = false;
    holdTimer = setTimeout(() => { repeatTimer = setInterval(repeat, HOLD_INTERVAL_MS); }, HOLD_DELAY_MS);
  });
  for (const event of ['pointerup', 'pointercancel', 'pointerleave']) button.addEventListener(event, stop);
  button.addEventListener('click', () => {
    if (!repeated) send('delta', delta);
    repeated = false;
  });
}

function bindControls() {
  bindStepper($('#decrease'), -1);
  bindStepper($('#increase'), 1);

  slider.addEventListener('input', () => {
    amount.value = slider.value;
    preview(Number(slider.value));
  });
  slider.addEventListener('change', () => commit(Number(slider.value)));

  amount.addEventListener('input', () => {
    const value = Number(amount.value);
    if (amount.value !== '' && Number.isFinite(value) && value >= MIN_PERCENT && value <= MAX_PERCENT) {
      slider.value = value;
      preview(value);
    }
  });
  amount.addEventListener('change', () => {
    const raw = String(amount.value).trim();
    const value = raw === '' || !Number.isFinite(Number(raw)) ? latest.percent : normalize(Number(raw));
    showValue(value);
    commit(value);
  });
  amount.addEventListener('blur', () => {
    if (String(amount.value).trim() === '') showValue(latest.percent);
  });

  for (const button of presets) {
    button.addEventListener('click', () => {
      showValue(Number(button.dataset.percent));
      commit(Number(button.dataset.percent));
    });
  }

  enableSiteButton.addEventListener('click', () => {
    const pattern = originPattern(tabUrl);
    if (pattern) requestAccess(pattern);
  });
  enableAllButton.addEventListener('click', () => requestAccess(ALL_SITES));
  fitButton.addEventListener('click', () => send('fit'));
  $('#reset').addEventListener('click', () => send('reset'));
  $('#edit-shortcuts').addEventListener('click', () => chrome.tabs.create({url: 'chrome://extensions/shortcuts'}));
  addEventListener('pagehide', () => { if (unsaved) send('set', Number(slider.value), true); });
}

/* Startup */

function localize() {
  document.documentElement.lang = chrome.i18n.getUILanguage();
  for (const element of document.querySelectorAll('[data-i18n]')) element.textContent = t(element.dataset.i18n);
  slider.setAttribute('aria-label', t('zoomLabel'));
  amount.setAttribute('aria-label', t('zoomLabel'));
  $('#decrease').setAttribute('aria-label', t('decrease'));
  $('#increase').setAttribute('aria-label', t('increase'));
  $('#presets').setAttribute('aria-label', t('presetsLabel'));
  $('#range-min').textContent = `${MIN_PERCENT}%`;
  $('#range-max').textContent = `${MAX_PERCENT}%`;
}

function applyBounds() {
  for (const input of [slider, amount]) {
    input.min = MIN_PERCENT;
    input.max = MAX_PERCENT;
    input.step = 1;
  }
}

function showShortcuts() {
  return chrome.commands.getAll().then(commands => {
    const key = name => commands.find(command => command.name === name)?.shortcut || t('unassigned');
    $('#keys').textContent = t('keys', [key('zoom-in'), key('zoom-out'), key('reset')]);
  }).catch(() => { $('#keys').textContent = ''; });
}

function init() {
  localize();
  applyBounds();
  bindControls();
  showShortcuts();
  showAllSitesOffer();
  chrome.tabs.query({active: true, currentWindow: true}).then(([tab]) => {
    if (!tab?.id) throw new Error('No active tab');
    tabId = tab.id;
    tabUrl = tab.url || '';
    return send('status');
  }).catch(() => { setStatus('tabError', 'error'); });
}

init();
