'use strict';

/**
 * SANDSIAM · Decoration pictures: loading them, measuring where each is held,
 * and recolouring them in the colour the child picked. Needs core.js, assets.js and catalog.js.
 */

const ornamentPictures = []; // by type number
const ringPictures = {}; // flower heads for the rings, by flower

/** Loads every decoration picture; calls onLoad as each one arrives. */
function loadOrnamentPictures(onLoad) {
  const load = (file, then) => {
    const img = new Image();
    img.onload = () => {
      then(img);
      onLoad();
    };
    img.src = `assets/ornaments/${file}.webp`;
    return img;
  };
  ORNAMENTS.forEach((def, type) => {
    if (def.ring) {
      def.ring.forEach((flower) => (ringPictures[flower] ??= load(`ring-${flower}`, () => {})));
      return;
    }
    ornamentPictures[type] = load(def.key, (img) => measure(def, img));
  });
  ringPictures.jasmine ??= load('ring-jasmine', () => {}); // ivory marigold rings
}

/** The pixels of a picture, or null where the browser won't share them (file://). */
function picturePixels(img) {
  try {
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    return ctx.getImageData(0, 0, c.width, c.height);
  } catch {
    return null;
  }
}

/** Fills in a decoration's size, the point it is held by, and its main colour. */
function measure(def, img) {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  def.size = [(def.h * w) / h, def.h];
  const data = picturePixels(img);
  if (!data) return;
  const px = data.data;
  const solid = (x, y) => px[(y * w + x) * 4 + 3] > 128;

  // Held by the foot of its pole, its base, or its hook: find that edge of the picture.
  if (def.hold) {
    const fromBottom = def.hold !== 'hook';
    for (let i = 0; i < h; i++) {
      const y = fromBottom ? h - 1 - i : i;
      let sum = 0;
      let n = 0;
      for (let x = 0; x < w; x++) {
        if (solid(x, y)) {
          sum += x;
          n++;
        }
      }
      if (n) {
        // A pole's foot is where the pole is; a base or hook is centred.
        def.anchor = [def.hold === 'pole' || def.hold === 'hook' ? sum / n / w : 0.5, (y + (fromBottom ? 1 : 0)) / h];
        break;
      }
    }
  }

  // The main colour: the most common strong hue, leaving out leaf greens.
  if (def.hue === undefined && !def.fixed) {
    const bins = new Array(36).fill(0);
    for (let i = 0; i < px.length; i += 16) {
      if (px[i + 3] < 200) continue;
      const [hue, s, l] = rgbToHsl(px[i], px[i + 1], px[i + 2]);
      if (s < 0.35 || l < 0.2 || l > 0.88 || (hue > 75 && hue < 165)) continue;
      bins[Math.floor(hue / 10) % 36] += s;
    }
    def.hue = bins.indexOf(Math.max(...bins)) * 10 + 5;
  }
}

/* ---------- Recolouring ---------- */

function hslToRgb(h, s, l) {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

const hueGap = (a, b) => ((a - b + 540) % 360) - 180;

const ramp = (v, from, to) => Math.max(0, Math.min(1, (v - from) / (to - from)));

/**
 * How much (0…1) a pixel belongs to the part a `tint` colours: 'white' petals, 'cream' wax,
 * or 'grey' silver and an elephant's skin. Measured by how colourful the pixel is (chroma),
 * since very light colours can look strongly saturated in HSL; soft edges, so a petal that
 * fades from white into yellow takes the colour without a seam.
 */
function paleFor(tint, r, g, b, l) {
  const chroma = (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
  if (tint === 'white') return ramp(chroma, 0.3, 0.16) * ramp(l, 0.5, 0.62);
  if (tint === 'cream') return ramp(chroma, 0.44, 0.32) * ramp(l, 0.52, 0.64);
  if (tint === 'grey') return ramp(chroma, 0.16, 0.1) * ramp(l, 0.25, 0.33) * ramp(l, 0.95, 0.88);
  return 0;
}

/**
 * The picture in the chosen colour. Its main colour (def.hue) turns into `color`, and where
 * the picture's colour is white or grey (def.tint), those parts take on `color` too, keeping
 * their light and shade. Leaves, gold and outlines stay.
 */
function recolourPicture(img, def, color) {
  const [th, ts, tl] = hexToHsl(color);
  const ivory = tl > 0.85;
  const mainHue = typeof def.hue === 'number' ? def.hue : null;
  const shift = mainHue === null ? 0 : hueGap(th, mainHue);
  const shifting = mainHue !== null && (ivory || Math.abs(shift) > 10);
  if (!shifting && !def.tint) return img;
  const data = picturePixels(img);
  if (!data) return img;
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 8) continue;
    const [h, s, l] = rgbToHsl(px[i], px[i + 1], px[i + 2]);
    let rgb = null;
    let amount = 1;
    if (shifting && s >= 0.25 && Math.abs(hueGap(h, mainHue)) <= 30) {
      rgb = ivory ? hslToRgb(45, s * 0.3, 0.62 + l * 0.36) : hslToRgb((h + shift + 360) % 360, Math.min(1, s * (0.7 + ts * 0.4)), l);
    } else if (def.tint && (amount = paleFor(def.tint, px[i], px[i + 1], px[i + 2], l)) > 0) {
      // Halfway between its own lightness and the colour's, so petals stay soft and shaded.
      rgb = ivory ? hslToRgb(45, 0.35, 0.55 + l * 0.42) : hslToRgb(th, ts * (def.tint === 'grey' ? 0.7 : 0.8), l * 0.5 + tl * 0.5);
    }
    if (!rgb) continue;
    px[i] += (rgb[0] - px[i]) * amount;
    px[i + 1] += (rgb[1] - px[i + 1]) * amount;
    px[i + 2] += (rgb[2] - px[i + 2]) * amount;
  }
  const out = document.createElement('canvas');
  out.width = img.naturalWidth;
  out.height = img.naturalHeight;
  out.getContext('2d').putImageData(data, 0, 0);
  return out;
}

const pictureCache = new Map();

/** A decoration's picture in the chosen colour, or null until it has loaded. */
function ornamentImage(type, color) {
  const img = ornamentPictures[type];
  if (!ready(img)) return null;
  const def = ORNAMENTS[type];
  if (color === ORIGINAL || def.fixed) return img;
  const key = `${type}|${color}`;
  if (!pictureCache.has(key)) pictureCache.set(key, recolourPicture(img, def, color));
  return pictureCache.get(key);
}

/**
 * The flower heads a ring is strung from, in the chosen colour, or null until they have loaded.
 * The marigold ring turns into jasmine for ivory.
 */
function ringFlowerImages(type, color) {
  const def = ORNAMENTS[type];
  const flowers = type === RING && color !== ORIGINAL && hexToHsl(color)[2] > 0.85 ? ['jasmine'] : def.ring;
  const imgs = flowers.map((flower) => ringPictures[flower]);
  if (!imgs.every(ready)) return null;
  if (color === ORIGINAL || def.fixed || flowers !== def.ring) return imgs;
  const look = { hue: type === RING ? 32 : def.hue, tint: def.tint };
  return imgs.map((img, i) => {
    const key = `ring|${type}|${flowers[i]}|${color}`;
    if (!pictureCache.has(key)) pictureCache.set(key, recolourPicture(img, look, color));
    return pictureCache.get(key);
  });
}

/** How many pictures have arrived, so cached drawings know when to refresh. */
const ornamentPicturesLoaded = () => ornamentPictures.filter(ready).length;
