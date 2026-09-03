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

1. **Supabase**: create a project, run both migrations in the SQL editor:
   - `supabase/migrations/0001_init.sql`
   - `supabase/migrations/0002_admin.sql`
2. **GitHub**: push this repo (public so free Actions minutes apply). Add secrets for manual pipeline runs:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_CHAT_ID`
3. **Vercel**: import the repo. The Next.js app lives at the repo root, so:
   - **Root Directory**: leave empty (default)
   - **Framework Preset**: Next.js (auto-detected)
   - Add env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, plus the admin vars (`ADMIN_SESSION_SECRET`, `GITHUB_TOKEN`, `GITHUB_REPO_OWNER`, `GITHUB_REPO_NAME`, `GITHUB_REPO_BRANCH`)
4. **Railway**: deploy the `cloud/` directory as a worker:
   - Create a Railway project
   - Connect the GitHub repo
   - Set **Root Directory** to `cloud`
   - Add env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`
   - Railway will auto-detect Python, install from `requirements.txt`, and run `python cloud/run.py` forever
5. **Stop** any local `main.py` process; Railway is now the source of truth.

## Editing the token list

**Via the admin UI** (recommended): sign in at `/admin/login` with default credentials `admin` / `admin`, then add or remove tokens from the dashboard. Changes are committed to the repo via the GitHub Contents API; Vercel auto-redeploys within ~30-60s. **Change the default password from the UI immediately after first login.**

**Manually**: edit `config.json` at the repo root and `cloud/config.json` (the pipeline reads its own copy). Push to deploy both.

## Admin setup (one-time)

In addition to the env vars above, set these in **Vercel** (Settings → Environment Variables):

- `ADMIN_SESSION_SECRET` — a random string, at least 16 chars (e.g. `openssl rand -hex 32`)
- `GITHUB_TOKEN` — a GitHub Personal Access Token with write access to this repo's contents
- `GITHUB_REPO_OWNER` — e.g. `aromatiCode`
- `GITHUB_REPO_NAME` — e.g. `crypto-ema-web`
- `GITHUB_REPO_BRANCH` — `main` (default if omitted)

### Getting the GitHub token

1. Go to https://github.com/settings/tokens
2. Click **Generate new token** → **Fine-grained token** (recommended)
3. Give it a name like `crypto-ema-admin`
4. Under **Repository access**, select **Only select repositories** and choose this repo
5. Under **Permissions** → **Repository permissions**:
   - Set **Contents** to **Read and write**
6. Click **Generate token** and copy it immediately

Then run the new migration in Supabase: `supabase/migrations/0002_admin.sql`.

The first sign-in (with `admin` / `admin`) automatically creates the `admin_users` row.

## Pipeline

The Python worker runs on Railway as a long-lived process (`while True`). It fetches EMAs from MEXC, writes trend transitions to Supabase, and sends Telegram alerts when the 5m+15m+1m condition fires.

## Local development

### Pipeline (worker)

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
