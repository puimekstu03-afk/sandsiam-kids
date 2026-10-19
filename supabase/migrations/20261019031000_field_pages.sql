-- SANDSIAM Kids · a region's field fills up one ลาน (field) at a time.
--
-- Pagodas line up in the order they were first offered, p_size to a field: the first 12
-- stand in field 1, the next 12 open field 2, and so on. Offering again changes a pagoda
-- but never moves it to another field. Hidden pagodas give up their place.

/**
 * One field of a region: { page, pages, mine, entries }. page counts from 0; without
 * p_page it is the newest field. mine is the field holding this device's latest pagoda
 * here, or null. entries are field_entry rows, newest first.
 */
create function public.field_page(p_place int, p_page int default null, p_device text default null, p_size int default 12)
returns json
language sql
stable
security definer
set search_path = ''
as $$
  with size as (
    select greatest(1, least(coalesce(p_size, 12), 30)) as n
  ),
  lined as (
    select p.*, ((row_number() over (order by p.created_at, p.id) - 1) / (select n from size))::int as page
    from public.pagodas p
    where p.place = p_place and p.status = 'approved'
  ),
  info as (
    select coalesce(max(page), 0) + 1 as pages,
           (select l.page from lined l where l.device = coalesce(p_device, '') order by l.updated desc limit 1) as mine
    from lined
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
      from lined l
      where l.page = c.page
    ), '[]'::json)
  )
  from info i, chosen c;
$$;

revoke all on function public.field_page(int, int, text, int) from public;
grant execute on function public.field_page(int, int, text, int) to anon, authenticated;
