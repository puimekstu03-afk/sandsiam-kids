'use strict';

/**
 * SANDSIAM · Scene assets: the sand photo pressed into the pagoda, and colour helpers.
 * Decorations are drawn as cartoons in js/scene/ornaments/, so no pictures load for them.
 * Needs core.js.
 */

const sceneAssets = { sand: null };

/** Loads the sand texture; calls onLoad when it arrives. */
function loadSceneAssets(onLoad) {
  const img = new Image();
  img.onload = onLoad;
  img.src = 'assets/textures/sand-texture.jpg';
  sceneAssets.sand = img;
}

const ready = (img) => img && img.complete && img.naturalWidth > 0;

/* ---------- Colour conversion ---------- */

function hexToHsl(hex) {
  const n = parseInt(hex.slice(1), 16);
  return rgbToHsl((n >> 16) & 255, (n >> 8) & 255, n & 255);
}

function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

const sandPatterns = new WeakMap();

/** Repeating sand photo for the pagoda, one per canvas context. */
function sandPattern(c) {
  if (!ready(sceneAssets.sand)) return null;
  if (!sandPatterns.has(c)) {
    const pattern = c.createPattern(sceneAssets.sand, 'repeat');
    pattern.setTransform(new DOMMatrix().scale(0.32));
    sandPatterns.set(c, pattern);
  }
  return sandPatterns.get(c);
}
