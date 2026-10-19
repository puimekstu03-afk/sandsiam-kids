'use strict';

/**
 * SANDSIAM · Quiet motion tied to what is really in each photo: the lamps along the
 * southern sand flicker and the sea glints in the sun. Needs core.js and backgrounds.js.
 */

/** Ambient motion over the backdrop; `map` is what drawBackground returned. */
function drawEffects(c, w, h, t, place, map) {
  const fx = PLACE_FX[place] || {};
  if (!map) return;
  c.save();
  c.globalCompositeOperation = 'lighter';

  for (const [r, row] of (fx.lamps || []).entries()) {
    for (let j = 0; j < LAMPS_PER_ROW; j++) {
      const f = j / (LAMPS_PER_ROW - 1);
      const [x, y] = photoPoint(map, row[0] + (row[2] - row[0]) * f, row[1] + (row[3] - row[1]) * f);
      const flicker = 0.18 + 0.1 * Math.sin(t * 7 + j * 1.7 + r) + 0.06 * Math.sin(t * 13.3 + j * 2.9);
      glow(c, x, y, 12 * map.s + 4, 'rgba(255, 170, 70, A)', clamp01(flicker));
    }
  }

  if (fx.sea) {
    const [x0, y0, x1, y1] = fx.sea;
    for (let i = 0; i < 22; i++) {
      const [x, y] = photoPoint(map, x0 + seeded(i, 21) * (x1 - x0), y0 + seeded(i, 22) * (y1 - y0));
      const a = Math.pow(Math.max(0, Math.sin(t * 1.6 + i * 1.9)), 8);
      if (a < 0.02) continue;
      c.save();
      c.translate(x, y);
      c.scale(2.6, 1);
      glow(c, 0, 0, 3 + 3 * map.s, 'rgba(255, 252, 235, A)', a * 0.55);
      c.restore();
    }
  }
  c.restore();
}
