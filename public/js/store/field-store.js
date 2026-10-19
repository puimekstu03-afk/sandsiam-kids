'use strict';

/**
 * The store the app uses: the Supabase field when it is set up (supabase-store.js).
 * Without it, starts local and switches to the Artifact's shared database as soon as
 * the Artifact viewer provides it. `onChange` hears every update.
 */
const fieldStore = (() => {
  const listeners = new Set();
  const notify = () => listeners.forEach((fn) => fn());
  let backend = SUPABASE.url && SUPABASE.key ? createSupabaseFieldStore(notify) : LocalFieldStore;

  (async () => {
    if (backend !== LocalFieldStore) return;
    if (!window.claude || typeof window.claude.use !== 'function') return;
    try {
      const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
      if (!db) return;
      const uid = user ? await user.id() : null;
      const canWrite = user ? await user.can('data.write') : null;
      const canReview = user ? await user.canEdit() : false;
      backend = createSharedFieldStore(db, uid, uid !== null && canWrite !== false, canReview, notify);
      notify();
    } catch (err) {
      console.warn('SANDSIAM shared field not available', err);
    }
  })();

  /**
   * One field (ลาน) of a region, for backends that only list: pagodas line up in the order
   * they were first offered, `size` to a field, so a full field opens the next one.
   */
  async function pageFromList(place, page, size) {
    const lined = (await backend.list(place))
      .filter((e) => !e.hidden)
      .sort((a, b) => (a.created || a.updated) - (b.created || b.updated) || (a.id < b.id ? -1 : 1));
    const pages = Math.max(1, Math.ceil(lined.length / size));
    const at = page == null ? pages - 1 : Math.max(0, Math.min(pages - 1, page));
    const latestMine = lined.filter((e) => e.mine).sort((a, b) => b.updated - a.updated)[0];
    return {
      page: at,
      pages,
      mine: latestMine ? Math.floor(lined.indexOf(latestMine) / size) : null,
      entries: lined.slice(at * size, at * size + size).sort((a, b) => b.updated - a.updated),
    };
  }

  return {
    get shared() {
      return backend.shared;
    },
    /** false when this viewer can look but not offer (view-only, or no identity). */
    get canWrite() {
      return backend.shared ? backend.canWrite : true;
    },
    /** Teachers (page editors) can approve or hide pagodas. */
    get canReview() {
      return !!backend.canReview;
    },
    list: (place) => backend.list(place),
    /** One field of a region: { page, pages, mine, entries }; page null = the newest field. */
    page: (place, page, size) => (backend.page ? backend.page(place, page, size) : pageFromList(place, page, size)),
    count: (places) => backend.count(places),
    offer: (state, player, picture) => backend.offer(state, player, picture),
    /** Notes a visit ('open' or 'play') where the backend counts them (Supabase). */
    logVisit: (kind, player) => (backend.logVisit ? backend.logVisit(kind, player) : Promise.resolve()),
    isMine: (id) => backend.isMine(id),
    review: (entry, ok) => backend.review(entry, ok),
    onChange(fn) {
      listeners.add(fn);
    },
  };
})();
