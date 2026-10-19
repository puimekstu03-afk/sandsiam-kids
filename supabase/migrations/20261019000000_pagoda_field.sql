-- SANDSIAM Kids · the shared pagoda field.
--
-- Children never sign in. Each browser keeps a random device id (localStorage), and each
-- child on that device has a player id, so one row is one child's pagoda in one region.
-- The table is closed to the API: everything goes through the functions below, which
-- check their input. Only approved pagodas reach other people; a teacher approves them
-- with the teacher code, kept as a bcrypt hash in the `private` schema (not exposed).
--
-- Set or change the teacher code in the SQL editor:
--   select private.set_teacher_code('your code');

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.teacher_codes (
  id int primary key default 1 check (id = 1),
  hash text not null,
  updated_at timestamptz not null default now()
);

-- Failed teacher-code tries, to slow down guessing.
create table private.teacher_misses (
  at timestamptz not null default now()
);

create function private.set_teacher_code(code text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if code is null or char_length(code) < 6 then
    raise exception 'The teacher code needs at least 6 characters';
  end if;
  insert into private.teacher_codes (id, hash)
  values (1, extensions.crypt(code, extensions.gen_salt('bf')))
  on conflict (id) do update set hash = excluded.hash, updated_at = now();
end;
$$;

create function private.is_teacher(code text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  ok boolean;
begin
  if (select count(*) from private.teacher_misses where at > now() - interval '10 minutes') >= 20 then
    raise exception 'Too many tries, wait a few minutes' using errcode = 'P0429';
  end if;
  select exists (
    select 1 from private.teacher_codes t
    where code is not null and t.hash = extensions.crypt(code, t.hash)
  ) into ok;
  if not ok then
    insert into private.teacher_misses default values;
    delete from private.teacher_misses where at < now() - interval '1 day';
  end if;
  return ok;
end;
$$;

create table public.pagodas (
  id text primary key,
  device text not null check (device ~ '^[a-z0-9-]{4,40}$'),
  player text not null check (player ~ '^[a-z0-9]{1,12}$'),
  place smallint not null check (place between 0 and 4),
  state jsonb not null check (jsonb_typeof(state) = 'object' and pg_column_size(state) < 32768),
  name text not null default '' check (char_length(name) <= 40),
  wish text not null default '' check (char_length(wish) <= 180),
  updated bigint not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'hidden')),
  created_at timestamptz not null default now(),
  offered_at timestamptz not null default now(),
  unique (device, player, place)
);

create index pagodas_place_status on public.pagodas (place, status, updated desc);
create index pagodas_offered_at on public.pagodas (offered_at);

alter table public.pagodas enable row level security;
revoke all on public.pagodas from anon, authenticated;

-- What the app reads: one pagoda in the field.
create type public.field_entry as (
  id text,
  place smallint,
  state jsonb,
  name text,
  wish text,
  updated bigint,
  approved boolean,
  hidden boolean,
  mine boolean
);

/** Offers (or re-offers) a child's pagoda; a new version waits for a teacher again. */
create function public.offer_pagoda(
  p_device text,
  p_player text,
  p_place int,
  p_state jsonb,
  p_name text,
  p_wish text
)
returns public.field_entry
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_id text := p_device || '-' || p_player || '-' || p_place;
  stamp bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  result public.field_entry;
begin
  if (select count(*) from public.pagodas where offered_at > now() - interval '1 minute') >= 120 then
    raise exception 'The field is busy, try again in a minute' using errcode = 'P0429';
  end if;
  if (select count(*) from public.pagodas) >= 20000 then
    raise exception 'The field is full' using errcode = 'P0429';
  end if;

  insert into public.pagodas as p (id, device, player, place, state, name, wish, updated)
  values (row_id, p_device, p_player, p_place, p_state, coalesce(p_name, ''), coalesce(p_wish, ''), stamp)
  on conflict (id) do update
    set state = excluded.state,
        name = excluded.name,
        wish = excluded.wish,
        updated = excluded.updated,
        status = 'pending',
        offered_at = now()
  returning p.id, p.place, p.state, p.name, p.wish, p.updated, false, false, true
  into result;
  return result;
end;
$$;

/** One region of the field: approved pagodas, plus this device's own (even waiting or hidden). */
create function public.field_list(p_place int, p_device text default null)
returns setof public.field_entry
language sql
stable
security definer
set search_path = ''
as $$
  select id, place, state, name, wish, updated,
         status = 'approved', status = 'hidden', device = coalesce(p_device, '')
  from public.pagodas
  where place = p_place and (status = 'approved' or device = coalesce(p_device, ''))
  order by updated desc
  limit 60;
$$;

/** The numbers everyone sees: approved pagodas, per region, and how many children made them. */
create function public.field_counts()
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
    'people', count(distinct (device, player))
  )
  from public.pagodas
  where status = 'approved';
$$;

/** Whether this is the teacher code (counts as a try). */
create function public.teacher_check(p_code text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select private.is_teacher(p_code);
$$;

/** Teachers see every pagoda in a region, waiting ones first. */
create function public.teacher_list(p_code text, p_place int)
returns setof public.field_entry
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- A wrong code returns nothing rather than raising, so the miss above is kept.
  if not private.is_teacher(p_code) then
    return;
  end if;
  return query
    select id, place, state, name, wish, updated,
           status = 'approved', status = 'hidden', false
    from public.pagodas
    where place = p_place
    order by status = 'pending' desc, updated desc
    limit 200;
end;
$$;

/** Shows (ok) or hides this exact version of a pagoda; a newer version is left alone. False for a wrong code. */
create function public.teacher_review(p_code text, p_id text, p_updated bigint, p_ok boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_teacher(p_code) then
    return false;
  end if;
  update public.pagodas
  set status = case when p_ok then 'approved' else 'hidden' end
  where id = p_id and updated = p_updated;
  return true;
end;
$$;

revoke all on function public.offer_pagoda(text, text, int, jsonb, text, text) from public;
revoke all on function public.field_list(int, text) from public;
revoke all on function public.field_counts() from public;
revoke all on function public.teacher_check(text) from public;
revoke all on function public.teacher_list(text, int) from public;
revoke all on function public.teacher_review(text, text, bigint, boolean) from public;

grant execute on function public.offer_pagoda(text, text, int, jsonb, text, text) to anon, authenticated;
grant execute on function public.field_list(int, text) to anon, authenticated;
grant execute on function public.field_counts() to anon, authenticated;
grant execute on function public.teacher_check(text) to anon, authenticated;
grant execute on function public.teacher_list(text, int) to anon, authenticated;
grant execute on function public.teacher_review(text, text, bigint, boolean) to anon, authenticated;

revoke all on function private.set_teacher_code(text) from public, anon, authenticated;
revoke all on function private.is_teacher(text) from public, anon, authenticated;
