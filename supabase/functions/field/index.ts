// SANDSIAM Kids · the only way to write to the pagoda field.
//
// The app posts a form here (no sign-in, no key needed: verify_jwt is off in config.toml):
//   action=offer  data={device, player, place, state, name, wish}  picture=<JPEG, optional>
//   action=visit  data={device, player, kind}
// The database functions it calls are closed to the publishable key, and limit each
// internet address (stored only as a salted hash), so a script can't flood the field,
// the picture store or the visit counts.

import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const BUCKET = 'pagoda-images';
const MAX_PICTURE = 400 * 1024;
const MAX_DATA = 40 * 1024;

const secretKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}').default;
const db = createClient(Deno.env.get('SUPABASE_URL')!, secretKey, { auth: { persistSession: false } });

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'apikey, authorization, content-type, x-client-info',
};

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

/** The visitor's address as Cloudflare saw it (the client can't forge this one). */
function clientIp(req: Request): string {
  return req.headers.get('cf-connecting-ip') ?? req.headers.get('x-real-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown';
}

/** Database errors the app understands; anything else is a plain failure. */
function failure(error: { code?: string; message?: string }) {
  if (error.code === 'P0429') return reply({ error: error.message }, 429); // busy · wait · slow_down · full
  if (error.code === 'P0422') return reply({ error: 'not_polite' }, 422);
  if (error.code === '23514' || error.code === '22P02') return reply({ error: 'bad_input' }, 400);
  console.error('field write failed', error);
  return reply({ error: 'failed' }, 500);
}

const isJpeg = (bytes: Uint8Array) => bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;

async function offer(ip: string, data: Record<string, unknown>, picture: File | null) {
  const { data: entry, error } = await db.rpc('field_offer', {
    p_ip: ip,
    p_device: String(data.device ?? ''),
    p_player: String(data.player ?? ''),
    p_place: Number(data.place),
    p_state: data.state,
    p_name: String(data.name ?? '').slice(0, 40),
    p_wish: String(data.wish ?? '').slice(0, 180),
  });
  if (error) return failure(error);
  const { key, ...shown } = entry as { key: string; image: string | null };

  // The picture is a bonus: the pagoda is already in the field if this part fails.
  if (picture && picture.size <= MAX_PICTURE) {
    const bytes = new Uint8Array(await picture.arrayBuffer());
    if (isJpeg(bytes)) {
      const name = crypto.randomUUID() + '.jpg';
      const up = await db.storage.from(BUCKET).upload(name, bytes, { contentType: 'image/jpeg', upsert: false });
      if (!up.error) {
        const { data: old, error: attachError } = await db.rpc('field_set_image', { p_key: key, p_image: name });
        if (attachError) {
          await db.storage.from(BUCKET).remove([name]);
        } else {
          shown.image = name;
          if (old && old !== name) await db.storage.from(BUCKET).remove([old as string]);
        }
      }
    }
  }

  // Now and then, sweep pictures nobody uses (a failed attach, an older upload).
  if (Math.random() < 0.05) {
    const { data: stale } = await db.rpc('field_stale_images', { p_limit: 50 });
    if (Array.isArray(stale) && stale.length) await db.storage.from(BUCKET).remove(stale as string[]);
  }
  return reply(shown);
}

async function visit(ip: string, data: Record<string, unknown>) {
  const { error } = await db.rpc('field_visit', {
    p_ip: ip,
    p_device: String(data.device ?? ''),
    p_player: String(data.player ?? ''),
    p_kind: String(data.kind ?? ''),
  });
  return error ? failure(error) : reply({ ok: true });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return reply({ error: 'method' }, 405);
  try {
    const form = await req.formData();
    const raw = String(form.get('data') ?? '');
    if (raw.length > MAX_DATA) return reply({ error: 'bad_input' }, 400);
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return reply({ error: 'bad_input' }, 400);
    const ip = clientIp(req);
    const action = form.get('action');
    if (action === 'offer') {
      const picture = form.get('picture');
      return await offer(ip, data, picture instanceof File ? picture : null);
    }
    if (action === 'visit') return await visit(ip, data);
    return reply({ error: 'bad_input' }, 400);
  } catch (err) {
    console.error('field request failed', err);
    return reply({ error: 'bad_input' }, 400);
  }
});
