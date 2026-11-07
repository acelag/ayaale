-- Private processed photos only. Raw/browser Storage writes are deliberately denied.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('ayaale-private-photos','ayaale-private-photos',false,2097152,array['image/webp']);
create table public.photo_assets (
 id uuid primary key,
 property_id uuid not null references public.properties(id) on delete restrict,
 created_by uuid not null references public.profiles(id) on delete restrict,
 main_path text not null unique,
 thumbnail_path text not null unique,
 width integer not null check(width between 1 and 1600),
 height integer not null check(height between 1 and 1600),
 byte_size integer not null check(byte_size between 1 and 2097152),
 created_at timestamptz not null default now(),
 check(main_path=property_id::text||'/'||id::text||'/main.webp'),
 check(thumbnail_path=property_id::text||'/'||id::text||'/thumbnail.webp')
);
create index photos_property_idx on public.photo_assets(property_id,created_at);
create index photos_creator_idx on public.photo_assets(created_by);
alter table public.photo_assets enable row level security;
revoke all on public.photo_assets from public,anon,authenticated,service_role;
grant select on public.photo_assets to authenticated;
grant select,insert,delete on public.photo_assets to service_role;
create policy photos_member_read on public.photo_assets for select to authenticated using ((select private.is_platform_admin()) or private.property_role(property_id) is not null);
comment on table public.photo_assets is 'Processed private photo assets, not approved public content. Binding to reviewed offer/property revisions remains later workflows.';
