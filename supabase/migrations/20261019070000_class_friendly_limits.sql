-- SANDSIAM Kids · limits that a whole class can live with.
--
-- A school's computers usually reach the internet through one address, so a class of 40
-- offering at the same moment looks like one very busy visitor. The per-minute limit for
-- one address goes from 30 to 120, and hitting it now answers 'wait' (the app waits and
-- tries again by itself) rather than 'slow_down' (kept for the hourly and daily limits,
-- where trying again soon wouldn't help).

/** Null when this address may write now (and counts the write), else 'busy', 'wait' or 'slow_down'. */
create or replace function private.allow(p_ip text, p_kind text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  w text := left(encode(extensions.digest(coalesce(p_ip, '') || (select salt from private.settings), 'sha256'), 'hex'), 32);
begin
  if p_kind = 'offer' then
    if (select count(*) from private.write_log where kind = 'offer' and at > now() - interval '1 minute') >= 300 then
      return 'busy';
    end if;
    if (select count(*) from private.write_log where who = w and kind = 'offer' and at > now() - interval '1 minute') >= 120 then
      return 'wait';
    end if;
    if (select count(*) from private.write_log where who = w and kind = 'offer' and at > now() - interval '1 hour') >= 300
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

revoke all on function private.allow(text, text) from public, anon, authenticated;
