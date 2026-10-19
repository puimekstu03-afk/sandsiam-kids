'use strict';

/**
 * SANDSIAM · Painted cartoon backdrops for the five regions (assets/places/bg-*.jpg).
 *
 * Each picture covers the scene, pushes in slowly on the intro and is used as-is for the
 * thumbnails in the panel. Alongside each picture we keep what the scene needs to stand
 * pagodas convincingly in it: where the open sand is, where eye level lies (for
 * perspective) and how the light falls. All positions are fractions of the picture.
 * Needs core.js.
 *
 *   0 North   · Chiang Mai — Lanna wihan, golden chedi, tung banners, blue mountains
 *   1 Central · Bangkok    — ubosot, a porcelain prang, frangipani trees
 *   2 Isan    · Buriram    — Phanom Rung on its hill above the rice fields, sugar palms
 *   3 East    · the beach in bright sun, islands on the sea
 *   4 South   · a white chedi by the sea at sunset
 */

const PLACE_PHOTOS = ['north', 'central', 'isan', 'east', 'south'];

/**
 * The open sand in each picture, clear of walls, trees and water.
 *   horizon — eye level; things shrink to nothing there, so size ∝ (y − horizon)
 *   far, near — [y, x0, x1]: the back and front edge of the open sand and how wide it is there
 */
const GROUND = [
  { horizon: 0.47, far: [0.6, 0.1, 0.9], near: [0.88, 0.2, 0.82] },
  { horizon: 0.48, far: [0.61, 0.1, 0.9], near: [0.88, 0.18, 0.82] },
  { horizon: 0.47, far: [0.6, 0.08, 0.92], near: [0.88, 0.2, 0.8] },
  { horizon: 0.31, far: [0.53, 0.12, 0.88], near: [0.88, 0.18, 0.82] },
  { horizon: 0.37, far: [0.6, 0.12, 0.88], near: [0.88, 0.18, 0.82] },
];

/**
 * How the light in each picture falls on a pagoda standing in it.
 *   sun    — where the light comes from across the picture: −1 left … 1 right, 0 behind
 *   tint   — the colour of that light, mixed over the sand by `amount`
 */
const PLACE_LIGHT = [
  { sun: -0.3, tint: '#fff1d6', amount: 0.05 },
  { sun: -0.3, tint: '#fff4dc', amount: 0.04 },
  { sun: -0.3, tint: '#fff0d0', amount: 0.04 },
  { sun: 0.6, tint: '#fff6e0', amount: 0.04 },
  { sun: 0.4, tint: '#ff9a6a', amount: 0.16 },
];

/** Lamp rows to flicker, as [x0, y0, x1, y1] (none in the current pictures). */
const LAMP_ROWS = [];
const LAMPS_PER_ROW = 16;

/** What to bring to life in each picture (see effects.js): the sea glinting in the sun. */
const PLACE_FX = [{}, {}, {}, { sea: [0.12, 0.32, 0.88, 0.42] }, { sea: [0.5, 0.38, 0.95, 0.5] }];

const placePhotos = [];

/** Starts loading every region picture; calls onLoad as each one arrives. */
function loadPlacePhotos(onLoad) {
  PLACE_PHOTOS.forEach((name, i) => {
    if (placePhotos[i]) return;
    const img = new Image();
    img.onload = onLoad;
    img.src = `assets/places/bg-${name}.jpg`;
    placePhotos[i] = img;
  });
}

/** The picture for a place once it has loaded, otherwise null. */
function placeBackdrop(place) {
  const img = placePhotos[place];
  return img && img.complete && img.naturalWidth > 0 ? img : null;
}

/** Resolves the picture for a place once it has loaded (null if it can't), for pictures made to keep. */
function placeBackdropReady(place) {
  const img = placePhotos[place];
  if (!img || img.complete) return Promise.resolve(placeBackdrop(place));
  return new Promise((resolve) => {
    img.addEventListener('load', () => resolve(placeBackdrop(place)), { once: true });
    img.addEventListener('error', () => resolve(null), { once: true });
  });
}

/** CSS background for the small pictures in the panel. */
const backdropThumb = (place) => `url("assets/places/bg-${PLACE_PHOTOS[place] || PLACE_PHOTOS[0]}.jpg")`;

/**
 * Where a picture goes to cover a w × h area, centred. zoom > 1 pushes in.
 * reach: a width from the area's left edge the picture must also cover (the page runs on
 * behind the panel), so the canvas and the page share one unbroken picture.
 */
function backdropFit(w, h, iw, ih, zoom = 1, reach = 0) {
  const s = Math.max(w / iw, h / ih, reach / iw) * zoom;
  const cx = (w - iw * s) / 2;
  const ox = reach ? Math.min(0, Math.max(reach - iw * s, cx)) : cx;
  return { s, ox, oy: (h - ih * s) / 2 };
}

/**
 * Covers the canvas with a backdrop. zoom > 1 gives a slow "Ken Burns" push-in.
 * Returns how picture coordinates map to the screen, for anything tied to the picture.
 */
function drawBackground(c, w, h, image, zoom = 1, alpha = 1, reach = 0) {
  if (!image) {
    // Plain sky and sand while the picture is still on its way.
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#c9d9e4');
    g.addColorStop(0.42, '#efe6d6');
    g.addColorStop(0.46, '#dcc49d');
    g.addColorStop(1, '#c9a874');
    c.fillStyle = g;
    c.fillRect(0, 0, w, h);
    return { s: 1, ox: 0, oy: 0, iw: w, ih: h };
  }
  const { s, ox, oy } = backdropFit(w, h, image.width, image.height, zoom, reach);
  c.save();
  c.globalAlpha = alpha;
  c.drawImage(image, ox, oy, image.width * s, image.height * s);
  c.restore();
  return { s, ox, oy, iw: image.width, ih: image.height };
}

/** A point given as fractions of the picture, on screen. */
const photoPoint = (map, fx, fy) => [map.ox + fx * map.iw * map.s, map.oy + fy * map.ih * map.s];
