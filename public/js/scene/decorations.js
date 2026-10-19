'use strict';

/**
 * SANDSIAM · Decorations on the scene: flower rings round the tiers, and every other
 * decoration from its cartoon picture (js/scene/ornaments/). Needs core.js, assets.js,
 * ornaments/catalog.js and ornaments/pictures.js; flower rings use pagodaHalfWidth from pagoda.js.
 */

/** The pagoda being drawn, so flower rings can hug its tiers (set by drawArtwork). */
let scenePagoda = null;

function ringShape(o) {
  const stretch = scenePagoda ? scenePagoda.height : 1;
  const base = o.ringW || pagodaHalfWidth(scenePagoda || { shape: 0, base: 0 }, o.y / stretch);
  const w = base * o.size + 1; // hugs the surface: only the flowers' own roundness stands proud
  return { w, ry: w * 0.24 * stretch };
}

/** A string of flower heads wrapped round the front of a tier, the far ones in shade. */
function drawRing(c, o) {
  const pics = ringFlowerImages(o.type, o.color);
  if (!pics) return;
  const { w, ry } = ringShape(o);
  const r = 6;
  const n = Math.max(8, Math.round((Math.PI * w) / (r * 1.5)));
  const order = [...Array(n + 1).keys()].sort((a, b) => Math.sin((a / n) * Math.PI) - Math.sin((b / n) * Math.PI));
  c.save();
  c.shadowColor = 'rgba(70, 45, 20, 0.25)';
  c.shadowBlur = 2;
  c.shadowOffsetY = 1.5;
  for (const i of order) {
    const a = (i / n) * Math.PI;
    const depth = 0.6 + 0.4 * Math.sin(a);
    const x = Math.cos(a) * w;
    const y = Math.sin(a) * ry;
    const size = r * 2 * (0.9 + 0.1 * depth);
    const pic = pics[i % pics.length]; // mixed rings take the flowers in turn
    const aspect = (pic.naturalWidth || pic.width) / (pic.naturalHeight || pic.height);
    c.globalAlpha = 1;
    c.drawImage(pic, x - (size * aspect) / 2, y - size / 2, size * aspect, size);
    if (depth < 0.99) {
      c.globalAlpha = (1 - depth) * 0.45;
      c.fillStyle = '#3b230e';
      c.beginPath();
      c.arc(x, y, size * 0.42, 0, Math.PI * 2);
      c.fill();
    }
  }
  c.restore();
}

/** Hit box of a decoration, relative to its own position (a little padding for fingers). */
function ornamentBounds(o) {
  if (isRing(o.type)) {
    const { w, ry } = ringShape(o);
    return { x: -w - 6, y: -ry - 8, w: w * 2 + 12, h: ry * 2 + 16 };
  }
  const { size: [w, h], anchor: [ax, ay] } = ORNAMENTS[o.type];
  const s = o.size;
  const pad = 6;
  return { x: (-ax * w - pad) * s, y: (-ay * h - pad) * s, w: (w + pad * 2) * s, h: (h + pad * 2) * s };
}

/** Draws one decoration at the current origin (the point it is held by). */
function drawOrnament(c, o, highlight) {
  if (isRing(o.type)) {
    drawRing(c, o);
  } else {
    const def = ORNAMENTS[o.type];
    const pic = ornamentImage(o.type, o.color);
    if (pic) {
      const { size: [w, h], anchor: [ax, ay] } = def;
      const t = sceneClock.t;
      const live = sceneClock.animate;
      c.save();
      // A flipped decoration is mirrored around the point it is held by.
      c.scale(o.flip ? -o.size : o.size, o.size);
      // Flags, lanterns and hanging fish rock gently in the breeze around where they are held.
      if (live && def.sway) c.rotate(Math.sin(t * 1.7 + (o.id || 0) * 1.3) * def.sway);
      // A butterfly beats its wings.
      if (live && def.flap) c.scale(0.7 + 0.3 * Math.abs(Math.cos(t * 5 + (o.id || 0))), 1);
      // A soft shadow cast away from the light.
      c.shadowColor = 'rgba(48, 30, 12, 0.3)';
      c.shadowBlur = 4;
      c.shadowOffsetX = -sceneLight().sun * 2.5;
      c.shadowOffsetY = 2.5;
      c.drawImage(pic, -ax * w, -ay * h, w, h);
      c.shadowColor = 'transparent';
      // Candle flames and lanterns glow and flicker.
      if (def.glow) {
        const flicker = live ? 0.42 + 0.12 * Math.sin(t * 7 + (o.id || 0)) + 0.06 * Math.sin(t * 13) : 0.45;
        glow(c, (def.glow[0] - ax) * w, (def.glow[1] - ay) * h, h * 0.32, 'rgba(255, 214, 120, A)', flicker);
      }
      c.restore();
    }
  }

  if (highlight) {
    const b = ornamentBounds(o);
    c.save();
    c.setLineDash([5, 4]);
    c.strokeStyle = SELECTION_COLOR;
    c.lineWidth = 2;
    c.strokeRect(b.x, b.y, b.w, b.h);
    c.restore();
  }
}

/** Draws a decoration centred in a w×h box, for the tiles in the editor card. */
function drawOrnamentIcon(c, type, color, w, h) {
  const { size: [sw, sh], anchor: [ax, ay] } = ORNAMENTS[type];
  const scale = Math.min((w * 0.86) / sw, (h * 0.86) / sh);
  c.save();
  c.translate(w / 2 + (ax - 0.5) * sw * scale, h / 2 + (ay - 0.5) * sh * scale);
  c.scale(scale, scale);
  drawOrnament(c, { type, color, size: 1, ringW: 38, y: 0 }, false);
  c.restore();
}
