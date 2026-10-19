-- SANDSIAM Kids · a safer, steadier field.
--
-- Writing now goes only through the Edge Function `field` (supabase/functions/field/),
-- which knows the visitor's internet address. The publishable key can still read the
-- field, but can no longer offer, upload pictures or note visits by itself, so nobody
-- can fill the database or the picture store with a script.
--
-- · Limits per address (kept as a salted hash, never the address itself) and in total.
-- · The rude-word check runs here too, so it can't be skipped.
-- · Each pagoda keeps a fixed number in its region (seq): field n holds seq 12n+1…12n+12,
--   so hiding a pagoda leaves a gap instead of moving everyone after it.
-- · Old pictures are deleted when a pagoda gets a new one (by the Edge Function).
-- · pg_cron trims the address log hourly and folds old visits into daily totals.

create extension if not exists pg_cron;

-- ---------------------------------------------------------------- limits

create table private.settings (
  id int primary key default 1 check (id = 1),
  salt text not null
);
insert into private.settings (salt) values (encode(extensions.gen_random_bytes(24), 'hex'));

-- One row per write, by hashed address; kept for a day.
create table private.write_log (
  who text not null,
  kind text not null check (kind in ('offer', 'visit')),
  at timestamptz not null default now()
);
create index write_log_who on private.write_log (who, kind, at);
create index write_log_kind on private.write_log (kind, at);

