'use strict';

/**
 * SANDSIAM · The pagoda field ("ลานเจดีย์"): many offered pagodas on one backdrop.
 * Needs every other scene file.
 */

/**
 * Rows of places on the open sand, front to back: how far between the front and back
 * edge of the sand (0 front … 1 back), how many stand in the row, and whether they stand
 * in the gaps of the row in front (the middle row, which would otherwise be hidden) or
 * spread evenly (the back row stands clear above the middle row's spires).
 */
const FIELD_ROWS = [
  { depth: 0, n: 3, gaps: false },
  { depth: 0.38, n: 4, gaps: true },
  { depth: 1, n: 5, gaps: false },
];
const FIELD_SIZE = FIELD_ROWS.reduce((n, row) => n + row.n, 0);

/**
 * Places for pagodas on the sand of the backdrop on show, in screen pixels, nearest
 * first. Sizes follow the picture's perspective (size ∝ distance below eye level), rows
 * are placed so no pagoda hides another, and nothing ever stands on water, walls or trees.
 */
function fieldSlots(w, h, insets, map, place) {
  const g = GROUND[place] || GROUND[0];
  const roomW = w - insets.left - insets.right;
  const roomH = h - insets.top - insets.bottom;
  const toY = (fy) => photoPoint(map, 0, fy)[1];
  const toX = (fx) => photoPoint(map, fx, 0)[0];
  const horizon = toY(g.horizon);
  const farY = toY(g.far[0]);
  const nearY = Math.min(toY(g.near[0]), h - insets.bottom - 34);
  // The front row is as large as fits; every other size follows from perspective.
  const nearScale = Math.min((roomH * 0.34) / (ART.bottom - ART.top), roomW / (3 * 330));
  const scaleAt = (y) => (nearScale * Math.max(1, y - horizon)) / Math.max(1, nearY - horizon);

  const slots = [];
  let prev = null;
  for (const row of FIELD_ROWS) {
    const lerp = (a, b) => b + (a - b) * row.depth; // depth 0 = near edge, 1 = far edge
    const y = lerp(farY, nearY);
    const scale = scaleAt(y);
    // The open sand at this depth, kept on screen and clear of the interface.
    const margin = 110 * scale;
    const x0 = Math.max(toX(lerp(g.far[1], g.near[1])), insets.left + margin);
    const x1 = Math.min(toX(lerp(g.far[2], g.near[2])), w - insets.right - margin);
    let xs;
    if (!row.gaps || !prev) {
      // Spread evenly across the sand.
      const gap = (x1 - x0) / row.n;
      xs = Array.from({ length: row.n }, (_, i) => x0 + gap * (i + 0.5));
    } else {
      // One in each gap of the row in front, plus one beyond each end.
      const step = prev.length > 1 ? prev[1] - prev[0] : roomW / 2;
      const ends = [prev[0] - step / 2, ...prev.slice(1).map((x, i) => (x + prev[i]) / 2), prev[prev.length - 1] + step / 2];
      // Squeeze the row in if the sand is narrower there than the row would be.
      const lo = Math.min(...ends);
      const hi = Math.max(...ends);
      const k = hi - lo > x1 - x0 ? (x1 - x0) / (hi - lo) : 1;
      const mid = (x0 + x1) / 2;
      const centre = (lo + hi) / 2;
      xs = ends.map((x) => Math.max(x0, Math.min(x1, mid + (x - centre) * k)));
    }
    xs.forEach((x, i) => {
      const yy = y - (i % 2) * (nearY - farY) * 0.04 * row.depth;
      slots.push({ x, y: yy, scale: scaleAt(yy), centre: Math.abs(x - (insets.left + roomW / 2)) });
    });
    prev = xs;
  }
  // Fill front and centre first, so the newest pagodas stand closest.
  return slots.sort((a, b) => b.y - a.y || a.centre - b.centre);
}

