-- ScioPort: Supabase schema (Auth + Postgres)
-- Run in Supabase SQL editor.

create extension if not exists pgcrypto;

-- Basic "guide" (admin) check based on email allowlist.
-- You can replace this later with a proper roles table / app_metadata roles.
create or replace function public.is_guide()
returns boolean
language sql
stable
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) = any (
    array[
      'oliver.bocko@scioskola.cz',
      'tobias.pokorny@scioskola.cz',
      'jiri.prevorovsky@scioskola.cz'
    ]
  );
$$;

-- User profile data.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  email_lower text not null,
  display_name text,
  name text,
  class_name text,
  class_name_lower text,
  gender text,
  gems integer not null default 0,
  avatar_outfit text not null default 'default',
  green_shirt_unlocked boolean not null default false,
  red_shirt_unlocked boolean not null default false,
  red_blue_shirt_unlocked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Backfill / upgrade profile columns for existing projects.
alter table if exists public.profiles add column if not exists email text;
alter table if exists public.profiles add column if not exists email_lower text;
alter table if exists public.profiles add column if not exists display_name text;
alter table if exists public.profiles add column if not exists name text;
alter table if exists public.profiles add column if not exists class_name text;
alter table if exists public.profiles add column if not exists class_name_lower text;
alter table if exists public.profiles add column if not exists gender text;
alter table if exists public.profiles add column if not exists gems integer not null default 0;
alter table if exists public.profiles add column if not exists avatar_outfit text not null default 'default';
alter table if exists public.profiles add column if not exists green_shirt_unlocked boolean not null default false;
alter table if exists public.profiles add column if not exists red_shirt_unlocked boolean not null default false;
alter table if exists public.profiles add column if not exists red_blue_shirt_unlocked boolean not null default false;
alter table if exists public.profiles add column if not exists created_at timestamptz not null default now();
alter table if exists public.profiles add column if not exists updated_at timestamptz not null default now();
update public.profiles
set email_lower = lower(email)
where email_lower is null and email is not null;

create unique index if not exists profiles_email_lower_unique on public.profiles(email_lower);
create index if not exists profiles_class_name_lower_idx on public.profiles(class_name_lower);

-- Explicit class list (allows creating empty classes before assigning students).
create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_lower text not null,
  description text,
  created_by uuid references auth.users(id) on delete set null,
  created_by_email text,
  created_at timestamptz not null default now()
);

create unique index if not exists classes_name_lower_unique on public.classes(name_lower);

create or replace function public.increment_gems(p_user_id uuid, p_amount integer)
returns integer
language plpgsql
security definer
as $$
declare
  next_value integer;
begin
  if p_user_id <> auth.uid() and not public.is_guide() then
    raise exception 'not allowed';
  end if;

  update public.profiles
  set
    gems = coalesce(gems, 0) + coalesce(p_amount, 0),
    updated_at = now()
  where id = p_user_id
  returning gems into next_value;

  return coalesce(next_value, 0);
end;
$$;

revoke all on function public.increment_gems(uuid, integer) from public;
grant execute on function public.increment_gems(uuid, integer) to authenticated;

create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  value text not null,
  name_lower text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists subjects_name_lower_unique on public.subjects(name_lower);

create table if not exists public.templates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  subject text,
  subjects text[] not null default '{}',
  pillars text[] not null default '{}',
  pillar text,
  instructions text not null,
  proof_type text,
  annotation text,
  output text,
  created_at_client bigint,
  sent_batch_id text,
  recipient_type text not null,
  recipient_value text not null,
  recipient_value_lower text not null,
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_by_email text
);

-- Backfill / upgrade columns for existing projects.
alter table if exists public.templates add column if not exists subjects text[] not null default '{}';
alter table if exists public.templates add column if not exists annotation text;
alter table if exists public.templates add column if not exists output text;
alter table if exists public.templates add column if not exists created_at_client bigint;
alter table if exists public.templates add column if not exists sent_batch_id text;

create index if not exists templates_recipient_idx on public.templates(recipient_type, recipient_value_lower);
create index if not exists templates_created_by_idx on public.templates(created_by);

create table if not exists public.template_responses (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.templates(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  user_email text,
  user_email_lower text,
  template_title text,
  subject text,
  proof_type text,
  response text,
  subjects text[] not null default '{}',
  pillars text[] not null default '{}',
  recipient_type text,
  recipient_value text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, template_id)
);

create index if not exists template_responses_template_idx on public.template_responses(template_id);
create index if not exists template_responses_user_idx on public.template_responses(user_id);
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'template_responses_user_id_template_id_key'
      and conrelid = 'public.template_responses'::regclass
  ) then
    alter table public.template_responses
      add constraint template_responses_user_id_template_id_key
      unique (user_id, template_id);
  end if;
end;
$$;

