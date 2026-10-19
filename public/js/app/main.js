'use strict';

/**
 * SANDSIAM · Application: interface, editing and input.
 * Depends on js/data (TRANSLATIONS, THAI_MAP), js/scene (drawing), js/kids
 * (Players, Sound, Polite, Stickers), js/store (fieldStore) and, in this folder,
 * config.js (constants) and state.js (defaults, clamp, validate).
 */
(() => {
  const $ = (selector) => document.querySelector(selector);

  // Every visit opens on the intro at the top, not a remembered scroll position.
  if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual';

  const inArtifact = !!(window.claude && typeof window.claude.use === 'function');

  /* =========================================================
   * State (defaults and validate live in state.js)
   * ======================================================= */

  let state = defaults();
  let mode = 'intro'; // 'intro' | 'editor' | 'share' | 'field'
  let viewing = null; // a friend's creation opened from a link; never saved over your own
  let lang = 'th';
  let step = 0;
  let tab = 0;
  let color = ORIGINAL; // new pieces keep their picture's own colours until a colour is picked
  let selected = null;
  let zoom = 1;
  let history = [];
  let future = [];
  let saveOK = true;
  let shareError = false;

  try {
    lang = localStorage.getItem(LANG_KEY) || 'th';
  } catch {
    /* Storage blocked: Thai by default. */
  }
  if (!TRANSLATIONS[lang]) lang = 'th';

  /** Loads the current player's saved pagoda (each child at a shared computer has their own). */
  function loadPlayerState() {
    state = defaults();
    try {
      const saved = localStorage.getItem(Players.storageKey());
      if (saved) state = validate(JSON.parse(saved));
    } catch {
      /* Corrupt or blocked: start fresh. */
    }
    const player = Players.current();
    if (player && !state.name) state.name = player.name;
    history = [];
    future = [];
    selected = null;
  }
  loadPlayerState();

  // A shared creation opens in the celebration view, kept apart from your own work.
  if (location.hash.startsWith('#art=')) {
    try {
      if (location.hash.length > 24000) throw Error('Too long');
      const bytes = Uint8Array.from(atob(location.hash.slice(5)), (ch) => ch.charCodeAt(0));
      viewing = validate(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
      mode = 'share';
    } catch {
      shareError = true;
    }
  }

  const t = (key) => TRANSLATIONS[lang][key];
  const fill = (text, values) => text.replace(/\{(\w+)\}/g, (_, k) => values[k] ?? '');
  const placeLabel = (i) => `${t('places')[i]} · ${t('placeAreas')[i]}`;
  const snapshot = () => JSON.stringify(state);
  const shown = () => (mode === 'share' && viewing ? viewing : state);

  function shareUrl(s) {
    if (inArtifact) return ARTIFACT_URL;
    const encoded = btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(s))));
    return location.origin + location.pathname + location.search + '#art=' + encoded;
  }

  function persist() {
    try {
      localStorage.setItem(Players.storageKey(), snapshot());
      saveOK = true;
    } catch {
      saveOK = false;
    }
    $('#saveStatus')?.replaceWith(saveNote());
  }

  function remember() {
    history.push(snapshot());
    if (history.length > 80) history.shift();
    future = [];
  }

  /** Applies an undoable change, saves it and refreshes the view. */
  function change(fn, rebuild = true) {
    remember();
    fn();
    persist();
    if (rebuild) {
      render();
    } else {
      draw();
      updateToolbar();
    }
  }

  /* =========================================================
   * Small DOM helpers
   * ======================================================= */

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function button(text, onClick, className = '') {
    const b = el('button', className, text);
    b.type = 'button';
    b.onclick = onClick;
    return b;
  }

  const label = (text) => el('div', 'field-label', text);

  /** A small picture of a region's backdrop. */
  function placeThumb(i) {
    const thumb = el('span', 'place-thumb');
    thumb.style.backgroundImage = backdropThumb(i);
    return thumb;
  }
  /** An icon from the sprite in index.html (Lucide). */
  function icon(name, className = '') {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', `icon ${className}`.trim());
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', `#i-${name}`);
    svg.append(use);
    return svg;
  }

  /** A line of text with an icon in front; tips get a light bulb. */
  function note(text, className = 'tip', iconName = className === 'tip' ? 'lightbulb' : null) {
    const p = el('p', className);
    if (iconName) p.append(icon(iconName), el('span', '', text));
    else p.textContent = text;
    return p;
  }

  /** "Saved" with a tick, or why saving failed. */
  function saveNote() {
    const status = note(t(saveOK ? 'saved' : 'saveFail'), 'save-status' + (saveOK ? '' : ' is-failed'), saveOK ? 'check' : 'alert');
    status.id = 'saveStatus';
    return status;
  }

  function toast(message) {
    const box = $('#toast');
    box.textContent = message;
    box.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => box.classList.remove('show'), 3000);
  }

  /** Segmented choice buttons. */
  function options(parent, labels, current, onPick) {
    const row = el('div', 'segmented');
    labels.forEach((text, i) => {
      const b = button(text, () => onPick(i), i === current ? 'is-selected' : '');
      b.setAttribute('aria-pressed', String(i === current));
      row.append(b);
    });
    parent.append(row);
  }

  /** Range slider whose drag counts as one undo step. */
  function range(parent, text, value, min, max, interval, onInput) {
    const wrap = el('label', 'field-label range-field');
    const output = el('output', '', `${Math.round(value * 100)}%`);
    const title = el('span', 'range-title');
    title.append(text, output);
    const input = el('input');
    input.type = 'range';
    input.setAttribute('aria-label', text);
    Object.assign(input, { min, max, step: interval, value });
    let started = false;
    input.addEventListener('input', () => {
      if (!started) {
        remember();
        started = true;
      }
      onInput(Number(input.value));
      output.textContent = `${Math.round(Number(input.value) * 100)}%`;
      draw();
      persist();
      updateToolbar();
    });
    input.addEventListener('change', () => (started = false));
    wrap.append(title, input);
    parent.append(wrap);
  }

  function swatches(parent, values, current, onPick, names) {
    const row = el('div', 'swatches');
    values.forEach((value, i) => {
      const b = button('', () => onPick(i), 'swatch' + (value === ORIGINAL ? ' swatch-original' : '') + (value === current ? ' is-selected' : ''));
      if (value !== ORIGINAL) b.style.setProperty('--swatch', value);
      b.setAttribute('aria-label', names?.[i] || `${t('sand')} ${i + 1}`);
      b.setAttribute('aria-pressed', String(value === current));
      row.append(b);
    });
    parent.append(row);
  }

  /* =========================================================
   * Rendering the interface
   * ======================================================= */

  function updateToolbar() {
    const labels = [['undo', 'undo'], ['redo', 'redo'], ['zoomIn', 'zoomIn'], ['zoomOut', 'zoomOut'], ['zoomReset', 'zoomReset'], ['delete', 'delete']];
    for (const [id, key] of labels) {
      $('#' + id).setAttribute('aria-label', t(key));
      $('#' + id).title = t(key);
    }
    $('#undo').disabled = !history.length;
    $('#redo').disabled = !future.length;
    $('#zoomIn').disabled = zoom >= ZOOM.max;
    $('#zoomOut').disabled = zoom <= ZOOM.min;
    $('#zoomReset').textContent = Math.round(zoom * 100) + '%';
    $('#delete').hidden = selected === null || mode !== 'editor' || step !== 2;
    $('#delete').textContent = t('delete');
    const picked = state.objects.find((o) => o.id === selected);
    $('#flip').hidden = $('#delete').hidden || !picked || isRing(picked.type);
    $('#flip').replaceChildren(icon('flip'), el('span', '', t('flip')));
    $('#flip').setAttribute('aria-label', t('flipLong'));
    $('#flip').title = t('flipLong');
    renderPickPalette();
    renderLayers();
  }

  function renderStatic() {
    document.documentElement.lang = lang === 'zh' ? 'zh-Hans' : lang;
    document.title = 'SANDSIAM · ' + t('tagline');
    document.querySelectorAll('[data-t]').forEach((node) => (node.textContent = t(node.dataset.t)));

    $('#language').value = lang;
    $('#language').setAttribute('aria-label', t('language'));
    $('#home').setAttribute('aria-label', t('home'));
    $('#home').title = t('home');
    $('#help').setAttribute('aria-label', t('help'));
    $('#help').title = t('help');
    $('.modal-close').setAttribute('aria-label', t('close'));
    $('#scene').setAttribute('aria-label', `${t('untitled')}. ${t('helpText')}`);
    $('#sound').setAttribute('aria-label', t(Sound.on ? 'soundOff' : 'soundOn'));
    $('#sound').title = t(Sound.on ? 'soundOff' : 'soundOn');
    $('#sound').classList.toggle('is-muted', !Sound.on);
    $('#music').setAttribute('aria-label', t(Music.on ? 'musicOff' : 'musicOn'));
    $('#music').title = t(Music.on ? 'musicOff' : 'musicOn');
    $('#music').classList.toggle('is-muted', !Music.on);
    $('#music').classList.toggle('is-playing', Music.playing);
    $('#music').classList.toggle('is-waiting', Music.on && !Music.playing);
    const player = Players.current();
    $('#playerName').textContent = player ? player.name : t('whoPlays');
    $('#player').setAttribute('aria-label', t('switchPlayer'));
    $('#player').title = t('switchPlayer');
    document.querySelectorAll('[data-howto]').forEach((node) => (node.textContent = t('howTo')[Number(node.dataset.howto)]));
    renderGuide();
  }

  /* ----- Guide character ----- */

  // On phones and upright tablets the panel sits under the scene (css/responsive/phone.css),
  // and the guide sits in it, above the step title, so it never covers the pagoda.
  const STACKED_QUERY = '(max-width: 760px), (max-width: 1100px) and (orientation: portrait)';
  const stackedQuery = window.matchMedia(STACKED_QUERY);
  function placeGuide() {
    const guide = $('#guide');
    if (stackedQuery.matches) $('.editor').insertBefore(guide, $('.editor-head'));
    else $('.stage').insertBefore(guide, $('#stickerPop'));
  }
  stackedQuery.addEventListener('change', placeGuide);
  placeGuide();

  // Talking: while a tip is new the guide's mouth flaps between open, half open and closed.
  // Each pose has its own frames (made by tools/make-mouth-frames.py); 'think' rests with its mouth closed.
  const guideMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const mouthFrames = (pose) =>
    (pose === 'think' ? ['think-open', 'think-mid', 'think'] : [pose, `${pose}-mid`, `${pose}-closed`]).map(
      (frame) => `assets/guide/mascot-${frame}.png`,
    );
  const restingFace = (pose) => mouthFrames(pose)[pose === 'think' ? 2 : 0];
  // Kept loaded so a frame is never shown before it has arrived: an unloaded picture has no
  // height, and the guide would blink out of sight.
  const guidePictures = new Map();
  ['wave', 'think', 'cheer', 'point'].forEach((pose) =>
    mouthFrames(pose).forEach((src) => {
      const picture = new Image();
      picture.src = src;
      guidePictures.set(src, picture);
    }),
  );
  const pictureReady = (src) => {
    const picture = guidePictures.get(src);
    return !!picture && picture.complete && picture.naturalWidth > 0;
  };
  let guidePose = '';

  function showFace(pose) {
    clearTimeout(talk.timer);
    $('#guideMouth').hidden = true;
    guidePose = pose;
    const src = restingFace(pose);
    const face = $('#guideImage');
    if (face.getAttribute('src') === src) return;
    if (pictureReady(src)) face.src = src;
    else guidePictures.get(src).decode().then(() => guidePose === pose && (face.src = src), () => {});
  }

  /** Flaps the mouth for about as long as the text takes to say; returns that time in ms. */
  function talk(pose, text) {
    showFace(pose);
    const duration = Math.min(4500, 500 + [...text].length * 65);
    if (guideMotion.matches) return duration;
    const frames = mouthFrames(pose);
    const rest = restingFace(pose);
    const mouth = $('#guideMouth');
    const end = performance.now() + duration;
    let last = -1;
    const flap = () => {
      const guide = $('#guide');
      if (performance.now() > end || guide.hidden || guide.classList.contains('is-leaving')) return showFace(pose);
      // Never the same mouth twice in a row, so it always looks like it is moving.
      let next = Math.floor(Math.random() * frames.length);
      if (next === last) next = (next + 1) % frames.length;
      last = next;
      // The resting face underneath already shows that mouth; a frame still loading is skipped.
      const src = frames[next];
      if (src === rest || !pictureReady(src) || !pictureReady(rest)) mouth.hidden = true;
      else {
        mouth.src = src;
        mouth.hidden = false;
      }
      talk.timer = setTimeout(flap, 90 + Math.random() * 80);
    };
    flap();
    return duration;
  }

  // The guide pops in for each new tip, says it, and leaves a little after it stops talking.
  let guideAway = false;

  function sayTip(pose) {
    const guide = $('#guide');
    clearTimeout(sayTip.timer);
    guideAway = false;
    guide.classList.remove('is-leaving');
    guide.hidden = false;
    const duration = talk(pose, $('#guideText').textContent);
    sayTip.timer = setTimeout(() => {
      guide.classList.add('is-leaving');
      sayTip.timer = setTimeout(() => {
        guideAway = true;
        guide.hidden = true;
        guide.classList.remove('is-leaving');
        showFace(guidePose);
      }, 350);
    }, duration + 2500);
  }

  function renderGuide(pose) {
    const guide = $('#guide');
    const show = mode === 'editor';
    guide.hidden = !show || guideAway;
    if (!show) return showFace(guidePose || GUIDE_POSES[step]);
    const nextPose = pose || GUIDE_POSES[step];
    const text = t('guideTips')[step];
    if ($('#guideText').textContent !== text || pose) {
      $('#guideText').textContent = text;
      sayTip(nextPose);
    } else if (nextPose !== guidePose) {
      showFace(nextPose);
    }
  }

  /** The guide cheers and a sticker pops up when a step is finished for the first time. */
  function finishStep(done) {
    if (!Stickers.give(done)) return;
    Sound.play('sticker');
    const pop = $('#stickerPop');
    $('#stickerPopImage').src = `assets/ornaments/${STICKERS[done]}.webp`;
    $('#stickerPopText').textContent = t('stickerGot');
    pop.hidden = false;
    pop.classList.remove('is-showing');
    void pop.offsetWidth;
    pop.classList.add('is-showing');
    clearTimeout(finishStep.timer);
    finishStep.timer = setTimeout(() => (pop.hidden = true), 1800);
    renderGuide('cheer');
  }

  function stickerShelf() {
    const earned = Stickers.earned();
    const shelf = el('div', 'sticker-shelf');
    shelf.append(el('p', 'field-label', t('stickers')));
    const row = el('div', 'sticker-row');
    STICKERS.forEach((file, i) => {
      const slot = el('span', 'sticker' + (earned.includes(i) ? ' is-earned' : ''));
      const img = el('img');
      img.src = `assets/ornaments/${file}.webp`;
      img.alt = earned.includes(i) ? t('steps')[i] : '';
      slot.append(img);
      row.append(slot);
    });
    shelf.append(row);
    return shelf;
  }

  /* ----- Who's playing? ----- */

  let afterPlayerChosen = null;

  /** Runs `then` once a player is chosen, asking "Who's playing?" first if needed. */
  function requirePlayer(then) {
    if (Players.current()) return then();
    openPlayers(then);
  }

  function openPlayers(then = null) {
    afterPlayerChosen = then;
    renderPlayers();
    const dialog = $('#playerDialog');
    if (!dialog.open) dialog.showModal();
    setTimeout(() => $('#newPlayerName').focus(), 50);
  }

  function choosePlayer(id) {
    Players.choose(id);
    loadPlayerState();
    $('#playerDialog').close();
    Sound.play('tap');
    const then = afterPlayerChosen;
    afterPlayerChosen = null;
    if (then) then();
    else render();
  }

  function renderPlayers(confirmId = null) {
    $('#playerTitle').textContent = t('whoPlays');
    $('#playerNote').textContent = t('playerNote');
    $('#newPlayerLabel').textContent = t('newPlayer');
    $('#newPlayerName').placeholder = t('nickPlaceholder');
    $('#newPlayerGo').textContent = t('play');
    const list = $('#playerList');
    list.replaceChildren();
    for (const player of Players.list()) {
      const row = el('div', 'player-row');
      if (confirmId === player.id) {
        row.append(
          el('span', 'player-confirm', fill(t('confirmRemove'), { name: player.name })),
          button(t('yes'), () => {
            Players.remove(player.id);
            renderPlayers();
          }, 'btn-ghost'),
          button(t('no'), () => renderPlayers(), 'btn-ghost')
        );
      } else {
        const pick = button(player.name, () => choosePlayer(player.id), 'player-pick' + (Players.current()?.id === player.id ? ' is-current' : ''));
        const del = button('', () => renderPlayers(player.id), 'player-remove');
        del.append(icon('x'));
        del.setAttribute('aria-label', `${t('removePlayer')} ${player.name}`);
        row.append(pick, del);
      }
      list.append(row);
    }
  }

  function addPlayer() {
    const input = $('#newPlayerName');
    const name = input.value.trim();
    if (!name) return input.focus();
    if (!Polite.ok(name)) {
      toast(t('notPolite'));
      return input.focus();
    }
    input.value = '';
    choosePlayer(Players.add(name).id);
  }

  const hasWork = () => state.objects.length > 0 || state.name.trim() !== '' || state.wish.trim() !== '';

  function renderIntro() {
    $('#resume').hidden = !Players.current() || !hasWork();
    $('#resume').textContent = t('resume');
    $('#counterBefore').textContent = t('counterBefore');
    $('#counterAfter').textContent = t('counterAfter');
    showCount($('#counterValue'), counts.total);

    const list = $('#regions');
    list.replaceChildren();
    t('places').forEach((name, i) => {
      const b = button('', () => showRegion(i), 'region-btn');
      const n = el('small', '', String(counts.byPlace[i] || 0));
      n.hidden = !counts.byPlace[i];
      b.append(el('span', '', name), n);
      list.append(b);
    });
    introIndex = -1; // refresh the active region (e.g. after a language change)
  }

  /* ----- Counter & pagoda field ----- */

  let counts = { total: 0, byPlace: PLACES.map(() => 0) };
  let fieldPlace = 0;
  // A region fills one field (ลาน) of FIELD_SIZE pagodas at a time; a full field opens the next.
  let fieldPage = 0;
  let fieldPages = 1;
  let fieldMinePage = null;
  let fieldLoads = 0;
  let fieldEntries = [];
  let fieldSelected = null;
  let fieldHits = [];
  const fieldCache = new Map();

  /** Counts up to a number, so a new total feels alive. */
  function showCount(node, value) {
    const from = Number(node.dataset.value || 0);
    node.dataset.value = String(value);
    if (!motionOK() || from === value) {
      node.textContent = value.toLocaleString(lang);
      return;
    }
    const start = now();
    const tick = () => {
      const k = Math.min(1, (now() - start) / 0.8);
      node.textContent = Math.round(from + (value - from) * (1 - Math.pow(1 - k, 3))).toLocaleString(lang);
      if (k < 1) requestAnimationFrame(tick);
    };
    tick();
  }

  async function refreshCounts() {
    try {
      counts = await fieldStore.count(PLACES.length);
    } catch {
      /* Keep the last known numbers. */
    }
    showCount($('#counterValue'), counts.total);
    document.querySelectorAll('.region-btn small').forEach((n, i) => {
      n.textContent = String(counts.byPlace[i] || 0);
      n.hidden = !counts.byPlace[i];
    });
    if (mode === 'field') renderField();
  }

  /** Example pagodas that show the look of a lively field; always tagged as examples. */
  function examplePagodas(place) {
    const ringColors = [PALETTE[4], PALETTE[5], PALETTE[3], PALETTE[1]];
    return Array.from({ length: FIELD_SIZE }, (_, i) => {
      const r = (k) => seeded(i + place * 17 + 3, k);
      const st = defaults();
      st.place = place;
      st.shape = Math.floor(r(1) * 3);
      st.base = r(2) > 0.65 ? 1 : 0;
      st.sand = Math.floor(r(3) * 3);
      st.height = 0.88 + r(4) * 0.28;
      const objects = [];
      // One or two flower rings, snug on round tiers (the same heights the editor snaps to).
      const snapTiers = pagodaSnapTiers(st);
      const ringTiers = snapTiers.filter((y) => !(st.base === 1 && y > 0));
      ringTiers.slice(1, 2 + Math.floor(r(5) * 2)).forEach((y, k) => objects.push({ type: RING_TYPES[Math.floor(r(20 + k) * RING_TYPES.length)], color: ringColors[(k + i) % 4], x: 0, y: y * st.height, size: 1 }));
      // A pair of flags planted behind the pagoda, rising on either side of it.
      objects.push({ type: 1, color: PALETTE[Math.floor(r(6) * 5)], x: -112 - r(7) * 8, y: -22 * st.height, size: 0.72, back: true });
      objects.push({ type: 1, color: PALETTE[Math.floor(r(8) * 5)], x: 96 + r(9) * 8, y: -22 * st.height, size: 0.72, back: true });
      // Incense in the sand in front, and sometimes a motif on the body.
      if (r(10) > 0.4) objects.push({ type: INCENSE, color: PALETTE[0], x: 62, y: 62 * st.height + 14, size: 0.85 });
      if (r(11) > 0.5) objects.push({ type: 6 + Math.floor(r(12) * 3), color: PALETTE[Math.floor(r(13) * 5)], x: 0, y: snapTiers[Math.floor(snapTiers.length * 0.6)] * st.height, size: 0.7 });
      st.objects = objects.map((o, k) => ({ id: k + 1, ...o }));
      return { id: `example-${place}-${i}`, place, state: st, name: '', wish: t('exampleWish'), example: true };
    });
  }

  /**
   * Shows one field of a region. page: a number (counting from 0), null for the newest
   * field, or 'mine' for the field holding this device's pagoda (else the newest).
   */
  async function loadField(place, page = null, keepSelection = false) {
    const load = ++fieldLoads;
    fieldPlace = place;
    syncPageBackdrop();
    if (!keepSelection) fieldSelected = null;
    try {
      let res = await fieldStore.page(place, page === 'mine' ? null : page, FIELD_SIZE);
      if (page === 'mine' && res.mine != null && res.mine !== res.page) res = await fieldStore.page(place, res.mine, FIELD_SIZE);
      if (load !== fieldLoads) return; // a newer choice came in meanwhile
      fieldPage = Number(res.page) || 0;
      fieldPages = Math.max(1, Number(res.pages) || 1);
      fieldMinePage = res.mine ?? null;
      // Shared entries come from other people: keep only well-formed pagodas.
      fieldEntries = (res.entries || [])
        .map((e) => {
          try {
            return { ...e, state: { ...validate(e.state), name: e.name, wish: e.wish } };
          } catch {
            return null;
          }
        })
        .filter(Boolean);
    } catch {
      if (load !== fieldLoads) return;
      fieldEntries = [];
    }
    renderField();
    draw();
  }

  // Someone offered a pagoda (here or elsewhere): refresh counts and the field on show.
  fieldStore.onChange(() => {
    fieldCache.clear();
    refreshCounts();
    if (mode === 'field') loadField(fieldPlace, fieldPage, true);
    if (mode === 'editor' && step === LAST_STEP) renderEditor();
  });

  /** Real pagodas first; the first field is topped up with examples until it fills. */
  function fieldShown() {
    const real = fieldEntries.filter((e) => !e.hidden).slice(0, FIELD_SIZE);
    const examples = fieldPage === 0 ? examplePagodas(fieldPlace) : [];
    return [...real, ...examples.slice(0, Math.max(0, FIELD_SIZE - real.length))];
  }

  /** Back and next between a region's fields, once there is more than one. */
  function renderFieldPages() {
    const box = $('#fieldPages');
    box.replaceChildren();
    box.hidden = fieldPages < 2;
    if (box.hidden) return;
    const go = (page) => {
      Sound.play('tap');
      loadField(fieldPlace, page);
    };
    const prev = button('', () => go(fieldPage - 1), 'field-page-btn is-prev');
    prev.append(icon('arrow-right'));
    prev.setAttribute('aria-label', t('fieldPrev'));
    prev.disabled = fieldPage <= 0;
    const next = button('', () => go(fieldPage + 1), 'field-page-btn');
    next.append(icon('arrow-right'));
    next.setAttribute('aria-label', t('fieldNext'));
    next.disabled = fieldPage >= fieldPages - 1;
    const caption = el('p', 'field-page-label');
    caption.setAttribute('aria-live', 'polite');
    caption.append(el('b', '', fill(t('fieldPageOf'), { n: (fieldPage + 1).toLocaleString(lang), total: fieldPages.toLocaleString(lang) })));
    if (fieldMinePage === fieldPage) caption.append(el('small', '', t('fieldMineHere')));
    else if (fieldPage === fieldPages - 1) caption.append(el('small', '', t('fieldNewest')));
    box.setAttribute('aria-label', t('fieldNewest'));
    box.append(prev, caption, next, el('p', 'field-pages-note', fill(t('fieldPagesNote'), { n: FIELD_SIZE })));
  }

  function renderField() {
    $('#fieldNote').textContent = t(fieldStore.shared ? 'fieldSharedNote' : 'fieldLocalNote');
    $('#fieldTotal').textContent = `${t('counterBefore')} ${counts.total.toLocaleString(lang)} ${t('counterAfter')}`.trim();
    const tabs = $('#fieldRegions');
    tabs.replaceChildren();
    t('places').forEach((name, i) => {
      const b = button('', () => loadField(i), 'field-region' + (i === fieldPlace ? ' is-selected' : ''));
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(i === fieldPlace));
      b.append(el('b', '', name), el('small', '', fill(t('fieldRegionCount'), { n: (counts.byPlace[i] || 0).toLocaleString(lang) })));
      tabs.append(b);
    });

    renderFieldPages();
    renderReviews();

    const card = $('#fieldCard');
    card.replaceChildren();
    const entry = fieldShown().find((e) => e.id === fieldSelected);
    if (!entry) {
      card.append(note(fieldEntries.length ? t('fieldPick') : t('fieldEmpty'), 'field-hint', 'pointer'));
      return;
    }
    const tag = entry.example ? t('example') : entry.approved ? '' : t('pendingTag');
    card.append(
      el('p', 'share-place', `${placeLabel(entry.place)}${tag ? ' · ' + tag : ''}`),
      el('h3', '', entry.example ? t('example') : entry.name || t('friend')),
      el('blockquote', '', entry.wish || t('ready'))
    );
    if (!entry.example) {
      card.append(button(t('viewThis'), () => {
        viewing = entry.state;
        setMode('share');
        startReveal();
      }, 'btn-outline btn-block'));
    }
    if (!entry.example && fieldStore.canReview) card.append(reviewButtons(entry));
  }

  /* ----- Teacher review ----- */

  function reviewButtons(entry) {
    const row = el('div', 'review-row');
    row.append(
      button(t('approve'), () => review(entry, true), 'btn-gold'),
      button(t('hideEntry'), () => review(entry, false), 'btn-ghost')
    );
    return row;
  }

  async function review(entry, ok) {
    try {
      await fieldStore.review(entry, ok);
      Sound.play(ok ? 'correct' : 'remove');
    } catch {
      toast(t('offerFail'));
    }
  }

  /** Teachers see the pagodas waiting for a check in this region. */
  function renderReviews() {
    const box = $('#fieldReviews');
    box.replaceChildren();
    const pending = fieldEntries.filter((e) => !e.approved && !e.hidden);
    box.hidden = !fieldStore.canReview || !pending.length;
    if (box.hidden) return;
    box.append(el('p', 'field-label', fill(t('pendingTitle'), { n: pending.length })));
    for (const entry of pending) {
      const item = el('div', 'review-item');
      item.append(el('b', '', entry.name || t('friend')), el('p', '', entry.wish || t('ready')), reviewButtons(entry));
      box.append(item);
    }
  }

  function openField(place = state.place, page = null) {
    setMode('field');
    loadField(place, page);
  }

  /** Offers this pagoda in its region, then celebrates it. */
  async function offer() {
    if (!Polite.ok(state.name) || !Polite.ok(state.wish)) {
      Sound.play('wrong');
      toast(t('notPolite'));
      return goTo(3);
    }
    try {
      const picture = await pictureBlob(state);
      await fieldStore.offer(JSON.parse(snapshot()), Players.current()?.id || 'guest', picture);
      Sound.play('celebrate');
      fieldCache.clear();
      toast(fill(t('offered'), { place: t('places')[state.place] }));
      refreshCounts();
      openShare();
    } catch {
      toast(t('offerFail'));
    }
  }

  function renderSteps() {
    const nav = $('#steps');
    nav.setAttribute('aria-label', t('chapter'));
    nav.replaceChildren();
    t('steps').forEach((name, i) => {
      const status = i === step ? 'is-active' : i < step ? 'is-done' : '';
      const b = button('', () => goTo(i), 'step ' + status);
      const number = el('span', 'step-number');
      number.append(icon(STEP_ICONS[i]));
      if (i < step) {
        const check = el('i', 'step-check');
        check.append(icon('check'));
        number.append(check);
      }
      b.append(number, el('span', 'step-name', name));
      if (i === step) b.setAttribute('aria-current', 'step');
      nav.append(b);
    });
  }

  /* ----- Step 1 · Map of Thailand ----- */

  const SVG_NS = 'http://www.w3.org/2000/svg';

  function renderPlaceStep(p) {
    const pick = (i) => {
      Sound.play('tap');
      change(() => (state.place = i));
    };
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', THAI_MAP.viewBox);
    svg.setAttribute('class', 'thai-map');
    svg.setAttribute('role', 'group');
    svg.setAttribute('aria-label', t('mapHint'));
    THAI_MAP.regions.forEach((d, i) => {
      const path = document.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', d);
      path.setAttribute('class', 'map-region' + (state.place === i ? ' is-selected' : ''));
      path.style.setProperty('--region', REGION_COLORS[i]);
      path.setAttribute('tabindex', '0');
      path.setAttribute('role', 'button');
      path.setAttribute('aria-label', placeLabel(i));
      path.setAttribute('aria-pressed', String(state.place === i));
      path.addEventListener('click', () => pick(i));
      path.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          pick(i);
        }
      });
      svg.append(path);
    });
    THAI_MAP.labels.forEach(([x, y], i) => {
      const text = document.createElementNS(SVG_NS, 'text');
      text.setAttribute('x', x);
      text.setAttribute('y', y);
      text.setAttribute('class', 'map-label');
      text.textContent = t('places')[i];
      svg.append(text);
    });

    const card = el('div', 'region-card');
    card.style.setProperty('--region', REGION_COLORS[state.place]);
    const body = el('div', 'region-card-body');
    body.append(el('b', '', t('places')[state.place]), el('em', '', t('placeAreas')[state.place]), el('p', '', t('placeKidDescs')[state.place]));
    card.append(placeThumb(state.place), body);

    const layout = el('div', 'map-layout');
    layout.append(svg, card);
    p.append(layout, note(t('westNote'), 'fine-print'));
  }

  /* ----- Step 2 · Pictures instead of words ----- */

  /** A small drawing of a pagoda, for the shape and base buttons. */
  function pagodaThumb(overrides) {
    const canvas = el('canvas');
    canvas.width = 132;
    canvas.height = 120;
    canvas.setAttribute('aria-hidden', 'true');
    const c = canvas.getContext('2d');
    c.translate(66, 104);
    c.scale(0.26, 0.26);
    drawPagoda(c, { ...defaults(), sand: state.sand, ...overrides });
    return canvas;
  }

  function pictureOptions(parent, labels, current, onPick, picture) {
    const row = el('div', 'picture-options');
    labels.forEach((text, i) => {
      const b = button('', () => {
        Sound.play('tap');
        onPick(i);
      }, 'picture-option' + (i === current ? ' is-selected' : ''));
      b.setAttribute('aria-pressed', String(i === current));
      b.append(picture(i), el('span', '', text));
      row.append(b);
    });
    parent.append(row);
  }

  function renderBuildStep(p) {
    p.append(label(t('shape')));
    pictureOptions(p, t('shapes'), state.shape, (i) => change(() => (state.shape = i)), (i) => pagodaThumb({ shape: i, base: state.base }));
    p.append(label(t('base')));
    pictureOptions(p, t('bases'), state.base, (i) => change(() => (state.base = i)), (i) => pagodaThumb({ shape: state.shape, base: i }));
    p.append(label(t('height')));
    const level = HEIGHTS.reduce((best, h, i) => (Math.abs(h - state.height) < Math.abs(HEIGHTS[best] - state.height) ? i : best), 0);
    pictureOptions(p, t('heightLevels'), level, (i) => change(() => (state.height = HEIGHTS[i])), (i) => pagodaThumb({ shape: state.shape, base: state.base, height: HEIGHTS[i] }));
    p.append(label(t('sand')));
    swatches(p, SAND_COLORS, SAND_COLORS[state.sand], (i) => {
      Sound.play('tap');
      change(() => (state.sand = i));
    });
  }

  /* ----- Step 3 · Decorate ----- */

  function renderDecorateStep(p) {
    const tabs = el('div', 'tabs');
    tabs.setAttribute('role', 'tablist');
    t('tabs').forEach((text, i) => {
      const b = button(text, () => {
        tab = i;
        Sound.play('tap');
        render();
      }, i === tab ? 'is-selected' : '');
      b.setAttribute('aria-pressed', String(tab === i));
      tabs.append(b);
    });
    p.append(tabs);

    const items = el('div', 'item-grid');
    for (const i of TAB_ITEMS[tab]) {
      const b = button('', () => add(i), 'item-tile');
      b.setAttribute('aria-label', t('items')[i]);
      b.draggable = true;
      b.addEventListener('dragstart', (e) => e.dataTransfer.setData('text/plain', String(i)));

      const picture = el('canvas');
      picture.width = 180;
      picture.height = 170;
      picture.setAttribute('aria-hidden', 'true');
      drawOrnamentIcon(picture.getContext('2d'), i, color, picture.width, picture.height);

      b.append(picture, el('small', '', t('items')[i]));
      items.append(b);
    }
    p.append(items, label(t('newColor')));

    // This palette only sets the colour of the NEXT piece; a chosen piece has its own palette on the scene.
    swatches(p, COLOR_CHOICES, color, (i) => {
      color = COLOR_CHOICES[i];
      Sound.play('tap');
      render();
    }, [t('originalColor'), ...t('colors')]);

    p.append(note(t('tip')));
  }

  /** The palette that floats over the scene while a piece is chosen. */
  function renderPickPalette() {
    const bar = $('#pickPalette');
    const o = state.objects.find((item) => item.id === selected);
    bar.hidden = !(mode === 'editor' && step === 2 && o);
    if (bar.hidden) return;
    bar.replaceChildren(el('span', 'pick-label', t('pickedColor')));
    swatches(bar, COLOR_CHOICES, o.color, (i) => {
      Sound.play('tap');
      change(() => (state.objects.find((item) => item.id === selected).color = COLOR_CHOICES[i]));
    }, [t('originalColor'), ...t('colors')]);
  }

  /* ----- Layers panel: every piece front to back, beside the scene (in the panel on phones) ----- */

  let layersOpen = null; // decided the first time it shows: open when the scene has room
  let layerControlsFor; // the piece the size and move controls were last built for
  let layerDrag = null;

  const layersShown = () => mode === 'editor' && step === 2;
  const layersDocked = () => layersShown() && !stackedQuery.matches;

  function placeLayers() {
    const layers = $('#layers');
    if (stackedQuery.matches) $('.editor').insertBefore(layers, $('.editor-foot'));
    else $('.stage').insertBefore(layers, $('#stickerPop'));
  }
  stackedQuery.addEventListener('change', () => {
    placeLayers();
    renderLayers();
    draw();
  });
  placeLayers();

  function renderLayers() {
    const box = $('#layers');
    box.hidden = !layersShown();
    const docked = layersDocked();
    if (docked && layersOpen === null) layersOpen = $('.stage').clientWidth >= 820;
    const open = !docked || layersOpen;
    document.body.classList.toggle('layers-open', docked && open);
    box.classList.toggle('is-collapsed', !open);
    box.classList.toggle('is-empty', !state.objects.length);
    if (box.hidden) return;

    $('#layersTitle').textContent = `${t('layersTitle')} · ${state.objects.length}/${MAX_OBJECTS}`;
    const toggle = $('#layersToggle');
    toggle.hidden = !docked;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', t(open ? 'layersClose' : 'layersOpen'));
    toggle.title = toggle.getAttribute('aria-label');
    $('#layersBody').hidden = !open;
    if (!open) return;

    $('#layersHint').textContent = t('layersHint');
    const list = $('#layersList');
    list.replaceChildren();
    if (!state.objects.length) {
      list.append(el('li', 'layers-empty', t('layersEmpty')));
    } else {
      const stack = layerStack(state.objects);
      stack.forEach((o, i) => list.append(o ? layerRow(o, i, stack.length) : pagodaRow(i)));
    }
    renderLayerControls();
  }

  /** One piece in the list: a drag handle and its picture; the chosen piece also gets front, back and remove buttons. */
  function layerRow(o, index, count) {
    const chosen = o.id === selected;
    const row = el('li', 'layer-row' + (ornamentBehind(o) ? ' is-behind' : '') + (chosen ? ' is-selected' : ''));
    row.dataset.index = String(index);
    const handle = el('span', 'layer-handle');
    handle.append(icon('grip'));
    handle.title = t('layerDrag');
    handle.setAttribute('aria-hidden', 'true'); // keyboards use the front / back buttons instead
    handle.addEventListener('pointerdown', (e) => startLayerDrag(e, o.id));

    const picture = el('canvas', 'layer-icon');
    picture.width = 80;
    picture.height = 80;
    picture.setAttribute('aria-hidden', 'true');
    drawOrnamentIcon(picture.getContext('2d'), o.type, o.color, 80, 80);
    const pick = button('', () => {
      Sound.play('tap');
      selected = o.id;
      color = o.color;
      render();
    }, 'layer-pick');
    pick.append(picture, el('span', '', t('items')[o.type]));
    pick.setAttribute('aria-pressed', String(chosen));
    row.append(handle, pick);

    if (chosen) {
      const name = t('items')[o.type];
      const up = button('', () => moveLayer(o.id, -1), 'layer-btn');
      up.append(icon('chevron-up'));
      up.disabled = index === 0;
      up.dataset.layer = '-1';
      up.setAttribute('aria-label', `${t('layerUp')}: ${name}`);
      const down = button('', () => moveLayer(o.id, 1), 'layer-btn');
      down.append(icon('chevron-down'));
      down.disabled = index === count - 1;
      down.dataset.layer = '1';
      down.setAttribute('aria-label', `${t('layerDown')}: ${name}`);
      const del = button('', () => remove(o.id), 'layer-btn layer-remove');
      del.append(icon('x'));
      del.setAttribute('aria-label', `${t('remove')} ${name}`);
      row.append(up, down, del);
    }
    return row;
  }

  /** The pagoda's own row: pieces above it are in front, pieces below it stand behind. */
  function pagodaRow(index) {
    const row = el('li', 'layer-row layer-pagoda');
    row.dataset.index = String(index);
    const thumb = pagodaThumb({ shape: state.shape, base: state.base, height: state.height });
    thumb.className = 'layer-icon';
    row.append(el('span', 'layer-handle'), thumb, el('b', '', t('pagodaLayer')));
    return row;
  }

  function moveLayer(id, delta) {
    Sound.play('place');
    selected = id;
    change(() => (state.objects = moveLayerBy(state.objects, id, delta)));
    // Keep keyboard focus on the arrow that was pressed (or the other one at the end of the list).
    const arrows = [...document.querySelectorAll('#layersList .layer-btn[data-layer]')].filter((b) => !b.disabled);
    (arrows.find((b) => b.dataset.layer === String(delta)) || arrows[0])?.focus();
  }

  /* Dragging a row by its handle reorders live; letting go keeps it as one undo step. */
  function startLayerDrag(e, id) {
    e.preventDefault();
    selected = id;
    layerDrag = { id, before: snapshot(), moved: false };
    document.body.classList.add('is-layer-dragging');
    window.addEventListener('pointermove', dragLayer);
    window.addEventListener('pointerup', endLayerDrag);
    window.addEventListener('pointercancel', endLayerDrag);
    updateToolbar();
    draw();
  }

  function dragLayer(e) {
    const row = document.elementFromPoint(e.clientX, e.clientY)?.closest('.layer-row');
    if (!layerDrag || !row || !$('#layersList').contains(row)) return;
    const next = moveLayerTo(state.objects, layerDrag.id, Number(row.dataset.index));
    if (next === state.objects) return;
    state.objects = next;
    layerDrag.moved = true;
    Sound.play('tap');
    renderLayers();
    draw();
  }

  function endLayerDrag() {
    window.removeEventListener('pointermove', dragLayer);
    window.removeEventListener('pointerup', endLayerDrag);
    window.removeEventListener('pointercancel', endLayerDrag);
    document.body.classList.remove('is-layer-dragging');
    const done = layerDrag;
    layerDrag = null;
    if (done?.moved) {
      history.push(done.before);
      future = [];
      persist();
      Sound.play('place');
    }
    render();
  }

  /** Size and nudge buttons for the chosen piece, rebuilt only when the choice changes (so the slider keeps working while dragged). */
  function renderLayerControls() {
    if (layerControlsFor === selected) return;
    layerControlsFor = selected;
    const box = $('#layerControls');
    box.replaceChildren();
    const o = state.objects.find((item) => item.id === selected);
    box.hidden = !o;
    if (!o) return;
    box.append(el('p', 'layer-controls-title', `${t('pickedPiece')} · ${t('items')[o.type]}`));
    range(box, t('size'), o.size, 0.6, 1.5, 0.1, (n) => {
      const piece = state.objects.find((item) => item.id === selected);
      if (piece) piece.size = n;
    });
    box.append(el('p', 'field-label', t('move')));
    const pad = el('div', 'move-pad');
    // One arrow drawn four ways, so all four look the same size in every font.
    [[180, -10, 0], [270, 0, -10], [90, 0, 10], [0, 10, 0]].forEach(([turn, dx, dy], i) => {
      const b = button('', () => move(dx, dy), 'btn-ghost');
      const arrow = icon('arrow-right');
      arrow.style.transform = `rotate(${turn}deg)`;
      b.append(arrow);
      b.setAttribute('aria-label', `${t('move')} ${t('directions')[i]}`);
      pad.append(b);
    });
    box.append(pad);
  }

  /* ----- Step 4 · Blessing, "Did you know?" and a quiz ----- */

  const quizDone = new Set();

  function renderBlessingStep(p) {
    const nameField = el('label', 'field-label', t('name'));
    const nameInput = el('input', 'input');
    Object.assign(nameInput, { type: 'text', maxLength: 20, value: state.name, placeholder: t('namePlaceholder'), id: 'nickname' });
    nameField.append(nameInput);
    p.append(nameField, note(t('nameWarn'), 'name-warn'));

    p.append(label(t('presetTitle')));
    const chips = el('div', 'preset-row');
    t('presets').forEach((text) => {
      const b = button(text, () => {
        Sound.play('tap');
        change(() => (state.wish = text));
      }, 'preset' + (state.wish === text ? ' is-selected' : ''));
      chips.append(b);
    });
    p.append(chips);

    const wishField = el('label', 'field-label', t('wish'));
    const wishInput = el('textarea', 'input');
    Object.assign(wishInput, { maxLength: 180, value: state.wish, placeholder: t('wishPlaceholder'), id: 'wish' });
    wishField.append(wishInput);
    const counter = note(`${state.wish.length}/180`, 'char-count');
    const rude = note(t('notPolite'), 'polite-warn');
    const checkPolite = () => (rude.hidden = Polite.ok(state.name) && Polite.ok(state.wish));
    checkPolite();
    p.append(wishField, counter, rude);

    // Typing counts as one undo step per focus.
    for (const [input, key] of [[nameInput, 'name'], [wishInput, 'wish']]) {
      input.addEventListener('focus', () => (input.dataset.before = snapshot()));
      input.addEventListener('input', () => {
        if (input.dataset.before) {
          history.push(input.dataset.before);
          future = [];
          delete input.dataset.before;
        }
        state[key] = input.value;
        counter.textContent = `${state.wish.length}/180`;
        checkPolite();
        persist();
        draw();
        updateToolbar();
      });
    }

    p.append(didYouKnow(), note(t('localNote'), 'fine-print'));
  }

  /** A short fact about the chosen region with a picture, and one question. */
  function didYouKnow() {
    const card = el('section', 'dyk');
    const place = state.place;
    card.append(placeThumb(place));
    const body = el('div', 'dyk-body');
    body.append(note(t('didYouKnow'), 'dyk-title', 'book'), el('p', '', t('placeKidDescs')[place]));
    const quiz = el('div', 'quiz');
    quiz.append(el('p', 'quiz-q', t('quizQ')[place]));
    const result = el('p', 'quiz-result');
    result.setAttribute('aria-live', 'polite');
    const answers = el('div', 'quiz-options');
    // The first option is the right one; show them in a stable mixed order.
    const order = [0, 1, 2].sort((a, b) => seeded(place * 7 + a, 50) - seeded(place * 7 + b, 50));
    for (const k of order) {
      const b = button(t('quizOptions')[place][k], () => {
        if (k === 0) {
          quizDone.add(place);
          Sound.play('correct');
          result.textContent = t('quizRight');
          b.classList.add('is-right');
          renderGuide('cheer');
        } else {
          Sound.play('wrong');
          result.textContent = t('quizWrong');
          b.classList.add('is-wrong');
          renderGuide('think');
        }
      }, 'quiz-option' + (quizDone.has(place) && k === 0 ? ' is-right' : ''));
      answers.append(b);
    }
    if (quizDone.has(place)) result.textContent = t('quizRight');
    quiz.append(answers, result);
    body.append(quiz);
    card.append(body);
    return card;
  }

  /* ----- Step 5 · Two big choices ----- */

  function renderShareStep(p) {
    const card = el('div', 'blessing-card');
    const seal = el('div', 'blessing-seal');
    seal.append(icon('sparkles'));
    card.append(seal, note(state.wish || t('ready'), 'blessing-text'));
    if (state.name) card.append(note('— ' + state.name + ' —', 'blessing-name'));
    p.append(card);

    const actions = el('div', 'big-actions');
    if (fieldStore.canWrite) actions.append(button(fill(t('offer'), { place: t('places')[state.place] }), offer, 'btn-gold btn-big'));
    actions.append(button(t('download'), () => exportImage(state), 'btn-outline btn-big'));
    p.append(actions);
    if (!fieldStore.canWrite) p.append(note(t('offerReadOnly'), 'tip'));
    p.append(button(t('celebrate'), () => openShare(), 'btn-ghost btn-block'));
    p.append(stickerShelf(), note(t('shareNote'), 'fine-print'));

    // Starting over is kept apart from the main actions, and asks first.
    const danger = el('div', 'restart-zone');
    danger.append(button(t('restart'), askReset, 'btn-ghost'));
    p.append(danger);
  }

  const STEP_RENDERERS = [renderPlaceStep, renderBuildStep, renderDecorateStep, renderBlessingStep, renderShareStep];

  function renderEditor() {
    $('#panelTitle').textContent = t('titles')[step];
    $('#panelDesc').textContent = t('descs')[step];

    const panel = $('#panel');
    panel.replaceChildren();
    STEP_RENDERERS[step](panel);
    panel.append(saveNote());

    $('#back').hidden = step === 0;
    $('#next').hidden = step === LAST_STEP;
    $('#next').textContent = step === 3 ? t('finish') : `${t('next')} · ${t('steps')[step + 1]}`;
  }

  /** The celebration view: your own finished pagoda, or a friend's from a link. */
  function renderShareView() {
    const own = !viewing;
    const s = shown();
    $('#shareChip').textContent = placeLabel(s.place);
    $('#shareTitle').textContent = t('shareDone');
    $('#shareBy').textContent = own
      ? fill(t('ownBy'), { place: placeLabel(s.place) })
      : fill(t('sharedBy'), { name: s.name || t('friend'), place: placeLabel(s.place) });
    $('#shareWish').textContent = s.wish || t('ready');
    $('#shareName').textContent = s.name ? `— ${s.name} —` : '';
    // Social networks are for 13+; children ask a teacher or parent to share instead.
    $('#shareIcons').hidden = true;
    $('#shareKids').textContent = t('shareNote');
    $('#shareMain').textContent = own ? t('download') : t('makeYours');
    $('#shareBack').hidden = !own;
    $('#shareToField').hidden = false;
    $('#shareBack').textContent = t('backToEdit');
    $('#shareReplay').textContent = t('replay');

  }

  /** The page behind the panel shows the picture of the region on screen. */
  function syncPageBackdrop() {
    const place = mode === 'field' ? fieldPlace : mode === 'share' ? shown().place : state.place;
    document.body.style.backgroundImage = backdropThumb(place);
  }

  function render() {
    syncPageBackdrop();
    document.body.classList.toggle('is-intro', mode === 'intro');
    document.body.classList.toggle('is-editor', mode === 'editor');
    document.body.classList.toggle('is-share', mode === 'share');
    document.body.classList.toggle('is-field', mode === 'field');
    document.body.dataset.step = String(step);

    renderStatic();
    renderIntro();
    renderSteps();
    renderEditor();
    renderShareView();
    if (mode === 'field') renderField();
    layerControlsFor = undefined; // rebuild the size and move controls too
    updateToolbar();
    draw();
  }

  function goTo(i) {
    step = clamp(i, 0, LAST_STEP);
    // A selection only means something while decorating.
    if (step !== 2) selected = null;
    render();
    $('#panel').scrollTop = 0;
  }

  /** Notes a visit once per tab: 'open' for the page, 'play' for each child who starts building. */
  function logVisitOnce(kind) {
    const player = Players.current()?.id || 'guest';
    const key = `sandsiam-visit:${kind}:${kind === 'play' ? player : ''}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
    } catch {
      /* Without session storage, note it anyway. */
    }
    fieldStore.logVisit(kind, player);
  }

  function setMode(next) {
    mode = next;
    if (mode === 'editor') logVisitOnce('play');
    if (mode !== 'editor') selected = null;
    if (mode === 'intro') introStart = now();
    render();
    if (mode === 'editor') {
      window.scrollTo({ top: 0 });
      $('#panelTitle').setAttribute('tabindex', '-1');
      $('#panelTitle').focus({ preventScroll: true });
    }
  }

  /* =========================================================
   * Editing actions
   * ======================================================= */

  /** Heights where decorations "stick" to the pagoda: the middle of each tier, or the sand for poles. */
  function snapHeights(o) {
    if (ORNAMENTS[o.type].ground) return [45];
    // A round flower ring can't wrap the square base, so rings only snap to the round parts above it.
    const tiers = pagodaSnapTiers(state).filter((y) => !(isRing(o.type) && state.base === 1 && y > 0));
    return tiers.map((y) => y * state.height);
  }

  function snap(o) {
    const best = snapHeights(o).reduce((a, b) => (Math.abs(b - o.y) < Math.abs(a - o.y) ? b : a));
    if (Math.abs(best - o.y) < 24) o.y = best;
  }

  function add(type, pos) {
    if (state.objects.length >= MAX_OBJECTS) return toast(t('limit'));
    Sound.play('place');
    change(() => {
      selected = Math.max(0, ...state.objects.map((o) => o.id)) + 1;
      const n = state.objects.length;
      state.objects.push({
        id: selected,
        type,
        color,
        x: isRing(type) ? 0 : pos?.x ?? ((n % 5) - 2) * 55,
        y: pos?.y ?? (ORNAMENTS[type].ground ? 50 : isRing(type) ? -12 - (n % 3) * 26 : -30),
        size: 1,
      });
      step = 2;
      tab = TAB_ITEMS.findIndex((list) => list.includes(type));
      if (pos) snap(state.objects[state.objects.length - 1]);
    });
    toast(t('added'));
  }

  function remove(id = selected) {
    if (id === null) return;
    Sound.play('remove');
    change(() => {
      state.objects = state.objects.filter((o) => o.id !== id);
      if (selected === id) selected = null;
    });
  }

  /** Mirrors the chosen decoration left to right (a flag can wave the other way). */
  function flip() {
    const o = state.objects.find((item) => item.id === selected);
    if (!o || isRing(o.type)) return;
    Sound.play('tap');
    change(() => {
      if (o.flip) delete o.flip;
      else o.flip = true;
    }, false);
  }

  function move(dx, dy) {
    const o = state.objects.find((item) => item.id === selected);
    if (!o) return;
    change(() => {
      o.x = isRing(o.type) ? 0 : clamp(o.x + dx, BOUNDS.minX, BOUNDS.maxX);
      o.y = clamp(o.y + dy, BOUNDS.minY, BOUNDS.maxY);
    }, false);
  }

  function undo(redo = false) {
    const from = redo ? future : history;
    const to = redo ? history : future;
    if (!from.length) return;
    to.push(snapshot());
    state = JSON.parse(from.pop());
    selected = null;
    persist();
    render();
  }

  function setZoom(value) {
    zoom = clamp(Math.round(value * 10) / 10, ZOOM.min, ZOOM.max);
    updateToolbar();
    draw();
  }

  function askReset() {
    const dialog = el('dialog', 'card modal');
    dialog.append(
      el('h2', '', t('resetTitle')),
      note(t('resetText'), 'modal-note'),
      button(t('confirm'), () => {
        change(() => {
          state = defaults();
          selected = null;
          step = 0;
          zoom = 1;
        });
        window.history.replaceState(null, '', location.pathname + location.search);
        dialog.close();
      }, 'btn-gold btn-block'),
      button(t('cancel'), () => dialog.close(), 'btn-ghost btn-block')
    );
    dialog.onclose = () => dialog.remove();
    document.body.append(dialog);
    dialog.showModal();
  }

  /** Starts a new, bare pagoda. Earlier work can be brought back with undo. */
  function startNew() {
    const hadWork = hasWork();
    if (hadWork) {
      change(() => {
        state = defaults();
        selected = null;
        zoom = 1;
      }, false);
    }
    step = 0;
    tab = 0;
    setMode('editor');
    if (hadWork) toast(t('freshStart'));
  }

  /** Opens the celebration view and plays the pagoda rising out of the sand. */
  function openShare() {
    viewing = null;
    setMode('share');
    startReveal();
  }

  function startReveal() {
    Sound.play('celebrate');
    revealStart = motionOK() ? now() : null;
    $('#shareView').classList.toggle('is-shown', revealStart === null);
    draw();
  }

  function makeYourOwn() {
    viewing = null;
    window.history.replaceState(null, '', location.pathname + location.search);
    setMode('intro');
  }

  async function share(field = $('#shareLink')) {
    const url = shareUrl(state);
    field.value = url;
    field.hidden = false;
    try {
      await navigator.clipboard.writeText(url);
      toast(t('copied'));
    } catch {
      field.focus();
      field.select();
      toast(t('manualCopy'));
    }
  }

  /** The finished picture of a pagoda in its scene, with the SANDSIAM caption. */
  async function drawPicture(s, w = 1600, h = 1400) {
    await document.fonts.ready;
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    renderScene(out.getContext('2d'), w, h, {
      state: s,
      image: placeImage(s.place),
      exporting: true,
      caption: { title: 'SANDSIAM · ' + t('season') },
    });
    return out;
  }

  /** A smaller JPEG of the pagoda for the field's picture store (under 1 MB); null if it fails. */
  async function pictureBlob(s) {
    try {
      const out = await drawPicture(s, 1200, 1050);
      return await new Promise((resolve) => out.toBlob((b) => resolve(b && b.size < 1048576 ? b : null), 'image/jpeg', 0.85));
    } catch {
      return null;
    }
  }

  async function exportImage(s = state) {
    try {
      const out = await drawPicture(s);
      out.toBlob(async (blob) => {
        if (!blob) return toast(t('exportFail'));
        // Inside the Artifact viewer, files are offered through the downloads capability.
        const downloads = inArtifact ? await window.claude.use('downloads') : null;
        if (downloads) {
          try {
            await downloads.save({ filename: 'sandsiam-songkran.png', data: blob });
            toast(t('exported'));
          } catch (err) {
            toast(err && err.code === 'declined' ? t('downloadDeclined') : t('exportFail'));
          }
          return;
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'sandsiam-songkran.png';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
        toast(t('exported'));
      }, 'image/png');
    } catch {
      toast(t('exportFail'));
    }
  }

  /* =========================================================
   * Canvas
   * ======================================================= */

  const canvas = $('#scene');
  const ctx = canvas.getContext('2d');
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const motionOK = () => !motionQuery.matches;
  const now = () => performance.now() / 1000;
  const pagodaCache = {};
  let view = { x: 0, y: 0, scale: 1 };
  let frameId = 0;
  let introStart = now();
  let introIndex = -1;
  let introPick = 0; // region shown when motion is off
  let revealStart = null;

  // One painted backdrop per region; the scene shows plain sky and sand until it arrives.
  const placeImage = (i) => placeBackdrop(i);

  // Backdrops and decoration pictures arrive one by one; refresh the tiles or the scene as they do.
  const assetArrived = () => {
    if (mode === 'editor' && step === 2) render();
    else draw();
  };
  loadPlacePhotos(assetArrived);
  loadSceneAssets(assetArrived);
  loadOrnamentPictures(assetArrived);

  /** Space the interface covers inside the scene, so the pagoda stays in view. */
  function sceneInsets(rect) {
    const mobile = stackedQuery.matches;
    if (mode === 'field') return mobile ? { top: 70, bottom: 36, left: 8, right: 8 } : { top: 110, bottom: 48, left: 24, right: 24 };
    if (mode === 'intro') {
      const regions = $('.intro-bottom').getBoundingClientRect();
      const bottom = rect.bottom - regions.top + 12;
      if (mobile) {
        const hero = $('.hero').getBoundingClientRect();
        return { top: hero.bottom - rect.top + 4, bottom, left: 16, right: 16 };
      }
      const hero = $('.hero').getBoundingClientRect();
      return { top: hero.bottom - rect.top + 8, bottom, left: 40, right: 40 };
    }
    if (mobile) return { top: 64, bottom: mode === 'share' ? 24 : 132, left: 12, right: 12 };
    // While decorating, keep the pagoda clear of the layers panel docked on the right.
    const right = layersDocked() ? $('#layers').offsetWidth + 32 : 40;
    return { top: 80, bottom: mode === 'share' ? 40 : 96, left: mode === 'editor' ? 150 : 40, right };
  }

  /** Marks the region on show in the intro selector and its caption. */
  function setActiveRegion(index) {
    introIndex = index;
    document.querySelectorAll('.region-btn').forEach((b, i) => {
      b.classList.toggle('is-active', i === index);
      if (i === index) b.setAttribute('aria-current', 'true');
      else b.removeAttribute('aria-current');
    });
    $('#regionCaption').textContent = `${t('placeAreas')[index]} · ${t('placeDescs')[index]}`;
  }

  /** Jumps the intro to a region (and keeps cycling from there). */
  function showRegion(i) {
    introPick = i;
    introStart = now() - i * INTRO_SLIDE;
    introIndex = -1;
    draw();
  }

  /** Intro slideshow: which region is showing, and how far into its crossfade. */
  function introSlide(time) {
    if (!motionOK()) {
      if (introIndex !== introPick) setActiveRegion(introPick);
      return { image: placeImage(introPick), fxPlace: introPick, index: introPick };
    }
    const phase = Math.max(0, time - introStart) / INTRO_SLIDE;
    const index = Math.floor(phase) % PLACES.length;
    const local = phase - Math.floor(phase);
    if (index !== introIndex) setActiveRegion(index);
    const active = document.querySelector('.region-btn.is-active');
    if (active) active.style.setProperty('--progress', local.toFixed(3));
    return {
      index,
      fxPlace: index,
      image: placeImage(index),
      nextImage: placeImage((index + 1) % PLACES.length),
      mix: clamp((local - 0.8) / 0.2, 0, 1),
      bgZoom: 1.02 + 0.06 * local,
      nextZoom: 1.02,
    };
  }

  /**
   * Lines the page picture behind the panel up with the one on the canvas, so the backdrop
   * runs on unbroken past the scene's edge. Returns the width the canvas picture must cover
   * (0 when there is no page beside it: the intro, and phones where the panel sits below).
   */
  let pageFit = '';
  function fitPageBackdrop(rect, image) {
    const beside = mode !== 'intro' && getComputedStyle(canvas.parentElement).position === 'fixed';
    const reach = beside ? window.innerWidth - rect.left : 0;
    let fit = '';
    if (image && beside) {
      const { s, ox, oy } = backdropFit(rect.width, rect.height, image.width, image.height, 1, reach);
      const size = `${(image.width * s).toFixed(1)}px ${(image.height * s).toFixed(1)}px`;
      fit = `${size}|${(rect.left + ox).toFixed(1)}px ${(rect.top + oy).toFixed(1)}px`;
    }
    if (fit !== pageFit) {
      pageFit = fit;
      const [size = '', position = ''] = fit.split('|');
      document.body.style.backgroundSize = size;
      document.body.style.backgroundPosition = position;
    }
    return reach;
  }

  function renderFrame(time) {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const reach = fitPageBackdrop(rect, placeImage(mode === 'field' ? fieldPlace : shown().place));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const wpx = Math.round(rect.width * dpr);
    const hpx = Math.round(rect.height * dpr);
    if (canvas.width !== wpx || canvas.height !== hpx) {
      canvas.width = wpx;
      canvas.height = hpx;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (mode === 'field') {
      fieldHits = renderFieldScene(ctx, rect.width, rect.height, {
        entries: fieldShown(),
        image: placeImage(fieldPlace),
        fxPlace: fieldPlace,
        insets: sceneInsets(rect),
        time,
        animate: motionOK(),
        selectedId: fieldSelected,
        dpr,
        cache: fieldCache,
        labels: { example: t('example') },
        reach,
      });
      return;
    }

    let s = shown();
    let bg = { image: placeImage(s.place) };
    if (mode === 'intro') {
      // The intro always shows a bare pagoda waiting to be decorated.
      bg = introSlide(time);
      s = { ...defaults(), place: bg.index };
    }

    let reveal;
    if (mode === 'share' && revealStart !== null) {
      reveal = (time - revealStart) / REVEAL_TIME;
      if (reveal >= 1) {
        reveal = undefined;
        revealStart = null;
        $('#shareView').classList.add('is-shown');
      }
    }

    view = renderScene(ctx, rect.width, rect.height, {
      state: s,
      ...bg,
      zoom: mode === 'editor' ? zoom : 1,
      selected: mode === 'editor' ? selected : null,
      insets: sceneInsets(rect),
      time,
      animate: motionOK(),
      reveal,
      cache: pagodaCache,
      guides: drag ? snapHeights(state.objects.find((o) => o.id === drag.id) || { type: 0 }) : null,
      reach,
    });
  }

  /** Asks for a frame; while motion is allowed the scene keeps animating on its own. */
  function draw() {
    if (frameId) return;
    frameId = requestAnimationFrame(function frame() {
      frameId = 0;
      renderFrame(now());
      if ((motionOK() && !document.hidden) || revealStart !== null) draw();
    });
  }

  new ResizeObserver(draw).observe(canvas);
  window.addEventListener('resize', draw);
  document.addEventListener('visibilitychange', draw);
  motionQuery.addEventListener('change', draw);

  /** Converts a pointer event into logical artwork coordinates. */
  function toArt(e) {
    const r = canvas.getBoundingClientRect();
    return {
      x: clamp((e.clientX - r.left - view.x) / view.scale, BOUNDS.minX, BOUNDS.maxX),
      y: clamp((e.clientY - r.top - view.y) / view.scale, BOUNDS.minY, BOUNDS.maxY),
    };
  }

  function hitTest(p) {
    // Front-most first, matching what the child sees.
    return paintOrder(state.objects).reverse().find((o) => {
      const b = ornamentBounds(o);
      return p.x >= o.x + b.x && p.x <= o.x + b.x + b.w && p.y >= o.y + b.y && p.y <= o.y + b.y + b.h;
    });
  }

  let drag = null;

  canvas.addEventListener('pointerdown', (e) => {
    if (mode === 'intro') {
      if (IntroFx.tap(e.clientX, e.clientY)) setTimeout(() => Sound.play('pop'), 420);
      return;
    }
    if (mode === 'field') {
      const r = canvas.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      const hit = fieldHits.find((h) => x >= h.x0 && x <= h.x1 && y >= h.y0 && y <= h.y1);
      fieldSelected = hit ? hit.id : null;
      renderField();
      draw();
      return;
    }
    if (mode !== 'editor' || step === LAST_STEP) return;
    const p = toArt(e);
    const o = hitTest(p);
    if (o) {
      selected = o.id;
      color = o.color;
      drag = { id: o.id, dx: p.x - o.x, dy: p.y - o.y, before: snapshot(), moved: false };
      canvas.setPointerCapture(e.pointerId);
      canvas.focus();
    } else {
      selected = null;
      render();
    }
    updateToolbar();
    draw();
  });

  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const p = toArt(e);
    const o = state.objects.find((item) => item.id === drag.id);
    o.x = isRing(o.type) ? 0 : clamp(p.x - drag.dx, BOUNDS.minX, BOUNDS.maxX);
    o.y = clamp(p.y - drag.dy, BOUNDS.minY, BOUNDS.maxY);
    drag.moved = true;
    draw();
  });

  function endDrag(cancel = false) {
    if (!drag) return;
    if (cancel) {
      state = JSON.parse(drag.before);
    } else if (drag.moved) {
      const o = state.objects.find((item) => item.id === drag.id);
      if (o) snap(o);
      Sound.play('place');
      history.push(drag.before);
      future = [];
      persist();
    }
    drag = null;
    render();
    canvas.focus();
  }

  canvas.addEventListener('pointerup', () => endDrag());
  canvas.addEventListener('pointercancel', () => endDrag(true));

  // Drag a tile from the card onto the scene.
  canvas.addEventListener('dragover', (e) => e.preventDefault());
  canvas.addEventListener('drop', (e) => {
    e.preventDefault();
    const value = e.dataTransfer.getData('text/plain');
    if (/^\d{1,2}$/.test(value) && Number(value) < ITEM_COUNT) add(Number(value), toArt(e));
  });

  canvas.addEventListener('keydown', (e) => {
    const delta = { ArrowLeft: [-5, 0], ArrowRight: [5, 0], ArrowUp: [0, -5], ArrowDown: [0, 5] }[e.key];
    if (delta) {
      e.preventDefault();
      const k = e.shiftKey ? 3 : 1;
      move(delta[0] * k, delta[1] * k);
    }
    if (['Delete', 'Backspace'].includes(e.key) && selected !== null) {
      e.preventDefault();
      remove();
    }
  });

  /* =========================================================
   * Wiring
   * ======================================================= */

  // Building always starts by asking who is playing (once per tab), then shows how to play once.
  // A player with a pagoda in progress carries on; otherwise a bare pagoda starts.
  const enterEditor = () =>
    requirePlayer(() => {
      if (hasWork()) setMode('editor');
      else startNew();
      showHowToOnce();
    });
  $('#start').onclick = () => {
    Sound.play('tap');
    enterEditor();
  };
  $('#resume').onclick = () => enterEditor();
  $('#openField').onclick = () => {
    Sound.play('tap');
    openField(introIndex >= 0 ? introIndex : 0);
  };
  $('#fieldBuild').onclick = () => enterEditor();
  $('#fieldHome').onclick = () => setMode('intro');
  $('#shareToField').onclick = () => {
    const place = shown().place;
    const own = !viewing;
    if (viewing) {
      viewing = null;
      window.history.replaceState(null, '', location.pathname + location.search);
    }
    // After building, go to the field your own pagoda stands in.
    openField(place, own ? 'mine' : null);
  };
  $('#shareMain').onclick = () => (viewing ? makeYourOwn() : exportImage(state));
  $('#shareBack').onclick = () => {
    setMode('editor');
    goTo(LAST_STEP);
  };
  $('#shareReplay').onclick = startReveal;
  $('#shareCopy').onclick = () => share($('#shareField'));
  $('#home').onclick = () => (viewing ? makeYourOwn() : setMode('intro'));
  document.querySelectorAll('.wordmark').forEach((link) => {
    link.onclick = (e) => {
      e.preventDefault();
      $('#home').onclick();
    };
  });

  $('#back').onclick = () => {
    Sound.play('tap');
    goTo(step - 1);
  };
  $('#next').onclick = () => {
    Sound.play('tap');
    finishStep(step);
    goTo(step + 1);
  };

  $('#undo').onclick = () => undo();
  $('#redo').onclick = () => undo(true);
  $('#delete').onclick = () => remove();
  $('#flip').onclick = () => flip();
  $('#zoomIn').onclick = () => setZoom(zoom + ZOOM.step);
  $('#zoomOut').onclick = () => setZoom(zoom - ZOOM.step);
  $('#zoomReset').onclick = () => setZoom(1);

  $('#language').onchange = (e) => {
    lang = e.target.value;
    try {
      localStorage.setItem(LANG_KEY, lang);
    } catch {
      /* Language simply won't be remembered. */
    }
    render();
  };

  const helpDialog = $('#helpDialog');
  const HOWTO_KEY = () => 'sandsiam-howto:' + (Players.current()?.id || 'guest');
  /** Shows "How to play" once per player, the first time they start. */
  function showHowToOnce() {
    try {
      if (localStorage.getItem(HOWTO_KEY())) return;
      localStorage.setItem(HOWTO_KEY(), '1');
    } catch {
      return;
    }
    helpDialog.showModal();
  }
  $('#help').onclick = () => helpDialog.showModal();
  $('.modal-close').onclick = () => helpDialog.close();
  $('.close-help').onclick = () => {
    helpDialog.close();
    Sound.play('tap');
    if (mode === 'intro') requirePlayer(() => setMode('editor'));
  };
  $('#teacherCopy').onclick = () => share($('#teacherLink'));


  $('#sound').onclick = () => {
    Sound.toggle();
    Sound.play('tap');
    renderStatic();
  };
  $('#music').onclick = () => {
    Music.toggle();
    Sound.play('tap');
    renderStatic();
  };
  // The tune starts on the first tap anywhere: the music button follows when it does.
  window.addEventListener('musicchange', renderStatic);
  $('#player').onclick = () => openPlayers(() => render());
  $('#newPlayerForm').addEventListener('submit', (e) => {
    e.preventDefault();
    addPlayer();
  });
  $('#playerDialog').addEventListener('close', () => (afterPlayerChosen = null));
  // Tapping the guide while it is still out makes it say the tip again.
  $('#guide').onclick = () => sayTip(guidePose);
  $('#layersToggle').onclick = () => {
    layersOpen = !layersOpen;
    Sound.play('tap');
    renderLayers();
    draw();
  };

  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea, select')) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      undo(e.shiftKey);
    }
  });

  render();
  refreshCounts();
  logVisitOnce('open');
  if (mode === 'share') startReveal();
  if (shareError) toast(t('invalid'));
})();
