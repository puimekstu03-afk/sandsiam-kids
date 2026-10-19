'use strict';

/**
 * SANDSIAM · The saved pagoda: its default shape and the check that cleans
 * stored or shared data. Needs core.js, ornaments/catalog.js and config.js.
 */

const defaults = () => ({ v: 1, place: 0, shape: 0, base: 0, height: 1, sand: 0, objects: [], name: '', wish: '' });
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** Cleans stored or shared data so it can never break the app. */
function validate(s) {
  if (!s || s.v !== 1) throw Error('Invalid version');
  const d = defaults();
  for (const [key, max] of [['place', PLACES.length - 1], ['shape', 2], ['base', 1], ['sand', 2]]) {
    if (Number.isInteger(s[key])) d[key] = clamp(s[key], 0, max);
  }
  d.height = typeof s.height === 'number' && Number.isFinite(s.height) ? clamp(s.height, 0.75, 1.2) : 1;
  d.name = typeof s.name === 'string' ? s.name.slice(0, 40) : '';
  d.wish = typeof s.wish === 'string' ? s.wish.slice(0, 180) : '';
  d.objects = (Array.isArray(s.objects) ? s.objects : [])
    .slice(0, MAX_OBJECTS)
    .filter((o) => o && Number.isInteger(o.type) && o.type >= 0 && o.type < ITEM_COUNT && Number.isFinite(o.x) && Number.isFinite(o.y))
    .map((o, i) => ({
      id: i + 1,
      type: o.type,
      color: COLOR_CHOICES.includes(o.color) ? o.color : ORIGINAL,
      x: isRing(o.type) ? 0 : clamp(o.x, BOUNDS.minX, BOUNDS.maxX),
      y: clamp(o.y, BOUNDS.minY, BOUNDS.maxY),
      size: Number.isFinite(o.size) ? clamp(o.size, 0.6, 1.5) : 1,
      // Chosen in the layers panel: true behind the pagoda, false in front (absent: automatic).
      ...(typeof o.back === 'boolean' ? { back: o.back } : {}),
      // Mirrored left to right (flower rings are round, so they never flip).
      ...(o.flip === true && !isRing(o.type) ? { flip: true } : {}),
    }));
  return d;
}
