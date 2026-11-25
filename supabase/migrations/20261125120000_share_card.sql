-- SANDSIAM Kids · one pagoda by its public id, for shared links.
--
-- The share server (share-server/) and the app (?id=…) read it. Only pagodas that show in
-- the field: once the owner hides one, its shared link stops showing it too.

/** One approved pagoda: { id, place, state, name, wish, image }, or null. */
create function public.field_card(p_id uuid)
returns json
language sql
stable
security definer
set search_path = ''
as $$
  select json_build_object(
    'id', public_id::text, 'place', place, 'state', state, 'name', name, 'wish', wish, 'image', image_path
  )
  from public.pagodas
  where public_id = p_id and status = 'approved';
$$;

revoke all on function public.field_card(uuid) from public;
grant execute on function public.field_card(uuid) to anon, authenticated, service_role;
