'use strict';

/**
 * SANDSIAM · Layer order for the layers panel.
 *
 * The panel lists everything front to back, with the pagoda itself as one row:
 *   [pieces in front, nearest first] · PAGODA · [pieces behind, nearest first]
 * The pagoda row is `null` in these lists. Moving a piece past it puts the piece
 * behind (or in front of) the pagoda. Needs render.js (ornamentBehind) and state.js (clamp).
 */

/** The panel's rows, front first; `null` stands for the pagoda. */
function layerStack(objects) {
  const front = objects.filter((o) => !ornamentBehind(o)).reverse();
  const back = objects.filter(ornamentBehind).reverse();
  return [...front, null, ...back];
}

/** Turns panel rows back into the objects array (paint order), fixing each piece's side. */
function objectsFromStack(stack) {
  const p = stack.indexOf(null);
  const front = stack.slice(0, p).map((o) => ({ ...o, back: false }));
  const back = stack.slice(p + 1).map((o) => ({ ...o, back: true }));
  return [...back.reverse(), ...front.reverse()];
}

/** Moves a piece to row `to` of the panel (0 = front). */
function moveLayerTo(objects, id, to) {
  const stack = layerStack(objects);
  const from = stack.findIndex((o) => o && o.id === id);
  if (from < 0) return objects;
  const target = clamp(to, 0, stack.length - 1);
  if (target === from) return objects;
  const [piece] = stack.splice(from, 1);
  stack.splice(target, 0, piece);
  return objectsFromStack(stack);
}

/** Moves a piece one row towards the front (delta −1) or the back (+1). */
function moveLayerBy(objects, id, delta) {
  const from = layerStack(objects).findIndex((o) => o && o.id === id);
  return from < 0 ? objects : moveLayerTo(objects, id, from + delta);
}
