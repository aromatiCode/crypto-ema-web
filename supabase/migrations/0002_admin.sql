-- 0002_admin.sql
-- Adds the admin_users table for the dashboard's admin page.
-- Default credentials: admin / admin (the user is expected to change
-- the password from the UI on first login).

create table if not exists public.admin_users (
  id              bigserial primary key,
  username        text        not null unique,
  password_hash   text        not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Only the service role can read/write. No anon access.
alter table public.admin_users enable row level security;

-- No policies: by default no one can read or write through the API.
-- All access goes through server routes using SUPABASE_SERVICE_ROLE_KEY.
