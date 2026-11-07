-- Only paths already eligible for public detail/profile pages are exposed.
-- The definer lives in the non-exposed discovery schema; the public wrapper
-- has no table privileges. Anonymous enumeration is intentional for crawlers.
create function discovery_access.sitemap_paths(after_path text, page_size integer)
returns table(path text) language sql stable security definer set search_path='' as $$
  select candidate.path from (
    select '/offers/' || o.slug as path
    from public.offers o
    where private.offer_is_effectively_active(o.id,statement_timestamp())
    union all
    select '/properties/' || p.slug as path
    from public.properties p
    where p.verification_status='verified' and p.archived_at is null
  ) candidate
  where (after_path is null or candidate.path collate "C" > after_path collate "C")
  order by candidate.path collate "C"
  limit greatest(1,least(coalesce(page_size,1000),1000))
$$;
revoke all on function discovery_access.sitemap_paths(text,integer) from public,anon,authenticated,service_role;
grant execute on function discovery_access.sitemap_paths(text,integer) to anon,authenticated,service_role;
create function public.list_public_sitemap_paths(after_path text default null, page_size integer default 1000)
returns table(path text) language sql stable security invoker set search_path='' as $$
  select * from discovery_access.sitemap_paths(after_path,page_size)
$$;
revoke all on function public.list_public_sitemap_paths(text,integer) from public,anon,authenticated,service_role;
grant execute on function public.list_public_sitemap_paths(text,integer) to anon,authenticated,service_role;