/** A finished pagoda drawn once into its own canvas, so the field stays smooth. */
function entryArt(entry, scale, dpr, cache) {
  const key = `${entry.id}|${entry.updated || 0}|${scale.toFixed(3)}|${dpr}|${sceneClock.place}|${ready(sceneAssets.sand)}|${ornamentPicturesLoaded()}`;
  if (cache.has(key)) return cache.get(key);
  const out = document.createElement('canvas');
  const k = scale * dpr;
  out.width = Math.ceil(ART.width * k);
  out.height = Math.ceil((ART.bottom - ART.top + 20) * k);
  const c = out.getContext('2d');
  c.setTransform(k, 0, 0, k, out.width / 2, -ART.top * k);
  const wasAnimating = sceneClock.animate;
  sceneClock.animate = false;
  drawArtwork(c, entry.state);
  sceneClock.animate = wasAnimating;
  const art = { canvas: out, originX: out.width / 2 / dpr, originY: -ART.top * scale };
  cache.set(key, art);
  return art;
}

/**
 * Paints the pagoda field for one region and returns hit boxes for tapping.
 *   entries: [{id, state, name, example}], image, fxPlace, time, animate, insets,
 *   selectedId, dpr, cache (a Map kept between frames), labels: {example},
 *   reach (see backdropFit)
 */
function renderFieldScene(c, w, h, opts) {
  const { entries, image, insets, dpr = 1, cache } = opts;
  const place = opts.fxPlace ?? 0;
  sceneClock.t = opts.time || 0;
  sceneClock.animate = !!opts.animate;
  sceneClock.place = place;
  c.fillStyle = '#ead7b6';
  c.fillRect(0, 0, w, h);
  const map = drawBackground(c, w, h, image, 1, 1, opts.reach || 0);

  const slots = fieldSlots(w, h, insets, map, place);
  const hits = [];
  // Draw from the back of the field to the front.
  const placed = entries.slice(0, FIELD_SIZE).map((entry, i) => ({ entry, slot: slots[i] }));
  placed.sort((a, b) => a.slot.y - b.slot.y);
  placed.forEach(({ entry, slot }) => {
    const art = entryArt(entry, slot.scale, dpr, cache);
    const left = slot.x - art.originX;
    const top = slot.y - art.originY;
    const selected = opts.selectedId === entry.id;
    c.save();
    if (selected) {
      c.shadowColor = 'rgba(255, 214, 120, 0.95)';
      c.shadowBlur = 24;
    }
    c.drawImage(art.canvas, left, top, art.canvas.width / dpr, art.canvas.height / dpr);
    c.restore();
    const hh = (ART.bottom - ART.top) * slot.scale;
    hits.push({ id: entry.id, x0: slot.x - 140 * slot.scale, x1: slot.x + 140 * slot.scale, y0: slot.y - hh * 0.8, y1: slot.y + 70 * slot.scale + 24 });
  });

  // Name plates go on last, so a pagoda in front never hides one behind it.
  placed.forEach(({ entry, slot }) => {
    const selected = opts.selectedId === entry.id;
    const label = entry.example ? opts.labels.example : entry.name;
    if (label) {
      c.save();
      const size = Math.round(Math.max(13, Math.min(18, 11 + 7 * slot.scale)));
      c.font = `600 ${size}px "Mali", "Noto Sans SC", sans-serif`;
      const tw = c.measureText(label).width + size * 1.2;
      const th = size * 1.7;
      const ty = slot.y + 70 * slot.scale + th / 2;
      c.fillStyle = selected ? 'rgba(224, 68, 126, 0.92)' : 'rgba(28, 20, 12, 0.55)';
      c.beginPath();
      c.roundRect(slot.x - tw / 2, ty - th / 2, tw, th, th / 2);
      c.fill();
      c.fillStyle = entry.example && !selected ? 'rgba(255, 255, 255, 0.82)' : '#ffffff';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(label, slot.x, ty + 1);
      c.restore();
    }
  });

  if (opts.animate) drawEffects(c, w, h, sceneClock.t, place, map);
  return hits.reverse(); // nearest first for tapping
}