-- Backfill / upgrade template response columns for existing projects.
alter table if exists public.template_responses add column if not exists user_email_lower text;
alter table if exists public.template_responses add column if not exists template_title text;
alter table if exists public.template_responses add column if not exists subject text;
alter table if exists public.template_responses add column if not exists proof_type text;
alter table if exists public.template_responses add column if not exists response text;
alter table if exists public.template_responses add column if not exists subjects text[] not null default '{}';
alter table if exists public.template_responses add column if not exists pillars text[] not null default '{}';
alter table if exists public.template_responses add column if not exists recipient_type text;
alter table if exists public.template_responses add column if not exists recipient_value text;
alter table if exists public.template_responses add column if not exists updated_at timestamptz not null default now();

create table if not exists public.portfolio_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  value text not null,
  title text,
  note text,
  pillar text,
  pillars text[] not null default '{}',
  subjects text[] not null default '{}',
  work_mood text,
  work_moods text[] not null default '{}',
  attachments jsonb not null default '[]'::jsonb,
  attachment_count integer not null default 0,
  source text,
  file_id text,
  template_id uuid references public.templates(id) on delete set null,
  template_title text,
  created_at timestamptz not null default now()
);

-- Backfill / upgrade portfolio entry columns for existing projects.
alter table if exists public.portfolio_entries add column if not exists created_at timestamptz not null default now();
alter table if exists public.portfolio_entries add column if not exists title text;
alter table if exists public.portfolio_entries add column if not exists note text;
alter table if exists public.portfolio_entries add column if not exists pillar text;
alter table if exists public.portfolio_entries add column if not exists pillars text[] not null default '{}';
alter table if exists public.portfolio_entries add column if not exists subjects text[] not null default '{}';
alter table if exists public.portfolio_entries add column if not exists work_mood text;
alter table if exists public.portfolio_entries add column if not exists work_moods text[] not null default '{}';
alter table if exists public.portfolio_entries add column if not exists attachments jsonb not null default '[]'::jsonb;
alter table if exists public.portfolio_entries add column if not exists attachment_count integer not null default 0;
alter table if exists public.portfolio_entries add column if not exists source text;
alter table if exists public.portfolio_entries add column if not exists file_id text;
alter table if exists public.portfolio_entries add column if not exists template_id uuid references public.templates(id) on delete set null;
alter table if exists public.portfolio_entries add column if not exists template_title text;
create index if not exists portfolio_entries_user_created_idx on public.portfolio_entries(user_id, created_at desc);
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'portfolio_entries_user_template_unique'
      and conrelid = 'public.portfolio_entries'::regclass
  ) then
    alter table public.portfolio_entries
      add constraint portfolio_entries_user_template_unique
      unique (user_id, template_id);
  end if;
end;
$$;

create table if not exists public.portfolio_comments (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.portfolio_entries(id) on delete cascade,
  author_user_id uuid not null references auth.users(id) on delete cascade,
  author_email text,
  author_role text,
  text text not null,
  created_at timestamptz not null default now()
);

create index if not exists portfolio_comments_entry_created_idx on public.portfolio_comments(entry_id, created_at asc);

-- Backfill / upgrade comment columns for existing projects.
alter table if exists public.portfolio_comments add column if not exists author_email text;
alter table if exists public.portfolio_comments add column if not exists author_role text;

create table if not exists public.daily_reflections (
  user_id uuid not null references auth.users(id) on delete cascade,
  date_key text not null,
  curiosity integer not null,
  values integer not null,
  independence integer not null,
  mood text,
  created_at timestamptz not null default now(),
  primary key (user_id, date_key)
);

-- Backfill / upgrade reflection columns for existing projects.
alter table if exists public.daily_reflections add column if not exists mood text;

-- Row Level Security (client-side safe access)
alter table public.profiles enable row level security;
alter table public.classes enable row level security;
alter table public.subjects enable row level security;
alter table public.templates enable row level security;
alter table public.template_responses enable row level security;
alter table public.portfolio_entries enable row level security;
alter table public.portfolio_comments enable row level security;
alter table public.daily_reflections enable row level security;

-- profiles
drop policy if exists profiles_select_self_or_guide on public.profiles;
create policy profiles_select_self_or_guide
on public.profiles
for select
to authenticated
using (id = auth.uid() or public.is_guide());

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self
on public.profiles
for insert
to authenticated
with check (id = auth.uid());

drop policy if exists profiles_update_self on public.profiles;
drop policy if exists profiles_update_self_or_guide on public.profiles;
create policy profiles_update_self_or_guide
on public.profiles
for update
to authenticated
using (id = auth.uid() or public.is_guide())
with check (id = auth.uid() or public.is_guide());

-- classes
drop policy if exists classes_select_authenticated on public.classes;
create policy classes_select_authenticated
on public.classes
for select
to authenticated
using (true);

