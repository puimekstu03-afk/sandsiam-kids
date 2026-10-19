'use strict';

/**
 * SANDSIAM · The sand pagoda, drawn in Canvas 2D with a real sand photo pressed into it
 * and lit to match the backdrop photo it stands in. Needs core.js, assets.js and
 * backgrounds.js (for PLACE_LIGHT).
 *
 * Every shape stands on three round tiers (or the square base) and ends in a stack of
 * small rings, a needle spire and a little ball on top. In between:
 *   0 Bell (ทรงระฆัง): a tall bell with gently curving sides and a rim at its top.
 *   1 Stepped (ทรงขั้นบันได): more tiers, each a little narrower, rising like a cone.
 *   2 Lotus (ทรงดอกบัว): a round lotus bud wrapped in big pointed petals, with small
 *     petals round its neck.
 *
 * The parts are plain data (pagodaParts), so drawing, the flower rings that hug the
 * pagoda (pagodaHalfWidth) and the heights decorations snap to (pagodaSnapTiers) all agree.
 * Units: origin at the pagoda's foot, y grows downwards, before the height stretch.
 */

/** Darker and lighter versions of a sand tone, for shading. */
const SAND_DARK = '#4a2e14';
const SAND_LIGHT = '#fff3d6';

/** Where the ball on top ends, shared by every shape (ART.top leaves room above it). */
const PAGODA_TIP = -334;
const PAGODA_BALL = 6;

/* ---------- Shape data ---------- */

/** The base the child picked, then the two tiers every pagoda stands on. */
function baseParts(state) {
  return [
    state.base === 0 ? { kind: 'tier', y: 24, w: 163, h: 29 } : { kind: 'squareBase' },
    { kind: 'tier', y: -6, w: 137, h: 24 },
    { kind: 'tier', y: -33, w: 119, h: 20 },
  ];
}

/** Small rounded rings, each narrower than the last, then the needle and its ball. */
function crownParts(y, widths, h) {
  const rings = widths.map((w, i) => ({ kind: 'ring', y: y - i * h, w, h: h - 1, crown: true }));
  const top = y - widths.length * h;
  return [...rings, { kind: 'needle', y: top, w: Math.max(5, widths[widths.length - 1] * 0.45) }];
}

const SHAPE_PARTS = [
  // 0 Bell
  () => [
    { kind: 'bell', y: -53, w0: 110, w1: 36, h: 127 },
    { kind: 'tier', y: -180, w: 46, h: 10 },
    ...crownParts(-190, [29, 24, 20, 16, 12], 13),
  ],
  // 1 Stepped
  () => [
    ...[104, 91, 78, 65, 53, 42].map((w, i) => ({ kind: 'tier', y: -53 - i * 22, w, h: 22 })),
    ...crownParts(-185, [31, 26, 21, 17, 13], 12),
  ],
  // 2 Lotus
  () => [
    { kind: 'lotus', y: -53, w: 112, h: 137, neck: 38 },
    { kind: 'petals', y: -190, w: 42, h: 12 },
    { kind: 'tier', y: -202, w: 46, h: 9 },
    ...crownParts(-211, [31, 26, 21, 16], 12),
  ],
];

function pagodaParts(state) {
  return [...baseParts(state), ...(SHAPE_PARTS[state.shape] || SHAPE_PARTS[0])()];
}

/* ---------- Curves shared by drawing and the outline ---------- */

const cubic = (a, b, c, d, t) => (1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t * t * c + t ** 3 * d;

/** Left side of the bell, bottom to top: almost a cone, its sides curving in just a little. */
const bellCurve = (p) => [[-p.w0, 0], [-p.w0 + (p.w0 - p.w1) * 0.3, -p.h * 0.22], [-p.w1 - (p.w0 - p.w1) * 0.08, -p.h * 0.7], [-p.w1, -p.h]];

/** Left side of the lotus bud: full and round, closing in to its neck. */
const lotusCurve = (p) => [[-p.w, 0], [-p.w * 1.12, -p.h * 0.42], [-p.neck * 1.7, -p.h * 0.94], [-p.neck, -p.h]];

/** Points along a curve, as [x, y]. */
function curvePoints(curve, n = 10) {
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    return [cubic(curve[0][0], curve[1][0], curve[2][0], curve[3][0], t), cubic(curve[0][1], curve[1][1], curve[2][1], curve[3][1], t)];
  });
}

