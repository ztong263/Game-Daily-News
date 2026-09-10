-- Game Daily foundation. No existing data is read, copied or removed.
create table public.gd_briefs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  brief_date date not null,
  version text not null,
  source_type text not null check (source_type in ('generated','imported_chatgpt','manual')),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  is_active boolean not null default false,
  idempotency_key text,
  created_at timestamptz not null default now(),
  unique(owner_id, brief_date, version),
  unique(owner_id, idempotency_key)
);
create unique index gd_briefs_one_active on public.gd_briefs(owner_id, brief_date) where is_active;
create table public.gd_preferences (
  owner_id uuid primary key references auth.users(id),
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  updated_at timestamptz not null default now()
);
create table public.gd_audio (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  cache_key text not null,
  object_path text not null,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  unique(owner_id, cache_key),
  check (object_path like owner_id::text || '/%')
);
create table public.gd_usage (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  event_key text not null,
  stage text not null,
  model text,
  input_tokens bigint check (input_tokens >= 0),
  output_tokens bigint check (output_tokens >= 0),
  tool_calls integer check (tool_calls >= 0),
  estimated_usd numeric(18,8) check (estimated_usd >= 0),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(owner_id, event_key)
);
create table public.gd_jobs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  job_key text not null,
  kind text not null check (kind in ('brief','speech','translation')),
  status text not null default 'queued' check (status in ('queued','running','completed','failed')),
  payload jsonb not null default '{}'::jsonb,
  attempts integer not null default 0 check (attempts >= 0),
  lease_until timestamptz,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id, job_key)
);
-- Server writes go through authenticated application endpoints after validation.
-- Clients can only read their own rows; no anonymous access or direct writes.
alter table public.gd_briefs enable row level security;
alter table public.gd_preferences enable row level security;
alter table public.gd_audio enable row level security;
alter table public.gd_usage enable row level security;
alter table public.gd_jobs enable row level security;
revoke all on public.gd_briefs, public.gd_preferences, public.gd_audio, public.gd_usage, public.gd_jobs from public, anon, authenticated;
grant select on public.gd_briefs, public.gd_preferences, public.gd_audio, public.gd_usage, public.gd_jobs to authenticated;
grant select, insert, update, delete on public.gd_briefs, public.gd_preferences, public.gd_audio, public.gd_usage, public.gd_jobs to service_role;
create policy gd_briefs_owner_read on public.gd_briefs for select to authenticated using ((select auth.uid()) = owner_id);
create policy gd_preferences_owner_read on public.gd_preferences for select to authenticated using ((select auth.uid()) = owner_id);
create policy gd_audio_owner_read on public.gd_audio for select to authenticated using ((select auth.uid()) = owner_id);
create policy gd_usage_owner_read on public.gd_usage for select to authenticated using ((select auth.uid()) = owner_id);
create policy gd_jobs_owner_read on public.gd_jobs for select to authenticated using ((select auth.uid()) = owner_id);

