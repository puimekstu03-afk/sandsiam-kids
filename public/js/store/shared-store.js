'use strict';

/** The Artifact's shared database, kept live with one subscription. */
function createSharedFieldStore(db, uid, canWrite, canReview, changed) {
  let docs = [];
  let reviews = new Map();
  let ready = false;
  db.collection('approvals').onSnapshot(
    (snap) => {
      reviews = new Map(snap.docs.filter((d) => d.exists).map((d) => [d.id, d.data() || {}]));
      changed();
    },
    (err) => console.warn('SANDSIAM reviews unavailable:', err.code)
  );
  db.collection('pagodas').onSnapshot(
    (snap) => {
      docs = snap.docs.filter((d) => d.exists).map((d) => ({ id: d.id, data: d.data() || {} }));
      ready = true;
      changed();
    },
    (err) => console.warn('SANDSIAM field unavailable:', err.code)
  );

  const entries = () =>
    docs.flatMap((d) =>
      Object.entries(d.data.places && typeof d.data.places === 'object' ? d.data.places : {})
        .filter(([key, e]) => /^[a-z0-9]{1,12}:\d$/.test(key) && e && typeof e === 'object')
        .map(([key, e]) => {
          const [player, place] = key.split(':');
          const id = `${d.id}-${player}-${place}`;
          const updated = Number(e.updated) || 0;
          const review = reviews.get(id);
          return {
            id,
            owner: d.id,
            place: Number(place),
            state: e.state,
            name: typeof e.name === 'string' ? e.name.slice(0, 40) : '',
            wish: typeof e.wish === 'string' ? e.wish.slice(0, 180) : '',
            updated,
            created: Number(e.created) || updated,
            approved: !!review && review.ok === true && Number(review.updated) === updated,
            hidden: !!review && review.ok === false && Number(review.updated) === updated,
            mine: d.id === uid,
          };
        })
    );
  // Others see approved pagodas; you always see your own; teachers see everything.
  const visible = () => entries().filter((e) => canReview || e.approved || e.mine);

  return {
    shared: true,
    get ready() {
      return ready;
    },
    canWrite,
    canReview,

    async list(place) {
      return visible()
        .filter((e) => e.place === place)
        .sort((a, b) => b.updated - a.updated);
    },

    /** Counts approved pagodas only, so the number everyone sees is the same. */
    async count(places) {
      const all = entries().filter((e) => e.approved);
      return { total: all.length, byPlace: Array.from({ length: places }, (_, i) => all.filter((e) => e.place === i).length) };
    },

    async offer(state, player = 'guest') {
      if (!uid) throw Object.assign(new Error('No identity on this page'), { code: 'no_identity' });
      const mine = docs.find((d) => d.id === uid);
      const places = { ...(mine && mine.data.places ? mine.data.places : {}) };
      const updated = Date.now();
      const key = `${player}:${state.place}`;
      const created = (places[key] && Number(places[key].created)) || (places[key] && Number(places[key].updated)) || updated;
      places[key] = { state, name: state.name, wish: state.wish, updated, created };
      await db.doc('pagodas/' + uid).set({ places, updated });
      return { id: `${uid}-${player}-${state.place}`, place: state.place, state, name: state.name, wish: state.wish, updated };
    },

    async isMine(id) {
      return !!uid && id.startsWith(uid + '-');
    },

    /** Teacher review: show (ok) or hide this exact version of a pagoda. */
    async review(entry, ok) {
      if (!canReview) return;
      await db.doc('approvals/' + entry.id).set({ ok, updated: entry.updated });
    },
  };
}
