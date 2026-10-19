'use strict';

/**
 * SANDSIAM · Pagoda field in Supabase (project "sandsiam", supabase/migrations/).
 *
 * Open to everyone, no sign-in or codes: this browser keeps a random device id (never shown
 * to others), and every call goes through a database function that checks its input.
 * A pagoda shows in the field as soon as it is offered, with a picture of it kept in the
 * `pagoda-images` bucket. Opening the page and starting to build are noted in `visits`,
 * so the field can count who came to play. The publishable key is meant to be public:
 * the tables themselves are closed to it.
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

  /** Uploads a JPEG of the pagoda; resolves its file name, or null if it didn't go. */
  async function upload(picture) {
    if (!picture) return null;
    const name = (crypto.randomUUID ? crypto.randomUUID() : fallbackUuid()) + '.jpg';
    try {
      const res = await fetch(`${SUPABASE.url}/storage/v1/object/pagoda-images/${name}`, {
        method: 'POST',
        headers: { apikey: SUPABASE.key, 'Content-Type': 'image/jpeg' },
        body: picture,
      });
      return res.ok ? name : null;
    } catch {
      return null; // the pagoda still goes in the field without its picture
    }
  }

  function fallbackUuid() {
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }

  // Pick up pagodas offered elsewhere while the page stays open.
  setInterval(() => {
    if (!document.hidden) changed();
  }, REFRESH_MS);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) changed();
  });

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
        players: Number(c.players) || 0,
      };
    },

    /** Offers the pagoda with its picture (a JPEG Blob, optional). */
    async offer(state, player = 'guest', picture = null) {
      const entry = await rpc('offer_pagoda', {
        p_device: device,
        p_player: playerId(player),
        p_place: state.place,
        p_state: state,
        p_name: String(state.name || '').slice(0, 40),
        p_wish: String(state.wish || '').slice(0, 180),
        p_image: await upload(picture),
      });
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
        await rpc('log_visit', { p_device: device, p_player: playerId(player), p_kind: kind });
      } catch {
        /* Counting never gets in the way of playing. */
      }
    },

    async review() {
      /* Open field: nothing to review. */
    },
  };
}
