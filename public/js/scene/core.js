'use strict';

/**
 * SANDSIAM · Scene core: shared constants, the animation clock and drawing primitives.
 *
 * The pagoda and decorations share one logical coordinate system
 * (origin at the pagoda's foot, roughly −335…+100 vertically), so pointer,
 * keyboard and PNG export all agree. Nothing in js/scene touches the DOM.
 */

/** Decoration colors (also the allowed values inside shared links). */
const PALETTE = ['#df6380', '#efbc35', '#218b87', '#9970ad', '#eb894a', '#fff1ce'];

/** "Its own colours": a decoration keeps the colours of its cartoon picture. */
const ORIGINAL = 'original';

/** The colours a child can pick for a decoration: its own colours first, then the palette. */
const COLOR_CHOICES = [ORIGINAL, ...PALETTE];

/** Sand tones for the pagoda body. */
const SAND_COLORS = ['#d8b77c', '#cda46b', '#edcc93'];

/** Movement limits for decorations, in logical units. */
const BOUNDS = { minX: -245, maxX: 245, minY: -290, maxY: 100 };

/** Logical size of the artwork, used to fit it into the visible area. */
const ART = { width: 560, top: -335, bottom: 100 };

const SELECTION_COLOR = '#ff4f9a';

/** Cartoon outline colour, shared with the interface (--ink in tokens.css). */
const INK = '#3d2c52';

/* ---------- Animation helpers ---------- */

/**
 * Current time in seconds, whether motion is on, and which region's photo the pagoda
 * stands in (its light colours the sand); renderScene and renderFieldScene set it each frame.
 */
const sceneClock = { t: 0, animate: false, place: 0 };

/** The light of the photo on show (see PLACE_LIGHT in backgrounds.js). */
const sceneLight = () => PLACE_LIGHT[sceneClock.place] || PLACE_LIGHT[0];

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const easeOut = (k) => 1 - Math.pow(1 - k, 3);
const easeBack = (k) => 1 + 2.70158 * Math.pow(k - 1, 3) + 1.70158 * Math.pow(k - 1, 2);

/** Stable pseudo-random number in [0, 1) for particle i and channel k. */
function seeded(i, k) {
  const v = Math.sin(i * 12.9898 + k * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

/* ---------- Primitives ---------- */

function ellipse(c, x, y, rx, ry, fill) {
  c.beginPath();
  c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  c.fillStyle = fill;
  c.fill();
}

function polygon(c, points, fill, stroke) {
  c.beginPath();
  points.forEach((p, i) => (i ? c.lineTo(...p) : c.moveTo(...p)));
  c.closePath();
  if (fill) {
    c.fillStyle = fill;
    c.fill();
  }
  if (stroke) {
    c.strokeStyle = stroke;
    c.stroke();
  }
}

function flower(c, x, y, r, color) {
  for (let i = 0; i < 9; i++) {
    const a = (i * Math.PI * 2) / 9;
    ellipse(c, x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.42, r * 0.42, color);
  }
  ellipse(c, x, y, r * 0.35, r * 0.35, '#c58b27');
}

/** Blends a hex colour towards another hex colour. */
function mix(hex, target, amount) {
  const a = parseInt(hex.slice(1), 16);
  const b = parseInt(target.slice(1), 16);
  const ch = (shift) => Math.round(((a >> shift) & 255) * (1 - amount) + ((b >> shift) & 255) * amount);
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
}

/** A soft round light; `color` holds an "A" where the alpha goes, e.g. 'rgba(255, 176, 72, A)'. */
function glow(c, x, y, r, color, alpha) {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color.replace('A', alpha.toFixed(3)));
  g.addColorStop(1, color.replace('A', '0'));
  c.fillStyle = g;
  c.fillRect(x - r, y - r, r * 2, r * 2);
}
