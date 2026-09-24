-- Seed-only control plane for the separate Shablonizator Admin edition.
-- Unit name, type, structure and metadata are NOT stored in server columns.
-- The server treats seed_payload as one opaque self-contained capsule.

create extension if not exists pgcrypto;

create table if not exists public.unit_deployments (
  id uuid primary key default gen_random_uuid(),
  seed_payload text not null,
  seed_digest text not null,
  seed_format text not null default 'SHU1',
  seed_version integer not null default 1 check (seed_version > 0),
  status text not null default 'pending_activation' check (status in ('pending_activation', 'active', 'suspended', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (seed_digest, seed_version)
);

create index if not exists unit_deployments_status_idx on public.unit_deployments(status);

create table if not exists public.unit_seed_revisions (
  id uuid primary key default gen_random_uuid(),
  deployment_id uuid not null references public.unit_deployments(id) on delete cascade,
  seed_version integer not null check (seed_version > 0),
  seed_payload text not null,
  seed_digest text not null,
  created_at timestamptz not null default now(),
  unique (deployment_id, seed_version)
);

create table if not exists public.unit_activation_codes (
  id uuid primary key default gen_random_uuid(),
  deployment_id uuid not null references public.unit_deployments(id) on delete cascade,
  code_kind text not null check (code_kind in ('primary', 'reserve')),
  label text not null check (length(trim(label)) between 1 and 120),
  code_digest text not null unique,
  code_hint text not null check (length(code_hint) between 4 and 12),
  status text not null default 'pending' check (status in ('pending', 'used', 'revoked', 'expired')),
  expires_at timestamptz,
  redeemed_at timestamptz,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  check (expires_at is null or expires_at > created_at)
);

create index if not exists unit_activation_codes_deployment_idx on public.unit_activation_codes(deployment_id, created_at desc);
create unique index if not exists unit_one_pending_primary_idx on public.unit_activation_codes(deployment_id) where code_kind = 'primary' and status = 'pending';

create table if not exists public.unit_installations (
  id uuid primary key default gen_random_uuid(),
  deployment_id uuid not null references public.unit_deployments(id) on delete cascade,
  activation_code_id uuid not null unique references public.unit_activation_codes(id) on delete restrict,
  installation_uid uuid not null unique,
  label text,
  device_token_digest text not null unique,
  status text not null default 'active' check (status in ('active', 'revoked')),
  app_edition text not null default 'advanced',
  app_version text,
  activated_seed_version integer not null default 1,
  activated_at timestamptz not null default now(),
  last_seen_at timestamptz,
  last_submission_at timestamptz,
  revoked_at timestamptz
);

create index if not exists unit_installations_deployment_idx on public.unit_installations(deployment_id, status);

create table if not exists public.unit_metric_snapshots (
  id bigint generated always as identity primary key,
  deployment_id uuid not null references public.unit_deployments(id) on delete cascade,
  installation_id uuid not null references public.unit_installations(id) on delete restrict,
  reporting_date date not null,
  schema_version integer not null default 1,
  revision integer not null default 1,
  metrics jsonb not null check (jsonb_typeof(metrics) = 'object'),
  submitted_at timestamptz not null default now(),
  unique (deployment_id, reporting_date, revision)
);

create index if not exists unit_metric_snapshots_latest_idx on public.unit_metric_snapshots(deployment_id, reporting_date desc, revision desc);

create table if not exists public.admin_audit_log (
  id bigint generated always as identity primary key,
  actor text not null,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  deployment_id uuid references public.unit_deployments(id) on delete set null,
  before_data jsonb,
  after_data jsonb,
  request_id uuid,
  ip inet,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_log_deployment_idx on public.admin_audit_log(deployment_id, created_at desc);
create index if not exists admin_audit_log_entity_idx on public.admin_audit_log(entity_type, entity_id, created_at desc);

alter table public.unit_deployments enable row level security;
alter table public.unit_seed_revisions enable row level security;
alter table public.unit_activation_codes enable row level security;
alter table public.unit_installations enable row level security;
alter table public.unit_metric_snapshots enable row level security;
alter table public.admin_audit_log enable row level security;

revoke all on public.unit_deployments from anon, authenticated;
revoke all on public.unit_seed_revisions from anon, authenticated;
revoke all on public.unit_activation_codes from anon, authenticated;
revoke all on public.unit_installations from anon, authenticated;
revoke all on public.unit_metric_snapshots from anon, authenticated;
revoke all on public.admin_audit_log from anon, authenticated;

create or replace function public.touch_unit_deployment_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists unit_deployments_touch_updated_at on public.unit_deployments;
create trigger unit_deployments_touch_updated_at before update on public.unit_deployments
for each row execute function public.touch_unit_deployment_updated_at();
