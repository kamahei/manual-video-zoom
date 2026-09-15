(() => {
  'use strict';
  // The script can arrive twice: registered for a granted origin and injected
  // on demand into the same open tab. Only the first copy takes the document.
  if (globalThis.videoZoomLoaded) return;
  globalThis.videoZoomLoaded = true;

  const {DEFAULT_PERCENT, MESSAGE_TYPE, ACTIONS, storageKey, normalize} = globalThis.VideoZoom;

  const STYLE_PROPERTIES = ['scale', 'transform-origin', 'clip-path'];
  const RECHECK_MS = 1000;
  const KEY = storageKey(location.origin);

  const state = {percent: DEFAULT_PERCENT, video: null, savedStyles: null, saveError: false};

  /* Target selection */

  function isRenderedVideo(element) {
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return box.width > 0 && box.height > 0 && box.bottom > 0 && box.right > 0 &&
      box.top < innerHeight && box.left < innerWidth && style.visibility !== 'hidden' &&
      style.display !== 'none' && style.opacity !== '0';
  }

  function selectLargestVideo() {
    return [...document.querySelectorAll('video')].filter(isRenderedVideo)
      .sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0] || null;
  }

  // Adopt the current largest video, releasing the previous one untouched.
  function refreshTarget() {
    const next = selectLargestVideo();
    if (next !== state.video) {
      restoreStyles();
      state.video = next;
    }
    return state.video;
  }

  /* Style application */

  function captureStyles(video) {
    return STYLE_PROPERTIES.map(name =>
      [name, video.style.getPropertyValue(name), video.style.getPropertyPriority(name)]);
  }

  function restoreStyles() {
    if (state.video && state.savedStyles) {
      for (const [name, value, priority] of state.savedStyles) {
        if (value) state.video.style.setProperty(name, value, priority);
        else state.video.style.removeProperty(name);
      }
    }
    state.savedStyles = null;
  }

  function applyZoom() {
    const video = refreshTarget();
    if (!video) return;
    if (state.percent === DEFAULT_PERCENT) { restoreStyles(); return; }
    if (!state.savedStyles) state.savedStyles = captureStyles(video);
    const scale = state.percent / 100;
    video.style.setProperty('scale', String(scale), 'important');
    video.style.setProperty('transform-origin', 'center center', 'important');
    video.style.setProperty('clip-path', `inset(${(1 - 1 / scale) * 50}%)`, 'important');
  }

  /* Fill-the-frame geometry */

  // Zoom that makes the letterboxed picture span the element box, derived from
  // the intrinsic size and the layout box. The decoded image is never
  // inspected, so this is not black-bar detection.
  function computeFitPercent() {
    const video = state.video;
    if (!video || !video.videoWidth || !video.videoHeight) return null;
    const objectFit = getComputedStyle(video).objectFit;
    if (objectFit !== 'contain' && objectFit !== 'scale-down') return null;
    const boxWidth = video.clientWidth;
    const boxHeight = video.clientHeight;
    if (!boxWidth || !boxHeight) return null;
    let pictureScale = Math.min(boxWidth / video.videoWidth, boxHeight / video.videoHeight);
    if (objectFit === 'scale-down') pictureScale = Math.min(pictureScale, 1);
    if (!(pictureScale > 0)) return null;
    return normalize(Math.round(boxWidth / (video.videoWidth * pictureScale) * 100));
  }

  /* Persistence */

  let writeQueue = Promise.resolve();

  function savePercent(percent) {
    writeQueue = writeQueue.then(() => chrome.storage.local.set({[KEY]: percent}))
      .then(() => { state.saveError = false; }).catch(() => { state.saveError = true; });
    return writeQueue;
  }

  const ready = chrome.storage.local.get(KEY).then(data => {
    state.percent = normalize(data[KEY]);
  }).catch(() => { state.saveError = true; }).then(applyZoom);

  /* Watching for replaced videos and layout changes */

  let recheckTimer = null;
  let applyScheduled = false;

  function startRecheck() {
    if (recheckTimer === null && !document.hidden) recheckTimer = setInterval(applyZoom, RECHECK_MS);
  }

  function stopRecheck() {
    if (recheckTimer !== null) { clearInterval(recheckTimer); recheckTimer = null; }
  }

  // Players emit mutation records continuously; collapse a burst into one pass.
  function scheduleApply() {
    if (applyScheduled) return;
    applyScheduled = true;
    requestAnimationFrame(() => { applyScheduled = false; applyZoom(); });
  }

  function touchesVideo(records) {
    for (const record of records) {
      for (const nodes of [record.addedNodes, record.removedNodes]) {
        for (const node of nodes) {
          if (node.nodeType !== 1) continue;
          if (node.localName === 'video' || node.querySelector?.('video')) return true;
        }
      }
    }
    return false;
  }

  function startWatching() {
    startRecheck();
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { stopRecheck(); return; }
      applyZoom();
      startRecheck();
    });
    document.addEventListener('fullscreenchange', scheduleApply);
    addEventListener('resize', scheduleApply);
    new MutationObserver(records => { if (touchesVideo(records)) scheduleApply(); })
      .observe(document.documentElement, {childList: true, subtree: true});
  }

  /* Messaging */

  function handleMessage(message, sender, reply) {
    if (sender.id !== chrome.runtime.id || message?.type !== MESSAGE_TYPE) return;
    if (!ACTIONS.includes(message.action)) return;
    ready.then(async () => {
      refreshTarget();
      if (message.action === 'set') state.percent = normalize(message.value);
      if (message.action === 'delta' && Number.isFinite(message.value)) state.percent = normalize(state.percent + message.value);
      if (message.action === 'reset') state.percent = DEFAULT_PERCENT;
      if (message.action === 'fit') {
        const fit = computeFitPercent();
        if (fit !== null) state.percent = fit;
      }
      applyZoom();
      // A live slider drag sends persist:false so a scrub does not flood storage.
      if (message.action !== 'status' && message.persist !== false) await savePercent(state.percent);
      reply({
        percent: state.percent,
        found: Boolean(state.video),
        saveError: state.saveError,
        fitPercent: computeFitPercent()
      });
    }).catch(() => reply({error: true}));
    return true;
  }

  chrome.runtime.onMessage.addListener(handleMessage);
  ready.then(startWatching);
})();
