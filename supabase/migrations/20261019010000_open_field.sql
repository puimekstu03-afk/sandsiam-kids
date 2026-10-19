-- SANDSIAM Kids · an open field: no teacher code, every pagoda shows as soon as it is offered.
--
-- The app's rude-word filter still runs before a child can offer. The project owner can
-- still hide a pagoda from the Supabase dashboard (Table Editor → pagodas → status = 'hidden').

drop function if exists public.teacher_check(text);
drop function if exists public.teacher_list(text, int);
drop function if exists public.teacher_review(text, text, bigint, boolean);
drop function if exists private.is_teacher(text);
drop function if exists private.set_teacher_code(text);
drop table if exists private.teacher_codes;
drop table if exists private.teacher_misses;

alter table public.pagodas alter column status set default 'approved';
update public.pagodas set status = 'approved' where status = 'pending';

/** Offers (or re-offers) a child's pagoda; it goes straight into the field unless the owner hid it. */
create or replace function public.offer_pagoda(
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

  insert into public.pagodas as p (id, device, player, place, state, name, wish, updated, status)
  values (row_id, p_device, p_player, p_place, p_state, coalesce(p_name, ''), coalesce(p_wish, ''), stamp, 'approved')
  on conflict (id) do update
    set state = excluded.state,
        name = excluded.name,
        wish = excluded.wish,
        updated = excluded.updated,
        status = case when p.status = 'hidden' then 'hidden' else 'approved' end,
        offered_at = now()
  returning p.id, p.place, p.state, p.name, p.wish, p.updated, p.status = 'approved', p.status = 'hidden', true
  into result;
  return result;
end;
$$;
