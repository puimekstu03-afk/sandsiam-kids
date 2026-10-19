'use strict';

/**
 * SANDSIAM · Pagoda field storage.
 *
 * Every offered pagoda is an entry: { id, place, state, name, wish, updated, approved }.
 * Each player keeps one pagoda per region (offering again replaces it). Several
 * players can share one computer or account; each has their own player key.
 *
 * Published as a claude.ai Artifact, the field lives in the Artifact's shared
 * database: everyone who can open the page sees every pagoda, live. Anywhere
 * else (for example the local dev server) it falls back to this browser only.
 *
 * Database layout: one document per account, `pagodas/<their id>`:
 *   { places: { "<player>:<place>": { state, name, wish, updated } }, updated }
 * and one review per entry, `approvals/<entry id>`: { ok, updated }.
 * Access rules (declared at publish): everyone reads both; each account writes
 * only its own `pagodas` document; only teachers (page editors) write `approvals`.
 * A pagoda shows to others once a teacher approves that exact version.
 */
const LocalFieldStore = (() => {
  const KEY = 'sandsiam-field-v1';
  const ME_KEY = 'sandsiam-me';
  const MAX = 200;

  function read() {
    try {
      const rows = JSON.parse(localStorage.getItem(KEY) || '[]');
      return Array.isArray(rows) ? rows : [];
    } catch {
      return [];
    }
  }

  function write(rows) {
    localStorage.setItem(KEY, JSON.stringify(rows.slice(-MAX)));
  }

  function myId() {
    try {
      let id = localStorage.getItem(ME_KEY);
      if (!id) {
        id = 'me-' + Math.random().toString(36).slice(2, 10);
        localStorage.setItem(ME_KEY, id);
      }
      return id;
    } catch {
      return 'me-guest';
    }
  }

  return {
    shared: false,

    canReview: false,

    /** Entries for one region, newest first. On one device every pagoda counts as approved. */
    async list(place) {
      return read()
        .filter((row) => row.place === place)
        .map((row) => ({ ...row, approved: true, mine: true }))
        .sort((a, b) => b.updated - a.updated);
    },

    /** How many pagodas have been offered, in total and per region. */
    async count(places) {
      const rows = read();
      const byPlace = Array.from({ length: places }, (_, i) => rows.filter((row) => row.place === i).length);
      return { total: rows.length, byPlace };
    },

    /** Offers (or re-offers) this player's pagoda in its region. */
    async offer(state, player = 'guest') {
      const id = `${myId()}-${player}-${state.place}`;
      const rows = read();
      const updated = Date.now();
      const before = rows.find((row) => row.id === id);
      // created keeps the pagoda in the field it first went into.
      const entry = { id, place: state.place, state, name: state.name, wish: state.wish, updated, created: before ? before.created || before.updated : updated };
      write([...rows.filter((row) => row.id !== id), entry]);
      return entry;
    },

    /** Whether this device offered the pagoda. */
    async isMine(id) {
      return id.startsWith(myId() + '-');
    },

    async review() {
      /* Nothing to review on one device. */
    },
  };
})();
