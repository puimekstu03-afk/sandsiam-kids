'use strict';

/**
 * SANDSIAM · Pagoda field in Supabase (project "sandsiam", supabase/migrations/).
 *
 * Open to everyone, no sign-in or codes: this browser keeps a random device id (never shown
 * to others). Reading goes through database functions with the publishable key, which is
 * meant to be public. Writing (offering a pagoda with its picture, noting a visit) goes
 * only through the Edge Function `field` (supabase/functions/field/), which limits how
 * much each internet address can write and checks for rude words again.
 */
const SUPABASE = {
  url: 'https://uwhqcqyferxicsjftfeq.supabase.co',
  key: 'sb_publishable_ZY_7LDbGP93l7FTGDVbW2A_U4oMopR6',
};

function createSupabaseFieldStore(changed) {
  const DEVICE_KEY = 'sandsiam-me'; // same id as the local field, so "mine" carries over
  const REFRESH_MS = 30000;

  function deviceId() {
    try {
      let id = localStorage.getItem(DEVICE_KEY);
      if (!/^[a-z0-9-]{4,40}$/.test(id || '')) {
        id = 'me-' + Math.random().toString(36).slice(2, 10);
        localStorage.setItem(DEVICE_KEY, id);
      }
      return id;
    } catch {
      return 'me-guest';
    }
  }

  const device = deviceId();
  const mine = new Set(); // public ids of this device's pagodas
  const remember = (rows) => rows.forEach((e) => e.mine && mine.add(e.id));
  const playerId = (player) => (/^[a-z0-9]{1,12}$/.test(player || '') ? player : 'guest');

  async function rpc(name, body = {}) {
    const res = await fetch(`${SUPABASE.url}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { apikey: SUPABASE.key, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw Object.assign(new Error((data && data.message) || res.statusText), { code: data && data.code });
    return data;
  }

  /** Posts to the Edge Function; resolves its JSON, or throws with `code` (busy, slow_down, full, not_polite …). */
  async function write(action, data, picture = null) {
    const form = new FormData();
    form.append('action', action);
    form.append('data', JSON.stringify(data));
    if (picture) form.append('picture', picture, 'pagoda.jpg');
    // A plain form post: no extra headers, so the browser sends it without a preflight.
    const res = await fetch(`${SUPABASE.url}/functions/v1/field`, { method: 'POST', body: form });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw Object.assign(new Error((body && body.error) || res.statusText), { code: (body && body.error) || 'failed' });
    return body;
  }

  // Pick up pagodas offered elsewhere while the page stays open: a small check every
  // REFRESH_MS, and the field is fetched again only when the numbers or latest change moved.
  let seen = null;
  async function check() {
    if (document.hidden) return;
    try {
      const c = await rpc('field_counts');
      const now = `${c.total}:${c.stamp}`;
      if (seen !== null && now !== seen) changed();
      seen = now;
    } catch {
      /* Offline for now: the next check tries again. */
    }
  }
  setInterval(check, REFRESH_MS);
  document.addEventListener('visibilitychange', check);
  check();

  return {
    shared: true,
    canWrite: true,
    canReview: false,

    async list(place) {
      const rows = await rpc('field_list', { p_place: place, p_device: device });
      remember(rows);
      return rows;
    },

    async page(place, page, size) {
      const res = await rpc('field_page', { p_place: place, p_page: page, p_device: device, p_size: size });
      remember(res.entries);
      return res;
    },

    async count(places) {
      const c = await rpc('field_counts');
      return {
        total: Number(c.total) || 0,
        byPlace: Array.from({ length: places }, (_, i) => Number(c.byPlace[i]) || 0),
        people: Number(c.people) || 0,
      };
    },

    /** Offers the pagoda with its picture (a JPEG Blob, optional). */
    async offer(state, player = 'guest', picture = null) {
      const entry = await write(
        'offer',
        {
          device,
          player: playerId(player),
          place: state.place,
          state,
          name: String(state.name || '').slice(0, 40),
          wish: String(state.wish || '').slice(0, 180),
        },
        picture,
      );
      remember([entry]);
      changed();
      return entry;
    },

    async isMine(id) {
      return mine.has(id);
    },

    /** Notes that someone opened the page ('open') or started building ('play'). */
    async logVisit(kind, player = 'guest') {
      try {
        await write('visit', { device, player: playerId(player), kind });
      } catch {
        /* Counting never gets in the way of playing. */
      }
    },

    async review() {
      /* Open field: nothing to review. */
    },
  };
}
