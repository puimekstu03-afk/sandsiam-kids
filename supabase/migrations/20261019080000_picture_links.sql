-- SANDSIAM Kids · the picture links' address lives in one setting, not inside the view.
--
-- If the project ever moves, change it once:
--   update private.settings set pictures_url = 'https://<new ref>.supabase.co/storage/v1/object/public/pagoda-images/';

alter table private.settings
  add column pictures_url text not null
  default 'https://uwhqcqyferxicsjftfeq.supabase.co/storage/v1/object/public/pagoda-images/';

/** Every pagoda with a link to its picture. */
create or replace view private.pagodas_with_pictures as
select p.public_id, p.place, p.name, p.wish, p.status, p.offered_at,
       case when p.image_path is null then null
            else s.pictures_url || p.image_path
       end as picture_url
from public.pagodas p
cross join private.settings s
order by p.offered_at desc;

revoke all on private.pagodas_with_pictures from public, anon, authenticated;
