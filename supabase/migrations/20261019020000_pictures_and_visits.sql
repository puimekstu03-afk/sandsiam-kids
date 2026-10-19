-- SANDSIAM Kids · a picture of each offered pagoda, and who comes to play.
--
-- Pictures: the app uploads a JPEG of the finished pagoda to the public bucket
-- `pagoda-images` (insert only, so nobody can overwrite another child's picture), then
-- passes its file name to offer_pagoda, which checks the file exists before keeping it.
--
-- Visits: one row per device, player, kind and day (Thai time), counting how often.
--   kind 'open' — the page was opened · 'play' — a child started building
-- Daily numbers for the owner: private.daily_stats (Table Editor → schema private).
--
-- Pagodas now show to others by a random public id, never by the device id, which
-- stays a secret of the browser that made it.

-- ---------------------------------------------------------------- pictures

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pagoda-images', 'pagoda-images', true, 1048576, array['image/jpeg'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy "Anyone can add a pagoda picture"
on storage.objects for insert
to anon, authenticated
with check (bucket_id = 'pagoda-images' and name ~ '^[0-9a-f-]{36}\.jpg$');

alter table public.pagodas
  add column public_id uuid not null default gen_random_uuid() unique,
  add column image_path text check (image_path ~ '^[0-9a-f-]{36}\.jpg$');

-- The field entry gains the picture's file name; its functions are rebuilt to match.
drop function public.offer_pagoda(text, text, int, jsonb, text, text);
drop function public.field_list(int, text);
drop type public.field_entry;

create type public.field_entry as (
  id text,
  place smallint,
  state jsonb,
  name text,
  wish text,
  updated bigint,
  approved boolean,
  hidden boolean,
  mine boolean,
  image text
);

/** Offers (or re-offers) a child's pagoda; it goes straight into the field unless the owner hid it. */
create function public.offer_pagoda(
  p_device text,
  p_player text,
  p_place int,
  p_state jsonb,
  p_name text,
  p_wish text,
  p_image text default null
)
returns public.field_entry
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_id text := p_device || '-' || p_player || '-' || p_place;
  stamp bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  picture text := null;
  result public.field_entry;
begin
  if (select count(*) from public.pagodas where offered_at > now() - interval '1 minute') >= 120 then
    raise exception 'The field is busy, try again in a minute' using errcode = 'P0429';
  end if;
  if (select count(*) from public.pagodas) >= 20000 then
    raise exception 'The field is full' using errcode = 'P0429';
  end if;
  -- Keep the picture only if it was really uploaded.
  if p_image is not null and exists (
    select 1 from storage.objects where bucket_id = 'pagoda-images' and name = p_image
  ) then
    picture := p_image;
  end if;

  insert into public.pagodas as p (id, device, player, place, state, name, wish, updated, status, image_path)
  values (row_id, p_device, p_player, p_place, p_state, coalesce(p_name, ''), coalesce(p_wish, ''), stamp, 'approved', picture)
  on conflict (id) do update
    set state = excluded.state,
        name = excluded.name,
        wish = excluded.wish,
        updated = excluded.updated,
        status = case when p.status = 'hidden' then 'hidden' else 'approved' end,
        image_path = coalesce(excluded.image_path, p.image_path),
        offered_at = now()
  returning p.public_id::text, p.place, p.state, p.name, p.wish, p.updated,
            p.status = 'approved', p.status = 'hidden', true, p.image_path
  into result;
  return result;
end;
$$;

/** One region of the field: approved pagodas, plus this device's own (even hidden). */
create function public.field_list(p_place int, p_device text default null)
returns setof public.field_entry
language sql
stable
security definer
set search_path = ''
as $$
  select public_id::text, place, state, name, wish, updated,
         status = 'approved', status = 'hidden', device = coalesce(p_device, ''), image_path
  from public.pagodas
  where place = p_place and (status = 'approved' or device = coalesce(p_device, ''))
  order by updated desc
  limit 60;
$$;

-- ---------------------------------------------------------------- visits

create table public.visits (
  device text not null check (device ~ '^[a-z0-9-]{4,40}$'),
  player text not null check (player ~ '^[a-z0-9]{1,12}$'),
  kind text not null check (kind in ('open', 'play')),
  day date not null default (now() at time zone 'Asia/Bangkok')::date,
  hits int not null default 1,
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  primary key (device, player, kind, day)
);

create index visits_day on public.visits (day, kind);
create index visits_last_at on public.visits (last_at);

alter table public.visits enable row level security;
revoke all on public.visits from anon, authenticated;

/** Notes that this device (and player) opened the page or started building today. */
create function public.log_visit(p_device text, p_player text, p_kind text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.visits where last_at > now() - interval '1 minute') >= 600 then
    return; -- very busy: skip the note rather than slow anyone down
  end if;
  insert into public.visits as v (device, player, kind)
  values (p_device, p_player, p_kind)
  on conflict (device, player, kind, day) do update
    set hits = v.hits + 1, last_at = now();
end;
$$;

/** The numbers everyone sees: pagodas in the field, who made them, and who came to play. */
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
    'players', (select count(distinct (device, player)) from public.visits where kind = 'play'),
    'visitors', (select count(distinct device) from public.visits where kind = 'open')
  )
  from public.pagodas
  where status = 'approved';
$$;

revoke all on function public.offer_pagoda(text, text, int, jsonb, text, text, text) from public;
revoke all on function public.field_list(int, text) from public;
revoke all on function public.log_visit(text, text, text) from public;
grant execute on function public.offer_pagoda(text, text, int, jsonb, text, text, text) to anon, authenticated;
grant execute on function public.field_list(int, text) to anon, authenticated;
grant execute on function public.log_visit(text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------- for the owner

/** Each day in Thai time: devices that opened the page, children who played, pagodas offered. */
create view private.daily_stats as
with days as (
  select day from public.visits
  union
  select (offered_at at time zone 'Asia/Bangkok')::date from public.pagodas
)
select d.day,
       (select count(distinct device) from public.visits v where v.day = d.day and v.kind = 'open') as devices_opened,
       (select count(distinct (device, player)) from public.visits v where v.day = d.day and v.kind = 'play') as children_played,
       (select count(*) from public.pagodas p where (p.offered_at at time zone 'Asia/Bangkok')::date = d.day) as pagodas_offered
from days d
order by d.day desc;

/** Every pagoda with a link to its picture. */
create view private.pagodas_with_pictures as
select p.public_id, p.place, p.name, p.wish, p.status, p.offered_at,
       case when p.image_path is null then null
            else 'https://uwhqcqyferxicsjftfeq.supabase.co/storage/v1/object/public/pagoda-images/' || p.image_path
       end as picture_url
from public.pagodas p
order by p.offered_at desc;

revoke all on private.daily_stats, private.pagodas_with_pictures from public, anon, authenticated;
