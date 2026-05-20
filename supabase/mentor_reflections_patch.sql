-- ScioPort: mentor standalone reflections patch.
-- Safe to run in Supabase SQL editor. It creates/updates only this feature.

create extension if not exists pgcrypto;

create table if not exists public.mentor_reflections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  user_email text,
  date_key text not null,
  focus text not null default 'samostatna reflexe',
  reflection_text text not null default '',
  learning_text text not null default '',
  next_step text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.mentor_reflections add column if not exists user_email text;
alter table if exists public.mentor_reflections add column if not exists date_key text not null default to_char(now(), 'YYYY-MM-DD');
alter table if exists public.mentor_reflections add column if not exists focus text not null default 'samostatna reflexe';
alter table if exists public.mentor_reflections add column if not exists reflection_text text not null default '';
alter table if exists public.mentor_reflections add column if not exists learning_text text not null default '';
alter table if exists public.mentor_reflections add column if not exists next_step text not null default '';
alter table if exists public.mentor_reflections add column if not exists created_at timestamptz not null default now();
alter table if exists public.mentor_reflections add column if not exists updated_at timestamptz not null default now();

create index if not exists mentor_reflections_user_created_idx
on public.mentor_reflections(user_id, created_at desc);

alter table public.mentor_reflections enable row level security;

grant select, insert, update, delete on public.mentor_reflections to authenticated;

drop policy if exists mentor_reflections_select_self_or_guide on public.mentor_reflections;
create policy mentor_reflections_select_self_or_guide
on public.mentor_reflections
for select
to authenticated
using (user_id = auth.uid() or public.is_guide());

drop policy if exists mentor_reflections_insert_self on public.mentor_reflections;
create policy mentor_reflections_insert_self
on public.mentor_reflections
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists mentor_reflections_update_self on public.mentor_reflections;
create policy mentor_reflections_update_self
on public.mentor_reflections
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists mentor_reflections_delete_self_or_guide on public.mentor_reflections;
create policy mentor_reflections_delete_self_or_guide
on public.mentor_reflections
for delete
to authenticated
using (user_id = auth.uid() or public.is_guide());
