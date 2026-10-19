'use strict';

/**
 * SANDSIAM · The decoration catalogue.
 *
 * Every decoration is a picture in assets/ornaments/<key>.webp: most are cartoons made in
 * Canva and cut out with tools/cut-stickers.py (sheets kept in stickers-src/); the single
 * flower heads are drawn in tools/flowers/flowers.html and saved by tools/flowers/render.py.
 *
 * A type's number is its place in ORNAMENTS. Saved pagodas and shared links store
 * these numbers, so new decorations are only ever added at the end.
 *   h      — drawn height in logical units (the width follows the picture)
 *   hold   — where the picture is held: 'pole' (foot of the pole), 'ground' (its base),
 *            'hook' (the hook it hangs from); otherwise its middle
 *   pole   — stands on a pole; planted high up, it goes behind the pagoda by itself
 *   ground — sticks to the sand rather than to a tier
 *   sway   — how far it rocks in the breeze (radians), around where it is held
 *   hue    — its main colour, recoloured when the child picks a colour (found by itself if left
 *            out; null when only its white or grey part takes the colour)
 *   tint   — its white ('white': petals), cream ('cream': wax) or grey ('grey': silver, skin) part takes on the
 *            picked colour too, keeping its light and shade
 *   fixed  — keeps its own colours (the Thai flag, the rainbow ring); no palette is offered
 *   glow   — a soft light that flickers: [x, y] as fractions of the picture
 *   ring   — a flower ring round a tier, strung from these flower heads in turn
 *            (assets/ornaments/ring-<flower>.webp); it has no picture of its own
 *   flap   — beats its wings
 * size and anchor are filled in from the picture once it has loaded (pictures.js).
 * Needs core.js.
 */

const ORNAMENTS = [
  { key: 'tung', h: 235, hold: 'pole', pole: true, ground: true, sway: 0.04 }, // 0
  { key: 'flag', h: 205, hold: 'pole', pole: true, ground: true, sway: 0.05 }, // 1
  { key: 'streamers', h: 215, hold: 'pole', pole: true, ground: true, sway: 0.07 }, // 2
  { key: 'marigold', h: 72, hue: 32 }, // 3
  { key: 'lotus', h: 58, hue: 335 }, // 4
  { key: 'garland', h: 105, hue: 350, tint: 'white' }, // 5
  { key: 'prajamyam', h: 72 }, // 6
  { key: 'floral', h: 70 }, // 7
  { key: 'diamond', h: 76 }, // 8
  { key: 'ring', h: 26, ring: ['marigold'] }, // 9 marigold ring (ivory makes it jasmine)
  { key: 'incense', h: 72, hold: 'ground', ground: true }, // 10
  { key: 'rose', h: 62, hue: 355 }, // 11
  { key: 'jasmine', h: 64, hue: null, tint: 'white' }, // 12
  { key: 'sunflower', h: 72, hue: 48 }, // 13
  { key: 'hibiscus', h: 66, hue: 0 }, // 14
  { key: 'plumeria', h: 62, hue: 48, tint: 'white' }, // 15
  { key: 'orchid', h: 60, hue: 290 }, // 16
  { key: 'ixora', h: 64, hue: 15 }, // 17 (was a bouquet)
  { key: 'cosmos', h: 64, hue: 335 }, // 18 (was a flower pot)
  { key: 'chat', h: 200, hold: 'pole', pole: true, ground: true, sway: 0.03 }, // 19
  { key: 'candle', h: 66, hold: 'ground', ground: true, hue: null, tint: 'cream', glow: [0.5, 0.08] }, // 20
  { key: 'thaiFlag', h: 190, hold: 'pole', pole: true, ground: true, sway: 0.05, fixed: true }, // 21
  { key: 'lantern', h: 84, hold: 'hook', sway: 0.06, glow: [0.5, 0.5] }, // 22
  { key: 'waterBowl', h: 60, hue: null, tint: 'grey' }, // 23
  { key: 'fishMobile', h: 84, hold: 'hook', sway: 0.08 }, // 24
  { key: 'elephant', h: 66, hue: null, tint: 'grey' }, // 25
  { key: 'star', h: 42 }, // 26
  { key: 'heart', h: 38 }, // 27
  { key: 'butterfly', h: 42, flap: true }, // 28
  { key: 'bird', h: 46 }, // 29
  { key: 'shell', h: 42 }, // 30
  { key: 'globeAmaranth', h: 56, hue: 330 }, // 31
  { key: 'ringJasmine', h: 26, ring: ['jasmine'], hue: null, tint: 'white' }, // 32
  { key: 'ringRose', h: 26, ring: ['rose'], hue: 355 }, // 33
  { key: 'ringAmaranth', h: 26, ring: ['globeAmaranth'], hue: 330 }, // 34
  { key: 'ringIxora', h: 26, ring: ['ixora'], hue: 15 }, // 35
  { key: 'ringThai', h: 26, ring: ['marigold', 'jasmine'], hue: 32, tint: 'white' }, // 36 marigold and jasmine by turns
  { key: 'ringRainbow', h: 26, ring: ['marigold', 'rose', 'jasmine', 'ixora', 'cosmos', 'globeAmaranth', 'plumeria'], fixed: true }, // 37
  { key: 'ringCosmos', h: 26, ring: ['cosmos'], hue: 335 }, // 38
  { key: 'ringPlumeria', h: 26, ring: ['plumeria'], hue: 48, tint: 'white' }, // 39
];

/** Until its picture arrives, a decoration takes up a box this wide for its height. */
ORNAMENTS.forEach((def) => {
  def.size = [def.h * 0.8, def.h];
  def.anchor = def.hold === 'pole' || def.hold === 'ground' ? [0.5, 1] : def.hold === 'hook' ? [0.5, 0] : [0.5, 0.5];
});
// A ring's box is worked out from the tier it wraps.
ORNAMENTS.forEach((def) => def.ring && (def.size = [90, 26]));

const RING = 9;
/** Whether a decoration is a flower ring round a tier. */
const isRing = (type) => Boolean(ORNAMENTS[type] && ORNAMENTS[type].ring);
/** Every flower ring, for the sample pagodas. */
const RING_TYPES = ORNAMENTS.map((def, type) => (def.ring ? type : -1)).filter((type) => type >= 0);
const INCENSE = 10;
const ITEM_COUNT = ORNAMENTS.length;
