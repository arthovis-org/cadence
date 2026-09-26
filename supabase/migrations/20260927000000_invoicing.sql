-- Cadence: invoicing logic
-- Atomic invoice/receipt numbering, automatic invoice totals, payment status, and a transactional create_invoice().

alter table public.workspaces
  add column if not exists receipt_prefix      text not null default 'RCPT-',
  add column if not exists next_receipt_number integer not null default 1,
  add column if not exists payment_terms_days  integer not null default 14;

-- ---------------------------------------------------------------------------
-- Numbering (runs with the caller's permissions; RLS limits it to their workspace)
-- ---------------------------------------------------------------------------

create or replace function public.allocate_invoice_number(ws uuid)
returns text
language plpgsql
set search_path = ''
as $$
declare
  result text;
begin
  update public.workspaces
     set next_invoice_number = next_invoice_number + 1
   where id = ws
  returning invoice_prefix || lpad((next_invoice_number - 1)::text, 4, '0') into result;
  if result is null then
    raise exception 'workspace not found';
  end if;
  return result;
end;
$$;

create or replace function public.allocate_receipt_number(ws uuid)
returns text
language plpgsql
set search_path = ''
as $$
declare
  result text;
begin
  update public.workspaces
     set next_receipt_number = next_receipt_number + 1
   where id = ws
  returning receipt_prefix || lpad((next_receipt_number - 1)::text, 4, '0') into result;
  if result is null then
    raise exception 'workspace not found';
  end if;
  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Totals: always derived from the lines
-- ---------------------------------------------------------------------------

create or replace function public.invoice_recalc(inv uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  sub integer;
begin
  select coalesce(sum(amount_cents), 0) into sub from public.invoice_lines where invoice_id = inv;
  update public.invoices i
     set subtotal_cents = sub,
         tax_cents      = round(sub * i.tax_percent / 100),
         total_cents    = sub + round(sub * i.tax_percent / 100)
   where i.id = inv;
end;
$$;

create or replace function public.invoice_lines_changed()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform public.invoice_recalc(coalesce(new.invoice_id, old.invoice_id));
  return null;
end;
$$;

create trigger invoice_lines_recalc
after insert or update or delete on public.invoice_lines
for each row execute function public.invoice_lines_changed();

create or replace function public.invoice_tax_changed()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform public.invoice_recalc(new.id);
  return null;
end;
$$;

create trigger invoice_tax_recalc
after update of tax_percent on public.invoices
for each row execute function public.invoice_tax_changed();

-- ---------------------------------------------------------------------------
-- Payments: receipt numbers and paid status
-- ---------------------------------------------------------------------------

create or replace function public.payments_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.receipt_number is null or new.receipt_number = '' then
    new.receipt_number := public.allocate_receipt_number(new.workspace_id);
  end if;
  return new;
end;
$$;

create trigger payments_receipt_number
before insert on public.payments
for each row execute function public.payments_before_insert();

create or replace function public.payments_changed()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  inv uuid := coalesce(new.invoice_id, old.invoice_id);
  paid integer;
begin
  select coalesce(sum(amount_cents), 0) into paid from public.payments where invoice_id = inv;
  update public.invoices i
     set status = case
                    when i.status = 'void' then 'void'
                    when paid >= i.total_cents and i.total_cents > 0 then 'paid'
                    when i.status = 'paid' then 'sent'
                    else i.status
                  end
   where i.id = inv;
  return null;
end;
$$;

create trigger payments_status
after insert or update or delete on public.payments
for each row execute function public.payments_changed();

-- ---------------------------------------------------------------------------
-- Create an invoice with its lines and link the billed time entries, all in one transaction.
-- p_lines: [{ "description": text, "quantity": number, "rate_cents": int, "amount_cents": int }, ...]
-- ---------------------------------------------------------------------------

create or replace function public.create_invoice(
  p_workspace   uuid,
  p_client      uuid,
  p_issue_date  date,
  p_due_date    date,
  p_currency    text,
  p_tax_percent numeric,
  p_notes       text,
  p_snapshot    jsonb,
  p_lines       jsonb,
  p_entry_ids   uuid[]
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  inv uuid;
  already integer;
begin
  select count(*) into already
    from public.time_entries
   where id = any (p_entry_ids) and invoice_id is not null;
  if already > 0 then
    raise exception '% of the selected time entries are already on another invoice', already;
  end if;

  insert into public.invoices (workspace_id, client_id, number, issue_date, due_date, currency, tax_percent, notes, snapshot)
  values (p_workspace, p_client, public.allocate_invoice_number(p_workspace), p_issue_date, p_due_date,
          p_currency, coalesce(p_tax_percent, 0), p_notes, coalesce(p_snapshot, '{}'::jsonb))
  returning id into inv;

  insert into public.invoice_lines (workspace_id, invoice_id, position, description, quantity, rate_cents, amount_cents)
  select p_workspace, inv, (l.ord - 1)::integer, l.value ->> 'description', (l.value ->> 'quantity')::numeric,
         (l.value ->> 'rate_cents')::integer, (l.value ->> 'amount_cents')::integer
    from jsonb_array_elements(p_lines) with ordinality as l(value, ord);

  update public.time_entries set invoice_id = inv where id = any (p_entry_ids);

  return inv;
end;
$$;

-- Voiding an invoice releases its time entries so they can be billed again.
create or replace function public.void_invoice(p_invoice uuid)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.invoices set status = 'void' where id = p_invoice;
  update public.time_entries set invoice_id = null where invoice_id = p_invoice;
end;
$$;

grant execute on function
  public.allocate_invoice_number(uuid),
  public.allocate_receipt_number(uuid),
  public.invoice_recalc(uuid),
  public.create_invoice(uuid, uuid, date, date, text, numeric, text, jsonb, jsonb, uuid[]),
  public.void_invoice(uuid)
  to authenticated;