/**
 * The pagoda's silhouette as segments [yBottom, yTop, halfWidthBottom, halfWidthTop].
 * Flower rings use it to wrap snugly round whatever they sit on.
 */
function pagodaOutline(state) {
  const segs = [];
  for (const p of pagodaParts(state)) {
    switch (p.kind) {
      case 'squareBase':
        // Only its side corners reach out to 155; above them (y < −12) is the flat top,
        // where the round tiers above decide the width.
        segs.push([14, -12, 155, 155]);
        break;
      case 'ring':
        segs.push([p.y, p.y - p.h, p.w + p.h * 0.3, p.w + p.h * 0.3]);
        break;
      case 'petals':
        segs.push([p.y, p.y - p.h, p.w + 3, p.w + 3]);
        break;
      case 'bell':
      case 'lotus': {
        const pts = curvePoints((p.kind === 'bell' ? bellCurve : lotusCurve)(p));
        for (let i = 1; i < pts.length; i++) segs.push([p.y + pts[i - 1][1], p.y + pts[i][1], -pts[i - 1][0], -pts[i][0]]);
        break;
      }
      case 'needle':
        segs.push([p.y, PAGODA_TIP + PAGODA_BALL * 2, p.w, 1.5]);
        break;
      default: // tier
        segs.push([p.y, p.y - p.h, p.w, p.w]);
    }
  }
  return segs;
}

/** Half-width of the pagoda at a height (unstretched units). */
function pagodaHalfWidth(state, y) {
  let best = null;
  let bestGap = Infinity;
  for (const [y0, y1, w0, w1] of pagodaOutline(state)) {
    if (y <= y0 && y >= y1) return y0 === y1 ? Math.max(w0, w1) : w0 + ((w1 - w0) * (y0 - y)) / (y0 - y1);
    const gap = y > y0 ? y - y0 : y1 - y;
    if (gap < bestGap) {
      bestGap = gap;
      best = y > y0 ? w0 : w1;
    }
  }
  return best ?? 100;
}

/** Heights (unstretched) where decorations stick: the middle of each tier, and along the bell or lotus. */
function pagodaSnapTiers(state) {
  const ys = [];
  for (const p of pagodaParts(state)) {
    if (p.kind === 'squareBase') ys.push(14);
    else if (p.kind === 'tier' || p.kind === 'petals') ys.push(p.y - p.h / 2);
    else if (p.kind === 'bell') ys.push(p.y - p.h * 0.15, p.y - p.h * 0.45, p.y - p.h * 0.75);
    else if (p.kind === 'lotus') ys.push(p.y - p.h * 0.15, p.y - p.h * 0.45, p.y - p.h * 0.75);
    else if (p.kind === 'ring' && p.crown && ys.length && !ys.crown) ys.push((ys.crown = p.y - p.h / 2));
  }
  return ys.map((y) => Math.round(y));
}

/* ---------- Drawing ---------- */

