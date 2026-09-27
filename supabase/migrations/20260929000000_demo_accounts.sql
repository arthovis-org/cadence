-- Cadence: demo workspaces
-- "Try the demo" signs visitors in anonymously (Supabase anonymous sign-ins) and fills their own private
-- workspace with sample data. These functions keep old demo accounts from piling up.

-- Deleting an account cascades through its workspace. Invoices reference clients; with RESTRICT the cascade
-- could fail depending on delete order, so check the reference at the end of the statement instead.
-- (Deleting a client that still has invoices is still refused.)
alter table public.invoices drop constraint if exists invoices_client_id_fkey;
alter table public.invoices
  add constraint invoices_client_id_fkey foreign key (client_id) references public.clients (id) on delete no action;

-- Remove demo accounts older than two days. Called whenever someone starts a new demo.
create or replace function public.cleanup_demo_accounts()
returns integer
language sql
security definer
set search_path = ''
as $$
  with removed as (
    delete from auth.users
     where is_anonymous
       and created_at < now() - interval '2 days'
    returning 1
  )
  select count(*)::integer from removed;
$$;

-- "Exit demo": remove the current demo account right away. Only works for anonymous (demo) accounts.
create or replace function public.delete_my_demo_account()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.users where id = auth.uid() and is_anonymous;
$$;

revoke execute on function public.cleanup_demo_accounts() from public, anon;
revoke execute on function public.delete_my_demo_account() from public, anon;
grant execute on function public.cleanup_demo_accounts() to authenticated;
grant execute on function public.delete_my_demo_account() to authenticated;
