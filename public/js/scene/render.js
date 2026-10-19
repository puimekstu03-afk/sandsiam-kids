'use strict';

/**
 * SANDSIAM · Putting the whole scene together: backdrop photo, pagoda, decorations, effects
 * and the caption on exported pictures. Needs every other scene file.
 */

function drawExportCaption(c, w, h, state, text) {
  const top = h - 200;
  // A cream card with a thick cartoon outline and a hard shadow.
  c.save();
  c.fillStyle = INK;
  c.beginPath();
  c.roundRect(28, top + 8, w - 56, 182, 36);
  c.fill();
  c.fillStyle = '#fffaf0';
  c.strokeStyle = INK;
  c.lineWidth = 5;
  c.beginPath();
  c.roundRect(28, top, w - 56, 180, 36);
  c.fill();
  c.stroke();
  c.restore();

  c.textAlign = 'center';
  c.fillStyle = '#e0447e';
  c.font = '700 34px "Mali", "ZCOOL KuaiLe", "Noto Sans SC", sans-serif';
  c.fillText(text.title, w / 2, top + 54);

  c.fillStyle = INK;
  c.font = '500 22px "Mali", "Noto Sans SC", sans-serif';
  wrapText(c, state.wish, w - 160, 3).forEach((line, i) => c.fillText(line, w / 2, top + 94 + i * 28));
  if (state.name) {
    c.fillStyle = '#7a6a8a';
    c.font = '600 19px "Mali", "Noto Sans SC", sans-serif';
    c.fillText('— ' + state.name + ' —', w / 2, top + 166);
  }
}

/**
 * Text broken into lines that fit `width` with the current font (at most `max` lines).
 * Breaks between words, Thai ones too (Thai has no spaces, so Intl.Segmenter finds them);
 * a word longer than a line is broken by letters.
 */
function wrapText(c, text, width, max) {
  const words = typeof Intl.Segmenter === 'function'
    ? Array.from(new Intl.Segmenter(undefined, { granularity: 'word' }).segment(text), (part) => part.segment)
    : Array.from(text);
  const lines = [''];
  const fits = (line) => c.measureText(line).width <= width;
  for (const word of words) {
    if (word === '\n') {
      lines.push('');
      continue;
    }
    const last = lines.length - 1;
    if (fits(lines[last] + word)) lines[last] += word;
    else if (fits(word.trimStart())) lines.push(word.trimStart());
    else for (const char of word) fits(lines[lines.length - 1] + char) ? (lines[lines.length - 1] += char) : lines.push(char);
  }
  return lines.map((line) => line.trim()).filter((line, i) => line || i === 0).slice(0, max);
}

/** A cream card with a thick cartoon outline and a hard shadow. */
function cartoonCard(c, x, y, w, h, r, fill = '#fffaf0') {
  c.save();
  c.fillStyle = INK;
  c.beginPath();
  c.roundRect(x, y + 10, w, h, r);
  c.fill();
  c.fillStyle = fill;
  c.strokeStyle = INK;
  c.lineWidth = 7;
  c.beginPath();
  c.roundRect(x, y, w, h, r);
  c.fill();
  c.stroke();
  c.restore();
}

/** Sizes of a story picture (Instagram / Facebook stories are 9:16). */
const STORY = { w: 1080, h: 1920, insets: { top: 360, right: 70, bottom: 720, left: 70 } };

/**
 * The words on a story picture, around the pagoda that renderScene drew with STORY.insets:
 * the SANDSIAM title on top, the blessing card, and an invitation with the site's address
 * so friends can come and build their own. text: {season, cta, site}.
 */
function drawStoryCard(c, w, h, state, text) {
  const font = (weight, size) => `${weight} ${size}px "Mali", "ZCOOL KuaiLe", "Noto Sans SC", sans-serif`;
  c.save();
  c.textAlign = 'center';
  c.lineJoin = 'round';

  // Title: chunky letters with a dark outline, readable over any sky.
  c.font = font(700, 120);
  c.lineWidth = 18;
  c.strokeStyle = INK;
  c.strokeText('SANDSIAM', w / 2, 200);
  c.fillStyle = '#ffc93c';
  c.fillText('SANDSIAM', w / 2, 200);
  c.font = font(700, 52);
  c.lineWidth = 12;
  c.strokeText(text.season, w / 2, 282);
  c.fillStyle = '#fff';
  c.fillText(text.season, w / 2, 282);

  // The blessing, and who made the pagoda.
  c.font = font(600, 46);
  const lines = wrapText(c, state.wish || '', w - 220, 3);
  const cardH = 90 + lines.length * 62 + (state.name ? 70 : 0);
  const cardY = h - 380 - cardH;
  cartoonCard(c, 60, cardY, w - 120, cardH, 48);
  c.fillStyle = INK;
  lines.forEach((line, i) => c.fillText(line, w / 2, cardY + 82 + i * 62));
  if (state.name) {
    c.font = font(700, 40);
    c.fillStyle = '#e0447e';
    c.fillText('— ' + state.name + ' —', w / 2, cardY + 82 + lines.length * 62 + 22);
  }

  // The invitation: what to do, and where.
  cartoonCard(c, 60, h - 320, w - 120, 210, 105, '#e0447e');
  c.fillStyle = '#fff';
  c.font = font(700, 54);
  c.fillText(text.cta, w / 2, h - 222);
  c.font = font(600, 36);
  c.fillStyle = '#ffe8a3';
  c.fillText(text.site, w / 2, h - 160);
  c.restore();
}