drop policy if exists classes_insert_guide on public.classes;
create policy classes_insert_guide
on public.classes
for insert
to authenticated
with check (public.is_guide());

drop policy if exists classes_update_guide on public.classes;
create policy classes_update_guide
on public.classes
for update
to authenticated
using (public.is_guide())
with check (public.is_guide());

drop policy if exists classes_delete_guide on public.classes;
create policy classes_delete_guide
on public.classes
for delete
to authenticated
using (public.is_guide());

-- subjects
drop policy if exists subjects_select_authenticated on public.subjects;
create policy subjects_select_authenticated
on public.subjects
for select
to authenticated
using (true);

drop policy if exists subjects_insert_guide on public.subjects;
create policy subjects_insert_guide
on public.subjects
for insert
to authenticated
with check (public.is_guide());

drop policy if exists subjects_delete_guide on public.subjects;
create policy subjects_delete_guide
on public.subjects
for delete
to authenticated
using (public.is_guide());

-- templates
drop policy if exists templates_select_assigned_or_guide on public.templates;
create policy templates_select_assigned_or_guide
on public.templates
for select
to authenticated
using (
  public.is_guide()
  or (recipient_type = 'student' and recipient_value_lower = lower(coalesce(auth.jwt() ->> 'email', '')))
  or (
    recipient_type = 'class'
    and recipient_value_lower = (
      select class_name_lower from public.profiles where id = auth.uid()
    )
  )
);

drop policy if exists templates_insert_guide on public.templates;
create policy templates_insert_guide
on public.templates
for insert
to authenticated
with check (public.is_guide());

drop policy if exists templates_update_guide on public.templates;
create policy templates_update_guide
on public.templates
for update
to authenticated
using (public.is_guide())
with check (public.is_guide());

drop policy if exists templates_delete_guide on public.templates;
create policy templates_delete_guide
on public.templates
for delete
to authenticated
using (public.is_guide());

-- template_responses
drop policy if exists template_responses_select_self_or_guide on public.template_responses;
create policy template_responses_select_self_or_guide
on public.template_responses
for select
to authenticated
using (public.is_guide() or user_id = auth.uid());

drop policy if exists template_responses_insert_self on public.template_responses;
create policy template_responses_insert_self
on public.template_responses
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists template_responses_update_self on public.template_responses;
create policy template_responses_update_self
on public.template_responses
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- portfolio_entries
drop policy if exists portfolio_entries_select_owner_or_guide on public.portfolio_entries;
create policy portfolio_entries_select_owner_or_guide
on public.portfolio_entries
for select
to authenticated
using (public.is_guide() or user_id = auth.uid());

drop policy if exists portfolio_entries_insert_self on public.portfolio_entries;
create policy portfolio_entries_insert_self
on public.portfolio_entries
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists portfolio_entries_update_self on public.portfolio_entries;
create policy portfolio_entries_update_self
on public.portfolio_entries
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists portfolio_entries_delete_self on public.portfolio_entries;
create policy portfolio_entries_delete_self
on public.portfolio_entries
for delete
to authenticated
using (user_id = auth.uid());

-- portfolio_comments
drop policy if exists portfolio_comments_select_owner_or_guide on public.portfolio_comments;
create policy portfolio_comments_select_owner_or_guide
on public.portfolio_comments
for select
to authenticated
using (
  public.is_guide()
  or exists (
    select 1
    from public.portfolio_entries e
    where e.id = portfolio_comments.entry_id
      and e.user_id = auth.uid()
  )
);

drop policy if exists portfolio_comments_insert_owner_or_guide on public.portfolio_comments;
create policy portfolio_comments_insert_owner_or_guide
on public.portfolio_comments
for insert
to authenticated
with check (
  author_user_id = auth.uid()
  and (
    public.is_guide()
    or exists (
      select 1
      from public.portfolio_entries e
      where e.id = portfolio_comments.entry_id
        and e.user_id = auth.uid()
    )
  )
);

drop policy if exists portfolio_comments_delete_guide_or_author on public.portfolio_comments;
create policy portfolio_comments_delete_guide_or_author
on public.portfolio_comments
for delete
to authenticated
using (public.is_guide() or author_user_id = auth.uid());

-- daily_reflections
drop policy if exists daily_reflections_select_owner_or_guide on public.daily_reflections;
create policy daily_reflections_select_owner_or_guide
on public.daily_reflections
for select
to authenticated
using (public.is_guide() or user_id = auth.uid());

drop policy if exists daily_reflections_insert_self on public.daily_reflections;
create policy daily_reflections_insert_self
on public.daily_reflections
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists daily_reflections_update_self on public.daily_reflections;
create policy daily_reflections_update_self
on public.daily_reflections
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());
