'use strict';

/**
 * SANDSIAM · Links that open a pagoda for someone else: <page>?p=<data>.
 *
 * The pagoda's numbers are rounded to two decimals and the whole thing is deflate-
 * compressed, so even 40 decorations fit a short link (about 1.5 KB) that Facebook, X and
 * LINE accept. A browser without CompressionStream writes ?art=<plain data> instead, and
 * links from before (#art=…) still open. The data is checked with validate() before use.
 *
 * A pagoda in the field has a shorter link, <page>?id=<its public id>: the share server
 * (share-server/) sends visitors there after showing its picture to Facebook, X and LINE.
 */
const ShareLink = (() => {
  const MAX = 24000;
  const toBase64 = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const fromBase64 = (text) => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), (ch) => ch.charCodeAt(0));
  const through = async (bytes, stream) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
  const compact = (state) => JSON.stringify(state, (key, v) => (typeof v === 'number' && !Number.isInteger(v) ? Math.round(v * 100) / 100 : v));

  /** The shared data in an address: { data, packed }, or null. */
  function find(loc) {
    const query = new URLSearchParams(loc.search);
    if (query.has('p')) return { data: query.get('p'), packed: true };
    if (query.has('art')) return { data: query.get('art'), packed: false };
    if (loc.hash.startsWith('#art=')) return { data: loc.hash.slice(5), packed: false };
    return null;
  }

  const ID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;

  return {
    /** Whether this is the public id of a pagoda in the field. */
    isId: (id) => ID.test(id || ''),

    /** The field pagoda this address opens, or null. */
    id(loc) {
      const id = new URLSearchParams(loc.search).get('id');
      return ID.test(id || '') ? id : null;
    },

    /** The part to add to the page's address, e.g. "?p=…". */
    async encode(state) {
      const bytes = new TextEncoder().encode(compact(state));
      if (typeof CompressionStream === 'function') return '?p=' + toBase64(await through(bytes, new CompressionStream('deflate-raw')));
      return '?art=' + toBase64(bytes);
    },

    /** Whether this address opens a shared pagoda. */
    has(loc) {
      return find(loc) !== null || new URLSearchParams(loc.search).has('id');
    },

    /** The shared pagoda in this address (not yet validated); throws when it is broken. */
    async decode(loc) {
      const found = find(loc);
      if (!found) return null;
      if (found.data.length > MAX) throw Error('Too long');
      let bytes = fromBase64(found.data);
      if (found.packed) bytes = await through(bytes, new DecompressionStream('deflate-raw'));
      if (bytes.length > MAX * 4) throw Error('Too long');
      return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    },
  };
})();
