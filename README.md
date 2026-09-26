# Cadence

A personal time tracker: clients, projects and tasks, a timer, cascading hourly rates with history, detailed
reports, and invoices with payment receipts (PDF).

- **Frontend:** Vite + React + TypeScript, Mantine UI, TanStack Query, hosted as a static site on GitHub Pages.
- **Backend:** Supabase (Postgres + Auth). All data access is protected by row-level security.

## Rates

Hourly rates are set per **project**, with optional **task** overrides. A rate can apply to all time or start on a
date, so raising a rate never changes the value of time already logged before that date. Billable time without a
rate is flagged as "No rate" instead of silently counting as zero.

## Development

```bash
npm install
npm run dev
```

Supabase settings live in `.env` (the URL and anon key are public by design; never commit the service_role key).

## Database

The schema is in `supabase/migrations/`. To set up a fresh Supabase project, paste each migration file into the
Supabase **SQL Editor** and run it, in order:

1. `20260926000000_init.sql` – tables and security rules
2. `20260927000000_invoicing.sql` – invoice/receipt numbering, totals, payment status
3. `20260928000000_project_rates_only.sql` – moves client/default rates onto projects and removes them

## Deploy

Every push to `main` builds the app and publishes it to GitHub Pages via `.github/workflows/deploy.yml`
(repository **Settings → Pages → Source: GitHub Actions**).
