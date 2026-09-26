-- Cadence: initial schema
-- Every table is scoped to a workspace so the app can become multi-user later.
-- Access is enforced with row-level security: a user only sees rows of workspaces they belong to.

-- ---------------------------------------------------------------------------
-- Workspaces & membership
-- ---------------------------------------------------------------------------

create table public.workspaces (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null default 'My workspace',
  owner_id            uuid not null references auth.users (id) on delete cascade,
  currency            text not null default 'USD',
  week_start          smallint not null default 1 check (week_start between 0 and 6), -- 0 = Sunday
  timezone            text not null default 'UTC',
  default_tax_percent numeric(5, 2) not null default 0,
  invoice_prefix      text not null default 'INV-',
  next_invoice_number integer not null default 1,
  business_name       text,
  business_email      text,
  business_address    text,
  created_at          timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  role         text not null default 'owner' check (role in ('owner', 'admin', 'member')),
  created_at   timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create index workspace_members_user_idx on public.workspace_members (user_id);

create or replace function public.is_workspace_member(ws uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws and m.user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- Clients, projects, tasks
-- ---------------------------------------------------------------------------

create table public.clients (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name         text not null,
  email        text,
  address      text,
  currency     text, -- null = workspace currency
  notes        text,
  archived     boolean not null default false,
  created_at   timestamptz not null default now()
);

create index clients_workspace_idx on public.clients (workspace_id);

create table public.projects (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  client_id    uuid references public.clients (id) on delete set null,
  name         text not null,
  color        text not null default '#228be6',
  billable     boolean not null default true,
  budget_hours numeric(10, 2),
  notes        text,
  archived     boolean not null default false,
  created_at   timestamptz not null default now()
);

create index projects_workspace_idx on public.projects (workspace_id);
create index projects_client_idx on public.projects (client_id);

create table public.tasks (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces (id) on delete cascade,
  project_id     uuid not null references public.projects (id) on delete cascade,
  name           text not null,
  estimate_hours numeric(10, 2),
  done           boolean not null default false,
  created_at     timestamptz not null default now()
);

create index tasks_project_idx on public.tasks (project_id);

-- ---------------------------------------------------------------------------
-- Rates (dated, cascading)
-- A row with no client/project/task is the workspace default rate.
-- Resolution for a time entry: task -> project -> client -> workspace default,
-- using the latest row whose effective_from <= the entry date.
-- rate_cents = null means "stop overriding from this date, inherit from the level above".
-- ---------------------------------------------------------------------------

create table public.rates (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces (id) on delete cascade,
  client_id      uuid references public.clients (id) on delete cascade,
  project_id     uuid references public.projects (id) on delete cascade,
  task_id        uuid references public.tasks (id) on delete cascade,
  rate_cents     integer check (rate_cents >= 0),
  effective_from date not null default current_date,
  created_at     timestamptz not null default now(),
  check (num_nonnulls(client_id, project_id, task_id) <= 1)
);

create unique index rates_scope_date_uidx on public.rates (
  workspace_id,
  coalesce(client_id, '00000000-0000-0000-0000-000000000000'),
  coalesce(project_id, '00000000-0000-0000-0000-000000000000'),
  coalesce(task_id, '00000000-0000-0000-0000-000000000000'),
  effective_from
);

-- ---------------------------------------------------------------------------
-- Invoices, payments (receipts)
-- Issued invoices are snapshots: lines, rates and addresses are copied, never recomputed.
-- ---------------------------------------------------------------------------

create table public.invoices (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces (id) on delete cascade,
  client_id      uuid not null references public.clients (id) on delete restrict,
  number         text not null,
  status         text not null default 'draft' check (status in ('draft', 'sent', 'paid', 'void')),
  issue_date     date not null default current_date,
  due_date       date,
  currency       text not null default 'USD',
  subtotal_cents integer not null default 0,
  tax_percent    numeric(5, 2) not null default 0,
  tax_cents      integer not null default 0,
  total_cents    integer not null default 0,
  notes          text,
  snapshot       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now(),
  unique (workspace_id, number)
);

create index invoices_workspace_idx on public.invoices (workspace_id, issue_date desc);

create table public.invoice_lines (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  invoice_id   uuid not null references public.invoices (id) on delete cascade,
  position     integer not null default 0,
  description  text not null,
  quantity     numeric(10, 2) not null default 1,
  rate_cents   integer not null default 0,
  amount_cents integer not null default 0
);

create index invoice_lines_invoice_idx on public.invoice_lines (invoice_id);

create table public.payments (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces (id) on delete cascade,
  invoice_id     uuid not null references public.invoices (id) on delete cascade,
  amount_cents   integer not null check (amount_cents > 0),
  paid_at        date not null default current_date,
  method         text,
  receipt_number text,
  notes          text,
  created_at     timestamptz not null default now()
);

create index payments_invoice_idx on public.payments (invoice_id);

-- ---------------------------------------------------------------------------
-- Time entries
-- A running timer is an entry with end_at = null (at most one per user).
-- ---------------------------------------------------------------------------

create table public.time_entries (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id   uuid references public.projects (id) on delete set null,
  task_id      uuid references public.tasks (id) on delete set null,
  description  text not null default '',
  start_at     timestamptz not null,
  end_at       timestamptz,
  billable     boolean not null default true,
  invoice_id   uuid references public.invoices (id) on delete set null,
  tags         text[] not null default '{}',
  created_at   timestamptz not null default now(),
  check (end_at is null or end_at >= start_at)
);

create index time_entries_workspace_start_idx on public.time_entries (workspace_id, start_at desc);
create index time_entries_project_idx on public.time_entries (project_id);
create index time_entries_invoice_idx on public.time_entries (invoice_id);
create unique index time_entries_one_running_uidx on public.time_entries (user_id) where end_at is null;

-- Keep project_id consistent with the chosen task.
create or replace function public.time_entries_sync_project()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.task_id is not null then
    select t.project_id into new.project_id from public.tasks t where t.id = new.task_id;
  end if;
  return new;
end;
$$;

create trigger time_entries_sync_project
before insert or update of task_id, project_id on public.time_entries
for each row execute function public.time_entries_sync_project();

-- ---------------------------------------------------------------------------
-- Saved report presets
-- ---------------------------------------------------------------------------

create table public.saved_reports (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name         text not null,
  config       jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- New users automatically get a workspace
-- ---------------------------------------------------------------------------

create or replace function public.create_workspace_for_user(uid uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  ws uuid;
begin
  insert into public.workspaces (owner_id) values (uid) returning id into ws;
  insert into public.workspace_members (workspace_id, user_id, role) values (ws, uid, 'owner');
  insert into public.rates (workspace_id, rate_cents, effective_from) values (ws, 0, '2000-01-01');
  return ws;
end;
$$;

revoke execute on function public.create_workspace_for_user(uuid) from public, anon, authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.create_workspace_for_user(new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Backfill: users created before this migration ran.
select public.create_workspace_for_user(u.id)
from auth.users u
where not exists (select 1 from public.workspace_members m where m.user_id = u.id);

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.workspaces        enable row level security;
alter table public.workspace_members enable row level security;
alter table public.clients           enable row level security;
alter table public.projects          enable row level security;
alter table public.tasks             enable row level security;
alter table public.rates             enable row level security;
alter table public.invoices          enable row level security;
alter table public.invoice_lines     enable row level security;
alter table public.payments          enable row level security;
alter table public.time_entries      enable row level security;
alter table public.saved_reports     enable row level security;

create policy "members read workspace" on public.workspaces
  for select to authenticated using (public.is_workspace_member(id));
create policy "members update workspace" on public.workspaces
  for update to authenticated using (public.is_workspace_member(id)) with check (public.is_workspace_member(id));

create policy "read own memberships" on public.workspace_members
  for select to authenticated using (user_id = auth.uid());

do $$
declare
  t text;
begin
  foreach t in array array['clients', 'projects', 'tasks', 'rates', 'invoices', 'invoice_lines',
                           'payments', 'time_entries', 'saved_reports']
  loop
    execute format(
      'create policy "members manage rows" on public.%I for all to authenticated
         using (public.is_workspace_member(workspace_id))
         with check (public.is_workspace_member(workspace_id))', t);
  end loop;
end;
$$;

-- Time entries are additionally private to the user who logged them.
create policy "own entries only" on public.time_entries
  as restrictive for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Explicit Data API grants (newer Supabase projects don't expose tables by default).
grant usage on schema public to authenticated;
grant select, update on public.workspaces to authenticated;
grant select on public.workspace_members to authenticated;
grant select, insert, update, delete on
  public.clients, public.projects, public.tasks, public.rates, public.invoices,
  public.invoice_lines, public.payments, public.time_entries, public.saved_reports
  to authenticated;
grant execute on function public.is_workspace_member(uuid) to authenticated;
