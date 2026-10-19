'use strict';

/** SANDSIAM · Players: nicknames on a shared classroom computer, each with their own work. */
const Players = (() => {
  const LIST_KEY = 'sandsiam-players';
  const CURRENT_KEY = 'sandsiam-player';

  const read = (key, fallback) => {
    try {
      const value = JSON.parse(localStorage.getItem(key));
      return value ?? fallback;
    } catch {
      return fallback;
    }
  };
  const write = (key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* Private window: players last for this visit only. */
    }
  };

  // The current player is remembered for this tab only, so the next child
  // at a shared computer is always asked who is playing.
  let current = null;
  try {
    current = sessionStorage.getItem(CURRENT_KEY);
  } catch {
    current = null;
  }

  return {
    list() {
      const rows = read(LIST_KEY, []);
      return Array.isArray(rows) ? rows.filter((p) => p && typeof p.id === 'string' && typeof p.name === 'string') : [];
    },
    current() {
      return this.list().find((p) => p.id === current) || null;
    },
    choose(id) {
      current = id;
      try {
        sessionStorage.setItem(CURRENT_KEY, id);
      } catch {
        /* Not remembered across reloads. */
      }
    },
    add(name) {
      const player = { id: 'p' + Math.random().toString(36).slice(2, 8), name: name.trim().slice(0, 20) };
      write(LIST_KEY, [...this.list(), player]);
      this.choose(player.id);
      return player;
    },
    remove(id) {
      write(LIST_KEY, this.list().filter((p) => p.id !== id));
      try {
        localStorage.removeItem('sandsiam-v1:' + id);
        localStorage.removeItem('sandsiam-stickers:' + id);
      } catch {
        /* Nothing more to clean. */
      }
      if (current === id) {
        current = null;
        try {
          sessionStorage.removeItem(CURRENT_KEY);
        } catch {
          /* Ignore. */
        }
      }
    },
    /** Where this player's work is saved on this device. */
    storageKey() {
      return 'sandsiam-v1:' + (current || 'guest');
    },
  };
})();