function drawPagoda(c, state) {
  const base = SAND_COLORS[state.sand];
  const light = sceneLight();
  const side = Math.abs(light.sun) < 0.2 ? 0 : Math.sign(light.sun);

  // Rounded shading across a tier, brightest on the side the light comes from.
  const shade = (w) => {
    const g = side > 0 ? c.createLinearGradient(w, 0, -w, 0) : c.createLinearGradient(-w, 0, w, 0);
    if (side === 0) {
      // Light from behind: both edges fall into shade, the middle stays soft.
      g.addColorStop(0, mix(base, SAND_DARK, 0.4));
      g.addColorStop(0.5, mix(base, SAND_LIGHT, 0.08));
      g.addColorStop(1, mix(base, SAND_DARK, 0.4));
    } else {
      g.addColorStop(0, mix(base, SAND_DARK, 0.14));
      g.addColorStop(0.27, mix(base, SAND_LIGHT, 0.34));
      g.addColorStop(0.55, base);
      g.addColorStop(0.84, mix(base, SAND_DARK, 0.3));
      g.addColorStop(1, mix(base, SAND_DARK, 0.46));
    }
    return g;
  };
  const topFill = (w) => {
    const g = c.createLinearGradient(0, -w * 0.24, 0, w * 0.24);
    g.addColorStop(0, mix(base, SAND_LIGHT, 0.12));
    g.addColorStop(1, mix(base, SAND_LIGHT, 0.3));
    return g;
  };

  // After each shape is filled: press the sand photo into it, wash it in the
  // backdrop's light, and mark its edge with a faint crease (no cartoon outline).
  const pattern = sandPattern(c);
  const finish = () => {
    c.save();
    if (pattern) {
      c.globalCompositeOperation = 'multiply';
      c.globalAlpha = 0.5;
      c.fillStyle = pattern;
      c.fill();
      c.globalCompositeOperation = 'source-over';
    }
    if (light.amount) {
      c.globalAlpha = light.amount;
      c.fillStyle = light.tint;
      c.fill();
    }
    c.globalAlpha = 1;
    c.lineJoin = 'round';
    c.lineWidth = 1.1;
    c.strokeStyle = 'rgba(70, 45, 20, 0.2)';
    c.stroke();
    c.restore();
  };

  // A soft darkening where a part presses down on the one below it.
  const contact = (y, w) => {
    c.save();
    c.translate(0, y);
    c.scale(1, 0.24);
    const g = c.createRadialGradient(0, 0, w * 0.85, 0, 0, w * 1.12);
    g.addColorStop(0, 'rgba(60, 36, 16, 0.34)');
    g.addColorStop(1, 'rgba(60, 36, 16, 0)');
    c.fillStyle = g;
    c.fillRect(-w * 1.2, -w * 1.2, w * 2.4, w * 2.4);
    c.restore();
  };

  // A rounded part's light from above: brighter near the top, on the lit side.
  const sheen = (cx, cy, r, alpha = 0.22) => {
    c.save();
    c.clip();
    const g = c.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, `rgba(255, 246, 222, ${alpha})`);
    g.addColorStop(1, 'rgba(255, 246, 222, 0)');
    c.fillStyle = g;
    c.fillRect(cx - r, cy - r, r * 2, r * 2);
    c.restore();
  };

  // One sand tier: a short cylinder seen from slightly above.
  const tier = (y, w, h, rim = true) => {
    contact(y, w);
    c.fillStyle = shade(w);
    c.beginPath();
    c.ellipse(0, y, w, w * 0.24, 0, 0, Math.PI);
    c.lineTo(-w, y - h);
    c.ellipse(0, y - h, w, w * 0.24, 0, Math.PI, Math.PI * 2);
    c.closePath();
    c.fill();
    finish();
    ellipse(c, 0, y - h, w, w * 0.24, topFill(w));
    finish();
    if (!rim) return;
    // The packed rim catches a little light.
    c.strokeStyle = 'rgba(255, 244, 214, 0.32)';
    c.lineWidth = 1.2;
    c.beginPath();
    c.ellipse(0, y - h, w - 1.5, w * 0.24, 0, 0, Math.PI);
    c.stroke();
  };

  // A garland moulding (มาลัยเถา): a fat rounded ring, its sides bulging out.
  const ring = (y, w, h) => {
    contact(y, w);
    const bulge = w + h * 0.3;
    c.fillStyle = shade(bulge);
    c.beginPath();
    c.ellipse(0, y, w, w * 0.24, 0, 0, Math.PI);
    c.quadraticCurveTo(-bulge - h * 0.2, y - h * 0.5, -w * 0.97, y - h);
    c.ellipse(0, y - h, w * 0.97, w * 0.97 * 0.24, 0, Math.PI, Math.PI * 2);
    c.quadraticCurveTo(bulge + h * 0.2, y - h * 0.5, w, y);
    c.closePath();
    c.fill();
    finish();
    // Round from top to bottom: light along the upper curve, shade underneath.
    c.save();
    c.clip();
    const v = c.createLinearGradient(0, y - h - w * 0.24, 0, y + w * 0.24);
    v.addColorStop(0, 'rgba(255, 246, 222, 0.28)');
    v.addColorStop(0.55, 'rgba(255, 246, 222, 0)');
    v.addColorStop(1, 'rgba(60, 36, 16, 0.22)');
    c.fillStyle = v;
    c.fillRect(-bulge - h, y - h - w * 0.3, (bulge + h) * 2, h + w * 0.6);
    c.restore();
    ellipse(c, 0, y - h, w * 0.97, w * 0.97 * 0.24, topFill(w));
    finish();
  };

  // The bell: a tall body with gently curving sides, from its curve mirrored.
  const bell = (p) => {
    contact(p.y, p.w0);
    const [p0, p1, p2, p3] = bellCurve(p).map(([x, dy]) => [x, p.y + dy]);
    c.fillStyle = shade(p.w0);
    c.beginPath();
    c.moveTo(-p0[0], p0[1]);
    c.ellipse(0, p.y, p.w0, p.w0 * 0.24, 0, 0, Math.PI);
    c.bezierCurveTo(p1[0], p1[1], p2[0], p2[1], p3[0], p3[1]);
    c.ellipse(0, p3[1], p.w1, p.w1 * 0.24, 0, Math.PI, Math.PI * 2);
    c.bezierCurveTo(-p2[0], p2[1], -p1[0], p1[1], -p0[0], p0[1]);
    c.closePath();
    c.fill();
    finish();
    // A long soft gleam down the lit side, as on smoothed damp sand.
    c.save();
    c.clip();
    const gx = (side || -1) * -p.w0 * 0.28;
    const g = c.createLinearGradient(gx - 18, 0, gx + 18, 0);
    g.addColorStop(0, 'rgba(255, 246, 222, 0)');
    g.addColorStop(0.5, 'rgba(255, 246, 222, 0.2)');
    g.addColorStop(1, 'rgba(255, 246, 222, 0)');
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(gx * 0.4 - 6, p.y - p.h * 0.95);
    c.lineTo(gx * 0.4 + 10, p.y - p.h * 0.95);
    c.lineTo(gx + 20, p.y - p.h * 0.12);
    c.lineTo(gx - 16, p.y - p.h * 0.12);
    c.closePath();
    c.fill();
    c.restore();
  };

  // One big pointed lotus petal standing up from (x, foot) to its tip.
  const bigPetal = (x, foot, tipY, pw, lit) => {
    // A teardrop: narrow at its foot, fullest below the middle, drawing to a soft point.
    const len = foot - tipY;
    c.beginPath();
    c.moveTo(x - pw * 0.6, foot);
    c.bezierCurveTo(x - pw * 1.32, foot - len * 0.28, x - pw * 0.9, tipY + len * 0.3, x, tipY);
    c.bezierCurveTo(x + pw * 0.9, tipY + len * 0.3, x + pw * 1.32, foot - len * 0.28, x + pw * 0.6, foot);
    c.closePath();
    const g = c.createLinearGradient(x - pw, 0, x + pw, 0);
    const edge = (k) => (k > 0 ? mix(base, SAND_LIGHT, k) : mix(base, SAND_DARK, -k));
    g.addColorStop(0, edge(lit - 0.12));
    g.addColorStop(0.45, edge(lit + 0.14));
    g.addColorStop(1, edge(lit - 0.2));
    c.fillStyle = g;
    c.fill();
    finish();
    c.save();
    c.lineWidth = 1.4;
    c.strokeStyle = 'rgba(70, 45, 20, 0.28)';
    c.stroke();
    // A groove up the middle of the petal.
    c.strokeStyle = 'rgba(70, 45, 20, 0.22)';
    c.lineWidth = 1.3;
    c.beginPath();
    c.moveTo(x, foot - 4);
    c.quadraticCurveTo(x - pw * 0.08, (foot + tipY) / 2, x, tipY + (foot - tipY) * 0.25);
    c.stroke();
    c.restore();
  };

  // The lotus bud: a round body wrapped in two rows of big petals.
  const lotus = (p) => {
    contact(p.y, p.w);
    const [p0, p1, p2, p3] = lotusCurve(p).map(([x, dy]) => [x, p.y + dy]);
    c.fillStyle = shade(p.w);
    c.beginPath();
    c.moveTo(-p0[0], p0[1]);
    c.ellipse(0, p.y, p.w, p.w * 0.24, 0, 0, Math.PI);
    c.bezierCurveTo(p1[0], p1[1], p2[0], p2[1], p3[0], p3[1]);
    c.ellipse(0, p3[1], p.neck, p.neck * 0.24, 0, Math.PI, Math.PI * 2);
    c.bezierCurveTo(-p2[0], p2[1], -p1[0], p1[1], -p0[0], p0[1]);
    c.closePath();
    c.fill();
    finish();
    c.save();
    c.clip();
    const litAt = (a) => (side === 0 ? 0.04 : 0.06 + Math.sin(a) * side * 0.14);
    // Back row, peeking between the front petals, a little higher.
    for (const a of [-0.95, -0.32, 0.32, 0.95]) {
      bigPetal(Math.sin(a) * p.w * 0.74, p.y + Math.cos(a) * p.w * 0.2, p.y - p.h * 0.9, p.w * 0.3 * Math.cos(a) + 5, litAt(a) - 0.1);
    }
    // Front row of five.
    for (const a of [-1.26, -0.63, 0, 0.63, 1.26]) {
      bigPetal(Math.sin(a) * p.w * 0.9, p.y + Math.cos(a) * p.w * 0.24 - 1, p.y - p.h * 0.74, p.w * 0.37 * Math.cos(a) + 6, litAt(a));
    }
    c.restore();
  };

  // The needle spire with its little ball on top.
  const needle = (y, w) => {
    const ballY = PAGODA_TIP + PAGODA_BALL;
    tier(y, w + 2, 3, false);
    polygon(c, [[-w, y - 3], [-1.4, ballY + PAGODA_BALL - 1], [1.4, ballY + PAGODA_BALL - 1], [w, y - 3]], shade(w));
    finish();
    c.beginPath();
    c.arc(0, ballY, PAGODA_BALL, 0, Math.PI * 2);
    c.fillStyle = shade(PAGODA_BALL);
    c.fill();
    finish();
    ellipse(c, side * -1.8 || -1.8, ballY - 2, 1.8, 1.4, 'rgba(255, 246, 222, 0.6)');
  };

  // A band of small lotus petals pointing up round the neck.
  const petals = (y, w, h, up = true) => {
    tier(y, w * 0.94, h, false);
    const n = 11;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + ((i + 0.5) / n) * Math.PI;
      const x = Math.sin(a) * (w + 2);
      const dy = Math.cos(a) * w * 0.24;
      const pw = ((Math.PI * w) / n) * Math.cos(a) * 0.62 + 1.5;
      const yTop = y - h + dy;
      const yBot = y + dy;
      const tipY = up ? yTop - h * 0.35 : yBot + 2;
      const rootY = up ? yBot : yTop;
      const lit = side === 0 ? 0.08 : 0.1 + Math.sin(a) * side * 0.16;
      c.beginPath();
      c.moveTo(x - pw, rootY);
      c.quadraticCurveTo(x - pw * 1.05, (rootY + tipY) / 2, x, tipY);
      c.quadraticCurveTo(x + pw * 1.05, (rootY + tipY) / 2, x + pw, rootY);
      c.closePath();
      c.fillStyle = lit > 0 ? mix(base, SAND_LIGHT, lit) : mix(base, SAND_DARK, -lit);
      c.fill();
      finish();
    }
  };

  c.save();
  c.scale(1, state.height);

  // Shadow on the ground, cast away from the light and blurred at its edge.
  c.save();
  c.translate(-light.sun * 46, 44 + (side === 0 ? 14 : 0));
  c.scale(1, 0.21);
  const sh = c.createRadialGradient(0, 0, 60, 0, 0, 215);
  sh.addColorStop(0, 'rgba(48, 30, 12, 0.46)');
  sh.addColorStop(0.6, 'rgba(48, 30, 12, 0.24)');
  sh.addColorStop(1, 'rgba(48, 30, 12, 0)');
  c.fillStyle = sh;
  c.fillRect(-230, -230, 460, 460);
  c.restore();

  for (const p of pagodaParts(state)) {
    switch (p.kind) {
      case 'squareBase':
        contact(26, 158);
        polygon(c, [[-155, -12], [0, -54], [155, -12], [0, 39]], topFill(150));
        finish();
        polygon(c, [[-155, -12], [0, 39], [0, 65], [-155, 14]], mix(base, side > 0 ? SAND_DARK : SAND_LIGHT, side > 0 ? 0.32 : 0.1));
        finish();
        polygon(c, [[155, -12], [0, 39], [0, 65], [155, 14]], mix(base, side > 0 ? SAND_LIGHT : SAND_DARK, side > 0 ? 0.1 : 0.32));
        finish();
        break;
      case 'tier': tier(p.y, p.w, p.h); break;
      case 'ring': ring(p.y, p.w, p.h); break;
      case 'bell': bell(p); break;
      case 'lotus': lotus(p); break;
      case 'petals': petals(p.y, p.w, p.h); break;
      case 'needle': needle(p.y, p.w); break;
    }
  }

  // Without the sand photo, sprinkle a deterministic drawn grain instead.
  if (!pattern) {
    c.save();
    c.globalAlpha = 0.17;
    for (let i = 0; i < 900; i++) {
      const y = -((i * 67) % 235);
      const w = pagodaHalfWidth(state, y) * 0.92;
      const x = ((((i * 137) % 1000) / 500) - 1) * w;
      ellipse(c, x, y, 0.65, 0.5, i % 2 ? '#7d5b34' : '#fff2c7');
    }
    c.restore();
  }
  c.restore();
}

