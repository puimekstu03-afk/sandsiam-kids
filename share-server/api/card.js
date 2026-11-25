// SANDSIAM Kids · the share server: /p/<public id of a pagoda in the field>.
//
// Facebook, X and LINE read the tags on this page and show that child's own pagoda under the
// link; people are sent straight on to the game, which opens the same pagoda (?id=…).
// GitHub Pages can't do this (one fixed page for everyone), so it runs as a Vercel function.
// It only reads what the field already shows to everyone (field_card in
// supabase/migrations/20261125120000_share_card.sql), with the publishable key.

const SITE = 'https://puimekstu03-afk.github.io/sandsiam-kids/';
const SUPABASE = 'https://uwhqcqyferxicsjftfeq.supabase.co';
const KEY = 'sb_publishable_ZY_7LDbGP93l7FTGDVbW2A_U4oMopR6';
const ID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const IMAGE = /^[0-9a-f-]{36}\.jpg$/;

const escape = (text) => String(text).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** The pagoda, null when there is none (or it was hidden), undefined when the field can't be reached. */
async function pagoda(id) {
  if (!ID.test(id || '')) return null;
  try {
    const res = await fetch(`${SUPABASE}/rest/v1/rpc/field_card`, {
      method: 'POST',
      headers: { apikey: KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_id: id }),
      signal: AbortSignal.timeout(4000),
    });
    return res.ok ? await res.json() : undefined;
  } catch {
    return undefined;
  }
}

export async function GET(request) {
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  const card = await pagoda(id);

  const name = card && String(card.name || '').slice(0, 40);
  const title = name ? `เจดีย์ทรายของ ${name} · SANDSIAM` : 'SANDSIAM · ก่อเจดีย์ทรายวันสงกรานต์';
  const about = (card && String(card.wish || '').slice(0, 180)) || 'มาก่อเจดีย์ทรายของคุณเอง ตกแต่ง เขียนคำอวยพร แล้วนำไปตั้งที่ลานเจดีย์กับเพื่อน ๆ ทั่วประเทศ';
  const own = card && IMAGE.test(card.image || '');
  const image = own ? `${SUPABASE}/storage/v1/object/public/pagoda-images/${card.image}` : `${SITE}assets/share/card.jpg`;
  const target = card ? `${SITE}?id=${id}` : SITE;
  const nonce = crypto.randomUUID();

  // No <meta refresh>: a preview robot might follow it and read the game's page instead.
  const html = `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>
<meta name="robots" content="noindex">
<meta name="description" content="${escape(about)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="SANDSIAM">
<meta property="og:title" content="${escape(title)}">
<meta property="og:description" content="${escape(about)}">
<meta property="og:image" content="${escape(image)}">
<meta property="og:image:type" content="image/jpeg">
<meta property="og:image:alt" content="${escape(title)}">
<meta name="twitter:card" content="summary_large_image">
</head>
<body>
<p><a href="${escape(target)}">${escape(title)}</a></p>
<script nonce="${nonce}">location.replace(${JSON.stringify(target)});</script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // Short, so a re-offered or hidden pagoda changes soon; not kept at all when the field was out of reach.
      'Cache-Control': card === undefined ? 'no-store' : 'public, max-age=0, s-maxage=120',
      'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    },
  });
}
