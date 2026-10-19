'use strict';

/** SANDSIAM · Stickers: one reward sticker per finished step, kept per player (needs players.js). */
const Stickers = (() => {
  const key = () => 'sandsiam-stickers:' + (Players.current()?.id || 'guest');
  return {
    earned() {
      try {
        const list = JSON.parse(localStorage.getItem(key()) || '[]');
        return Array.isArray(list) ? list.filter((n) => Number.isInteger(n)) : [];
      } catch {
        return [];
      }
    },
    /** Gives the sticker for a finished step; true when it is new. */
    give(step) {
      const list = this.earned();
      if (list.includes(step)) return false;
      try {
        localStorage.setItem(key(), JSON.stringify([...list, step]));
      } catch {
        return false;
      }
      return true;
    },
  };
})();