/** Sand kicked up while the pagoda rises out of the ground. */
function drawDust(c, k) {
  c.save();
  c.globalAlpha = (1 - k) * 0.7;
  for (let i = 0; i < 26; i++) {
    const a = seeded(i, 30) * Math.PI;
    const d = 120 + seeded(i, 31) * 90 + k * 60;
    ellipse(c, Math.cos(a) * d * (seeded(i, 32) > 0.5 ? 1 : -1), 40 - Math.sin(a) * 30 * (1 + k), 3 + seeded(i, 33) * 4, 2.5, '#d9b77e');
  }
  c.restore();
}

/** Draws the pagoda, reusing a cached picture while nothing about it has changed. */
function paintPagoda(c, state, cache) {
  if (!cache) return drawPagoda(c, state);
  const m = c.getTransform();
  const key = [state.shape, state.base, state.height, state.sand, sceneClock.place, ready(sceneAssets.sand), c.canvas.width, c.canvas.height, m.a, m.d, m.e, m.f].join('|');
  if (cache.key !== key) {
    cache.layer = cache.layer || document.createElement('canvas');
    cache.layer.width = c.canvas.width;
    cache.layer.height = c.canvas.height;
    const lc = cache.layer.getContext('2d');
    lc.setTransform(m);
    drawPagoda(lc, state);
    cache.key = key;
  }
  c.save();
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.drawImage(cache.layer, 0, 0);
  c.restore();
}
