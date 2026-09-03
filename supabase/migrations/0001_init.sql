-- 0001_init.sql
-- Creates the trend_transitions table for the MEXC EMA dashboard.
-- Only trend transitions are stored; each row captures the EMA values,
-- close price, and candle time of the new state.

create table if not exists public.trend_transitions (
  id              bigserial primary key,
  token           text        not null,
  timeframe       text        not null check (timeframe in ('1m','5m','15m')),
  previous_trend  text        not null check (previous_trend in ('BULLISH','BEARISH','NEUTRAL')),
  new_trend       text        not null check (new_trend     in ('BULLISH','BEARISH','NEUTRAL')),
  ema20           numeric     not null,
  ema50           numeric     not null,
  ema100          numeric     not null,
  ema200          numeric     not null,
  close           numeric     not null,
  candle_time     timestamptz not null,
  created_at      timestamptz not null default now()
);

-- Hot path: latest transition per (token, timeframe)
create index if not exists trend_transitions_latest_idx
  on public.trend_transitions (token, timeframe, created_at desc);

-- History queries
create index if not exists trend_transitions_created_idx
  on public.trend_transitions (created_at desc);

-- Public read, no auth.
alter table public.trend_transitions enable row level security;

create policy "public read"
  on public.trend_transitions for select
  to anon, authenticated
  using (true);

-- No insert policy for anon/authenticated. Writes happen via the service
-- role key from the GitHub Actions pipeline.