/** Null when this address may write now (and counts the write), else 'busy' or 'slow_down'. */
create function private.allow(p_ip text, p_kind text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  w text := left(encode(extensions.digest(coalesce(p_ip, '') || (select salt from private.settings), 'sha256'), 'hex'), 32);
  mine_minute int;
begin
  if p_kind = 'offer' then
    -- A whole school may offer at once (one address behind the school router), so the
    -- per-address limits are generous; the total keeps one minute from overloading.
    if (select count(*) from private.write_log where kind = 'offer' and at > now() - interval '1 minute') >= 300 then
      return 'busy';
    end if;
    select count(*) into mine_minute from private.write_log where who = w and kind = 'offer' and at > now() - interval '1 minute';
    if mine_minute >= 30
       or (select count(*) from private.write_log where who = w and kind = 'offer' and at > now() - interval '1 hour') >= 300
       or (select count(*) from private.write_log where who = w and kind = 'offer' and at > now() - interval '1 day') >= 800 then
      return 'slow_down';
    end if;
  else
    if (select count(*) from private.write_log where kind = 'visit' and at > now() - interval '1 minute') >= 1000 then
      return 'busy';
    end if;
    if (select count(*) from private.write_log where who = w and kind = 'visit' and at > now() - interval '1 hour') >= 1500 then
      return 'slow_down';
    end if;
  end if;
  insert into private.write_log (who, kind) values (w, p_kind);
  return null;
end;
$$;

-- ---------------------------------------------------------------- polite words

/**
 * True when the text looks free of rude words. Keep in step with js/kids/polite.js:
 * words that only look rude are taken out first (ห่างไกล, สกู๊ตเตอร์, แม่งาน …), and
 * short English words count only as whole words (Sussex, Dickens are fine).
 */
create function private.is_polite(p_text text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  raw text := lower(coalesce(p_text, ''));
  plain text;
  w text;
begin
  if raw ~ '\m(dick|damn|sex)\M' then
    return false;
  end if;
  plain := regexp_replace(raw, '[\s._*!@#$%^&()​‌‍﻿-]+', '', 'g');
  foreach w in array array[
    'ห่าง', 'ห่าน', 'ห่าม', 'หีบ', 'สัดส่วน', 'สัดว์', 'กู้', 'กูเกิล', 'กูรู', 'กูด', 'สกู๊ต', 'สกู',
    'แม่งาม', 'แม่งาน', 'ทองกวาว', 'ทองอุไร', 'ทองหลาง'
  ] loop
    plain := replace(plain, w, '');
  end loop;
  foreach w in array array[
    'ควย', 'เหี้ย', 'สัส', 'สัด', 'เย็ด', 'หี', 'แม่ง', 'มึง', 'กู', 'ไอ้สัตว์', 'อีดอก', 'ระยำ', 'ชาติชั่ว', 'ส้นตีน', 'ตอแหล', 'ห่า', 'จัญไร', 'ดอกทอง', 'โง่', 'ควาย',
    'fuck', 'shit', 'bitch', 'bastard', 'pussy', 'asshole', 'stupid', 'idiot'
  ] loop
    if position(w in plain) > 0 then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

-- ---------------------------------------------------------------- fixed places in the field

alter table public.pagodas add column seq int;
update public.pagodas p
set seq = n.seq
from (select id, row_number() over (partition by place order by created_at, id)::int as seq from public.pagodas) n
where n.id = p.id;
alter table public.pagodas alter column seq set not null;
alter table public.pagodas add constraint pagodas_place_seq unique (place, seq);
create index pagodas_field on public.pagodas (place, seq) where status = 'approved';
create unique index pagodas_image on public.pagodas (image_path) where image_path is not null;

-- ---------------------------------------------------------------- writing (Edge Function only)

drop function public.offer_pagoda(text, text, int, jsonb, text, text, text);
drop function public.log_visit(text, text, text);

drop policy "Anyone can add a pagoda picture" on storage.objects;
update storage.buckets set file_size_limit = 409600 where id = 'pagoda-images';

/**
 * Offers (or re-offers) a child's pagoda for the Edge Function. Returns the field entry
 * plus `key`, the row id the function needs to attach the picture (never sent on).
 * Raises P0429 'busy' / 'slow_down' / 'full', or P0422 'not_polite'.
 */
create function public.field_offer(
  p_ip text,
  p_device text,
  p_player text,
  p_place int,
  p_state jsonb,
  p_name text,
  p_wish text
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_id text := p_device || '-' || p_player || '-' || p_place;
  stamp bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  verdict text;
  next_seq int;
  p public.pagodas;
begin
  if not private.is_polite(p_name) or not private.is_polite(p_wish) then
    raise exception 'not_polite' using errcode = 'P0422';
  end if;
  verdict := private.allow(p_ip, 'offer');
  if verdict is not null then
    raise exception '%', verdict using errcode = 'P0429';
  end if;
  if not exists (select 1 from public.pagodas where id = row_id)
     and (select count(*) from public.pagodas) >= 20000 then
    raise exception 'full' using errcode = 'P0429';
  end if;

  -- One offer at a time per region, so each new pagoda gets the next number.
  perform pg_advisory_xact_lock(7311, p_place);
  select coalesce(max(seq), 0) + 1 into next_seq from public.pagodas where place = p_place;

  insert into public.pagodas as t (id, device, player, place, state, name, wish, updated, status, seq)
  values (row_id, p_device, p_player, p_place, p_state, coalesce(p_name, ''), coalesce(p_wish, ''), stamp, 'approved', next_seq)
  on conflict (id) do update
    set state = excluded.state,
        name = excluded.name,
        wish = excluded.wish,
        updated = excluded.updated,
        status = case when t.status = 'hidden' then 'hidden' else 'approved' end,
        offered_at = now()
  returning * into p;

  return json_build_object(
    'key', p.id, 'id', p.public_id::text, 'place', p.place, 'state', p.state, 'name', p.name, 'wish', p.wish,
    'updated', p.updated, 'approved', p.status = 'approved', 'hidden', p.status = 'hidden', 'mine', true,
    'image', p.image_path
  );
end;
$$;

/** Gives a pagoda its new picture; returns the old picture's name (to delete), or null. */
create function public.field_set_image(p_key text, p_image text)
returns text
language sql
security definer
set search_path = ''
as $$
  with old as (select image_path from public.pagodas where id = p_key)
  update public.pagodas set image_path = p_image
  where id = p_key
  returning (select image_path from old);
$$;

/** Pictures nobody uses any more (an hour old or more), for the Edge Function to delete. */
create function public.field_stale_images(p_limit int default 50)
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select o.name
  from storage.objects o
  where o.bucket_id = 'pagoda-images'
    and o.created_at < now() - interval '1 hour'
    and not exists (select 1 from public.pagodas p where p.image_path = o.name)
  order by o.created_at
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

/** Notes a visit for the Edge Function; quietly skipped when an address writes too much. */
create function public.field_visit(p_ip text, p_device text, p_player text, p_kind text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.allow(p_ip, 'visit') is not null then
    return;
  end if;
  insert into public.visits as v (device, player, kind)
  values (p_device, p_player, p_kind)
  on conflict (device, player, kind, day) do update
    set hits = v.hits + 1, last_at = now();
end;
$$;

revoke all on function public.field_offer(text, text, text, int, jsonb, text, text) from public, anon, authenticated;
revoke all on function public.field_set_image(text, text) from public, anon, authenticated;
revoke all on function public.field_stale_images(int) from public, anon, authenticated;
revoke all on function public.field_visit(text, text, text, text) from public, anon, authenticated;
grant execute on function public.field_offer(text, text, text, int, jsonb, text, text) to service_role;
grant execute on function public.field_set_image(text, text) to service_role;
grant execute on function public.field_stale_images(int) to service_role;
grant execute on function public.field_visit(text, text, text, text) to service_role;
revoke all on function private.allow(text, text) from public, anon, authenticated;
revoke all on function private.is_polite(text) from public, anon, authenticated;

-- ---------------------------------------------------------------- reading

/**
 * One field of a region: { page, pages, mine, entries }. page counts from 0; without
 * p_page it is the newest field. Field n holds the pagodas numbered 12n+1 … 12n+12 in
 * their region, so a pagoda never moves to another field. Reads only that field's rows.
 */
create or replace function public.field_page(p_place int, p_page int default null, p_device text default null, p_size int default 12)
returns json
language sql
stable
security definer
set search_path = ''
as $$
  with size as (
    select greatest(1, least(coalesce(p_size, 12), 30)) as n
  ),
  info as (
    select coalesce((select (max(seq) - 1) / s.n from public.pagodas where place = p_place and status = 'approved'), 0) + 1 as pages,
           (select (seq - 1) / s.n from public.pagodas
             where place = p_place and status = 'approved' and device = coalesce(p_device, '')
             order by updated desc limit 1) as mine,
           s.n
    from size s
  ),
  chosen as (
    select least(greatest(coalesce(p_page, pages - 1), 0), pages - 1) as page from info
  )
  select json_build_object(
    'page', c.page,
    'pages', i.pages,
    'mine', i.mine,
    'entries', coalesce((
      select json_agg(json_build_object(
        'id', l.public_id::text, 'place', l.place, 'state', l.state, 'name', l.name, 'wish', l.wish,
        'updated', l.updated, 'approved', true, 'hidden', false,
        'mine', l.device = coalesce(p_device, ''), 'image', l.image_path
      ) order by l.updated desc)
      from public.pagodas l
      where l.place = p_place and l.status = 'approved'
        and l.seq > c.page * i.n and l.seq <= (c.page + 1) * i.n
    ), '[]'::json)
  )
  from info i, chosen c;
$$;

/** The numbers everyone sees, plus `stamp` (latest change) so the app refreshes only when something changed. */
create or replace function public.field_counts()
returns json
language sql
stable
security definer
set search_path = ''
as $$
  select json_build_object(
    'total', count(*),
    'byPlace', json_build_array(
      count(*) filter (where place = 0),
      count(*) filter (where place = 1),
      count(*) filter (where place = 2),
      count(*) filter (where place = 3),
      count(*) filter (where place = 4)
    ),
    'people', count(distinct (device, player)),
    'stamp', coalesce(max(updated), 0)
  )
  from public.pagodas
  where status = 'approved';
$$;

-- ---------------------------------------------------------------- visits over time

-- Days older than 120 days are kept only as totals.
create table private.daily_visits (
  day date primary key,
  devices_opened int not null,
  children_played int not null
);

create function private.fold_old_visits()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  cutoff date := (now() at time zone 'Asia/Bangkok')::date - 120;
begin
  insert into private.daily_visits (day, devices_opened, children_played)
  select day,
         count(distinct device) filter (where kind = 'open'),
         count(distinct (device, player)) filter (where kind = 'play')
  from public.visits
  where day < cutoff
  group by day
  on conflict (day) do update
    set devices_opened = private.daily_visits.devices_opened + excluded.devices_opened,
        children_played = private.daily_visits.children_played + excluded.children_played;
  delete from public.visits where day < cutoff;
end;
$$;
revoke all on function private.fold_old_visits() from public, anon, authenticated;

drop view private.daily_stats;

/** Each day in Thai time: devices that opened the page, children who played, pagodas offered. */
create view private.daily_stats as
with seen as (
  select day,
         count(distinct device) filter (where kind = 'open') as devices_opened,
         count(distinct (device, player)) filter (where kind = 'play') as children_played
  from public.visits
  group by day
  union all
  select day, devices_opened, children_played from private.daily_visits
),
offered as (
  select (offered_at at time zone 'Asia/Bangkok')::date as day, count(*) as pagodas_offered
  from public.pagodas
  group by 1
)
select coalesce(s.day, o.day) as day,
       coalesce(s.devices_opened, 0) as devices_opened,
       coalesce(s.children_played, 0) as children_played,
       coalesce(o.pagodas_offered, 0) as pagodas_offered
from seen s
full join offered o on o.day = s.day
order by 1 desc;

revoke all on private.daily_stats from public, anon, authenticated;

select cron.schedule('sandsiam-trim-write-log', '7 * * * *', $$delete from private.write_log where at < now() - interval '1 day'$$);
select cron.schedule('sandsiam-fold-visits', '23 20 * * *', $$select private.fold_old_visits()$$);