/**
 * Paints the full scene and returns the view transform used for hit testing.
 *
 * @param {CanvasRenderingContext2D} c
 * @param {number} w  CSS pixel width
 * @param {number} h  CSS pixel height
 * @param {object} opts
 *   state, image (a photo from placeBackdrop), zoom, selected,
 *   insets: {top,right,bottom,left} area kept clear for the interface,
 *   time, animate: seconds and whether ambient motion is drawn,
 *   bgZoom, nextImage, nextZoom, mix: slow push-in and crossfade to the next backdrop,
 *   reach: width the backdrop must also cover past the canvas (see backdropFit),
 *   fxPlace: which backdrop the effects belong to (defaults to state.place),
 *   reveal: 0…1 while the pagoda rises and decorations pop in (omit when done),
 *   cache: an object kept between frames to reuse the drawn pagoda,
 *   exporting: true for the PNG file, caption: {title} for that file (none on a story,
 *   which passes its own insets and draws its words with drawStoryCard).
 */
function renderScene(c, w, h, opts) {
  const { state, image, zoom = 1, selected = null, exporting = false } = opts;
  const insets = exporting ? opts.insets || { top: 90, right: 60, bottom: 230, left: 60 } : opts.insets;
  const animate = !exporting && !!opts.animate;
  const reveal = exporting || opts.reveal === undefined ? 1 : clamp01(opts.reveal);
  const place = opts.fxPlace ?? state.place;
  sceneClock.t = opts.time || 0;
  sceneClock.animate = animate;
  sceneClock.place = place;

  c.fillStyle = '#ead7b6';
  c.fillRect(0, 0, w, h);
  const reach = exporting ? 0 : opts.reach || 0;
  const map = drawBackground(c, w, h, image, exporting ? 1 : opts.bgZoom || 1, 1, reach);
  if (!exporting && opts.nextImage && opts.mix > 0) drawBackground(c, w, h, opts.nextImage, opts.nextZoom || opts.bgZoom || 1, opts.mix, reach);

  // Fit the artwork into the area left free by the interface.
  const roomW = Math.max(120, w - insets.left - insets.right);
  const roomH = Math.max(120, h - insets.top - insets.bottom);
  const artH = ART.bottom - ART.top;
  // On screen the pagoda keeps a little breathing room around it.
  const scale = Math.min(roomW / ART.width, roomH / artH) * (exporting ? 1 : 0.9 * zoom);
  const x = insets.left + roomW / 2;
  const y = insets.top + roomH / 2 - ((ART.top + ART.bottom) / 2) * scale;

  c.save();
  c.translate(x, y);
  c.scale(scale, scale);
  drawArtwork(c, state, { reveal, selected: exporting ? null : selected, cache: exporting ? null : opts.cache });
  if (!exporting && opts.guides) drawSnapGuides(c, state, opts.guides);
  c.restore();

  if (animate) drawEffects(c, w, h, sceneClock.t, place, map);
  if (exporting && opts.caption) drawExportCaption(c, w, h, state, opts.caption);
  return { x, y, scale };
}

/**
 * Whether a decoration stands behind the pagoda. A child can choose this in the
 * layers panel (o.back); otherwise poles planted high up go behind, the rest in front.
 */
const ornamentBehind = (o) => (typeof o.back === 'boolean' ? o.back : !!ORNAMENTS[o.type]?.pole && o.y < -110);

/** Decorations in the order they are painted: those behind the pagoda first, then the array order. */
function paintOrder(objects) {
  return [...objects.filter(ornamentBehind), ...objects.filter((o) => !ornamentBehind(o))];
}

/**
 * The pagoda with its decorations, at the current origin (the pagoda's foot).
 * Pieces behind it are painted first; within each side, later pieces sit in front.
 * While revealing, the pagoda rises from the sand and decorations pop in one by one.
 */
function drawArtwork(c, state, { reveal = 1, selected = null, cache = null } = {}) {
  scenePagoda = state;
  const count = Math.max(1, state.objects.length);
  const paint = (o, i) => {
    const k = reveal >= 1 ? 1 : clamp01((reveal - 0.45 - (0.45 * i) / count) / 0.15);
    if (k <= 0) return;
    c.save();
    c.translate(o.x, o.y);
    if (k < 1) c.scale(easeBack(k), easeBack(k));
    drawOrnament(c, o, selected === o.id);
    c.restore();
  };
  state.objects.forEach((o, i) => ornamentBehind(o) && paint(o, i));

  const rise = easeOut(clamp01(reveal / 0.5));
  if (rise < 1) {
    c.save();
    c.beginPath();
    c.rect(-320, -440, 640, 512);
    c.clip();
    c.translate(0, (1 - rise) * 400);
    drawPagoda(c, state);
    c.restore();
    drawDust(c, rise);
  } else {
    paintPagoda(c, state, cache);
  }

  state.objects.forEach((o, i) => !ornamentBehind(o) && paint(o, i));
}

/** Glowing dotted rings on the tiers where a dragged decoration will stick. */
function drawSnapGuides(c, state, heights) {
  c.save();
  c.setLineDash([6, 7]);
  c.lineWidth = 3;
  c.strokeStyle = 'rgba(255, 236, 120, 0.98)';
  c.shadowColor = 'rgba(255, 79, 154, 0.8)';
  c.shadowBlur = 8;
  for (const y of heights) {
    const w = y > 30 ? 150 : pagodaHalfWidth(state, y / state.height) + 6;
    const ry = y > 30 ? 14 : w * 0.24 * state.height;
    c.beginPath();
    c.ellipse(0, y, w, ry, 0, 0, Math.PI);
    c.stroke();
  }
  c.restore();
}
