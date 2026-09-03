# MEXC EMA Web

Cloud-deployed crypto EMA trend dashboard. Tracks MEXC Futures EMAs for a list of tokens across three timeframes (1m / 5m / 15m), stores trend transitions in Supabase, displays them on a Next.js site hosted on Vercel, and forwards the same Telegram alerts the original local script sent.

## Architecture

```
GitHub Actions (cron every 5 min)
        │
        ▼
   Python pipeline  ──►  Supabase Postgres  ◄──  Next.js (Vercel)
        │                                              ▲
        └──────►  Telegram Bot API                      │
                                                       │
                                          (public read, no auth)
```

## Repo layout

```
.
├── config.json                  # tokens + timeframes (used by the Next.js app)
├── .github/workflows/           # GitHub Actions cron + manual run
├── cloud/                       # Python data pipeline
│   ├── config.json              # mirror of repo-root config for the pipeline
│   ├── mexc.py
│   ├── config_loader.py
│   ├── supabase_client.py
│   ├── telegram.py
│   ├── run.py
│   └── requirements.txt
├── supabase/migrations/         # SQL migrations
└── app/, components/, lib/      # Next.js app (deployed to Vercel)
```

## One-time setup

1. **Supabase**: create a project, run `supabase/migrations/0001_init.sql` in the SQL editor.
2. **GitHub**: push this repo (public so free Actions minutes apply). Add secrets:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_CHAT_ID`
3. **Vercel**: import the repo. The Next.js app lives at the repo root, so:
   - **Root Directory**: leave empty (default)
   - **Framework Preset**: Next.js (auto-detected)
   - **Build Command**: `next build` (default)
   - Add env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. **Trigger** the GitHub Action once via `workflow_dispatch` to seed the DB.
5. **Stop** any local `main.py` process; the cloud pipeline is now the source of truth.

## Editing the token list

Edit `config.json` at the repo root and also `cloud/config.json` (the pipeline reads its own copy). Push to deploy both.

## Local development

### Pipeline

```bash
cd cloud
pip install -r requirements.txt
SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... python run.py
```

### Web

```bash
yarn install
yarn dev
```
