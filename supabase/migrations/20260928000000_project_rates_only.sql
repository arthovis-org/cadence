-- Cadence: rates live on projects (with optional task overrides) only.
-- Client rates and the workspace default rate are removed. Before removing them, their values are copied
-- onto the projects that relied on them, so no existing amount changes.

-- 1. Client rates -> the client's projects, for the period before the project had a rate of its own.
insert into public.rates (workspace_id, project_id, rate_cents, effective_from)
select cr.workspace_id, p.id, cr.rate_cents, cr.effective_from
  from public.rates cr
  join public.projects p on p.client_id = cr.client_id
 where cr.client_id is not null
   and cr.effective_from < coalesce(
         (select min(pr.effective_from) from public.rates pr where pr.project_id = p.id),
         'infinity'::date)
on conflict do nothing;

-- 2. Default rate (only if it was actually set) -> projects, for any period still without a rate.
insert into public.rates (workspace_id, project_id, rate_cents, effective_from)
select dr.workspace_id, p.id, dr.rate_cents, dr.effective_from
  from public.rates dr
  join public.projects p on p.workspace_id = dr.workspace_id
 where dr.client_id is null and dr.project_id is null and dr.task_id is null
   and dr.rate_cents > 0
   and dr.effective_from < coalesce(
         (select min(pr.effective_from) from public.rates pr where pr.project_id = p.id),
         'infinity'::date)
on conflict do nothing;

-- 3. Remove client and default rates, then the client column itself.
delete from public.rates where project_id is null and task_id is null;

drop index if exists public.rates_scope_date_uidx;
alter table public.rates drop column client_id;

alter table public.rates
  add constraint rates_one_scope check (num_nonnulls(project_id, task_id) = 1);

create unique index rates_scope_date_uidx on public.rates (
  workspace_id,
  coalesce(project_id, '00000000-0000-0000-0000-000000000000'),
  coalesce(task_id, '00000000-0000-0000-0000-000000000000'),
  effective_from
);

-- 4. New workspaces no longer get a default rate row.
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
  return ws;
end;
$$;

revoke execute on function public.create_workspace_for_user(uuid) from public, anon, authenticated;
