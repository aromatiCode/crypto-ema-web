# System Architecture & Flow Charts

## 1. High-level architecture

```mermaid
flowchart LR
    subgraph "User / Browser"
        A[Visitor]
        A1[Admin]
    end

    subgraph "Vercel (Next.js)"
        P[Next.js App\n/ → server-rendered table\n/api/last-updated]
        M[Middleware\nprotects /admin & /api/admin]
        S1[Server Component\napp/page.tsx]
        C1[Client Component\nTrendsTable.tsx]
        C2[Client Component\nNextRefresh.tsx]
        AR["/admin/login"]
        AD["/admin/dashboard"]
    end

    subgraph "GitHub Actions"
        CRON[schedule: every 5 min\nworkflow_dispatch: manual]
        RUN[run.py\npipeline entrypoint]
    end

    subgraph "MEXC"
        API[Futures Kline API\n/contract/mexc.com/api/v1/contract/kline]
    end

    subgraph "Supabase Postgres"
        DB1[(trend_transitions)]
        DB2[(admin_users)]
    end

    subgraph "Telegram"
        TG[Bot API\nsends EMA alert]
    end

    A --> P
    A1 -->|"visit /admin/login"| AR
    AR -->|"POST /api/admin/login"| M
    M -->|"if authed"| AD

    P --> S1
    S1 -->|"fetchLatestTrends()"| DB1
    S1 --> C1
    S1 --> C2
    C1 -->|"poll /api/last-updated every 60s"| P
    C2 -->|"countdown to next 5-min boundary"| P
    AD -->|"GET /api/admin/tokens"| M
    AD -->|"POST /api/admin/change-password"| M
    AD -->|"POST /api/admin/tokens"| M

    CRON -->|"trigger"| RUN
    RUN -->|"1. fetch EMAs (ThreadPoolExecutor 8 workers)"| API
    API -->|"2. returns klines"| RUN
    RUN -->|"3. compute EMA20/50/100/200"| RUN
    RUN -->|"4. determine trend (BULLISH/BEARISH/NEUTRAL)"| RUN
    RUN -->|"5. insert transitions where trend changed"| DB1
    RUN -->|"6. check Telegram alert condition"| RUN
    RUN -->|"7. send alert if condition fires"| TG

    M -->|"verify session cookie\n(jwtVerify via jose)"| M
    M -->|"admin add/remove token\n→ GitHub Contents API\n→ commit config.json"| GITHUB[GitHub repo\nconfig.json + cloud/config.json]
    GITHUB -->|"triggers"| VERCEL_REDEPLOY[Vercel auto-redeploys]
    VERCEL_REDEPLOY --> P
```

## 2. GitHub Actions pipeline flow (one run)

```mermaid
flowchart TD
    START([GitHub Actions trigger\ncron every 5 min or manual]) --> LOAD["load_config()\nreads cloud/config.json"]
    LOAD --> LOOP{"For each token × timeframe\n(28 tokens × 3 TFs = 84 pairs)"}
    LOOP --> FETCH["calculateEMA(token, timeframe)\n  → get_mexc_klines()\n  → calculate_ema_values()\n  → determine_trend()"]
    FETCH --> STORE["Store result in\nresults_by_token[token][timeframe]"]
    STORE --> LOOP

    LOOP --> TRANSITIONS{"For each stored result"}
    TRANSITIONS --> READ_DB["get_latest_trend(client, token, timeframe)\nfrom Supabase trend_transitions"]
    READ_DB --> COMPARE{"result.trend != prior_trend?"}
    COMPARE -->|yes| INSERT["insert_transition()\nwrites new_trend, EMA values,\nclose, candle_time, created_at"]
    COMPARE -->|no| SKIP
    INSERT --> NEXT_T
    SKIP --> NEXT_T
    NEXT_T --> TRANSITIONS

    TRANSITIONS --> ALERTS{"For each token\n(all 3 timeframes present)"}
    ALERTS --> READ_STATE["get_combined_alert_state(client, token)\nfrom latest transitions"]
    READ_STATE --> CHECK_ALERT{"alert_condition_met\n(5m==15m != NEUTRAL\n  and 1m confirms)"}
    CHECK_ALERT -->|yes| SEND["send_alert()\nbuild_alert_message()\nsend_telegram_message()"]
    CHECK_ALERT -->|no| NEXT_A
    SEND --> NEXT_A
    NEXT_A --> ALERTS

    ALERTS --> END([Log summary:\ntransitions_written, alerts_sent\nexit 0])
```

## 3. First-visit user flow (public dashboard)

```mermaid
flowchart TD
    START([Visitor opens Vercel URL]) --> SSR["Next.js Server Component\napp/page.tsx renders"]
    SSR --> READ_CFG["Read config.tokens\nfrom lib/config.ts"]
    READ_CFG --> FETCH_DB["fetchLatestTrends(tokens)\n→ Supabase service_role\n→ DISTINCT ON (token, timeframe)\nORDER BY created_at DESC"]
    FETCH_DB --> HAS_DATA{"Any rows in\ntrend_transitions?"}
    HAS_DATA -->|yes| RENDER_TABLE["Render TrendsTable\nwith live badges + EMA values"]
    HAS_DATA -->|no| RENDER_EMPTY["Render 'NO DATA' badges\nfor all tokens"]
    RENDER_TABLE --> CLIENT_POLL["Client setInterval 60s\n→ GET /api/last-updated\n→ if changed, router.refresh()"]
    RENDER_EMPTY --> CLIENT_POLL
    CLIENT_POLL --> REFRESH{New data?}
    REFRESH -->|yes| SSR
    REFRESH -->|no| CLIENT_POLL
```

## 4. Admin authentication & token management flow

```mermaid
flowchart TD
    START([Admin visits /admin]) --> MIDDLEWARE["middleware.ts\ncheck ema_admin_session cookie"]
    MIDDLEWARE --> HAS_COOKIE{"Valid session\ncookie present?"}
    HAS_COOKIE -->|no| REDIRECT["Redirect to\n/admin/login"]
    HAS_COOKIE -->|yes| DASHBOARD["Serve /admin/dashboard\n(server component)"]

    REDIRECT --> LOGIN_FORM["AdminLoginForm.tsx\nusername + password fields"]
    LOGIN_FORM --> POST_LOGIN["POST /api/admin/login\n{username, password}"]
    POST_LOGIN --> VERIFY["verifyCredentials()\n  → seedDefaultAdminIfMissing()\n  → getAdminRow()\n  → bcrypt.compare()"]
    VERIFY --> VALID{"Correct?"}
    VALID -->|no| LOGIN_ERROR["Return 401\n'Invalid username or password'"]
    VALID -->|yes| SIGN["signSession(username)\n→ HMAC-SHA256 JWT\nvia jose SignJWT"]
    SIGN --> SET_COOKIE["Set HTTP-only cookie\nema_admin_session\n(maxAge 8h, sameSite lax)"]
    SET_COOKIE --> DASHBOARD

    DASHBOARD --> DASH_UI["AdminDashboard.tsx\n- token list (GET /api/admin/tokens)\n- add token form (POST /api/admin/tokens)\n- remove token button (DELETE /api/admin/tokens)\n- change password form (POST /api/admin/change-password)"]

    DASH_UI --> ADD_TOKEN["POST /api/admin/tokens\n{token: 'SOL'}"]
    ADD_TOKEN --> GITHUB_READ["github.ts: readConfigFiles()\nGET /repos/.../contents/config.json\nGET /repos/.../contents/cloud/config.json"]
    GITHUB_READ --> VALIDATE_TOKEN{"Valid symbol?\n2-20 uppercase\nalphanumeric"}
    VALIDATE_TOKEN -->|no| ERROR["Return 400\n'Invalid token symbol'"]
    VALIDATE_TOKEN -->|yes| CHECK_DUP{"Already in list?"}
    CHECK_DUP -->|yes| ERROR2["Return 400\n'Already in list'"]
    CHECK_DUP -->|no| GITHUB_WRITE["github.ts: putFile()\nPUT /repos/.../contents/config.json\nPUT /repos/.../contents/cloud/config.json\nmessage: 'admin: add SOL'"]
    GITHUB_WRITE --> SUCCESS["Return {ok: true}\nVercel auto-redeploys\nGitHub Actions picks up\nnew file on next cron run"]

    DASH_UI --> REMOVE_TOKEN["DELETE /api/admin/tokens\n{token: 'SOL'}"]
    REMOVE_TOKEN --> GITHUB_READ2["github.ts: readConfigFiles()"]
    GITHUB_READ2 --> CHECK_EXISTS{"In list?"}
    CHECK_EXISTS -->|no| ERROR3["Return 400\n'Not in list'"]
    CHECK_EXISTS -->|yes| GITHUB_WRITE2["github.ts: putFile()\nmessage: 'admin: remove SOL'"]
    GITHUB_WRITE2 --> SUCCESS

    DASH_UI --> CHANGE_PW["POST /api/admin/change-password\n{currentPassword, newPassword}"]
    CHANGE_PW --> VERIFY_CURRENT["bcrypt.compare(currentPassword,\nstored password_hash)"]
    VERIFY_CURRENT -->|wrong| PW_ERROR["Return 400\n'Current password incorrect'"]
    VERIFY_CURRENT -->|correct| HASH_NEW["bcrypt.hash(newPassword, 10)"]
    HASH_NEW --> UPDATE_DB["UPDATE admin_users\nSET password_hash = newHash\nWHERE username = ?"]
    UPDATE_DB --> PW_SUCCESS["Return {ok: true}"]
```

## 5. Data model relationships

```mermaid
erDiagram
    trend_transitions {
        bigserial id PK
        text token
        text timeframe "1m | 5m | 15m"
        text previous_trend "BULLISH | BEARISH | NEUTRAL"
        text new_trend "BULLISH | BEARISH | NEUTRAL"
        numeric ema20
        numeric ema50
        numeric ema100
        numeric ema200
        numeric close
        timestamptz candle_time
        timestamptz created_at
    }

    admin_users {
        bigserial id PK
        text username UK
        text password_hash "bcrypt"
        timestamptz created_at
        timestamptz updated_at
    }
```

## 6. File-to-route map

```
app/
  page.tsx                          → /
  layout.tsx                        → HTML shell
  globals.css                       → global styles
  api/
    last-updated/route.ts           → GET /api/last-updated
    admin/
      login/route.ts                → POST /api/admin/login
      logout/route.ts               → POST /api/admin/logout
      me/route.ts                   → GET /api/admin/me
      change-password/route.ts      → POST /api/admin/change-password
      tokens/route.ts               → GET/POST/DELETE /api/admin/tokens
  admin/
    page.tsx                        → /admin (redirect)
    login/page.tsx                  → /admin/login
    dashboard/page.tsx              → /admin/dashboard

components/
  TrendsTable.tsx                   → main dashboard table (client)
  TrendBadge.tsx                    → colored trend badge
  DetailRow.tsx                     → expandable EMA detail panel
  NextRefresh.tsx                   → countdown timer (client)
  AdminLoginForm.tsx                → login form (client)
  AdminDashboard.tsx                → admin CRUD UI (client)

lib/
  trends.ts                         → TypeScript types (TokenTrend, TimeframeState)
  data.ts                           → Supabase fetch (server-side, service role)
  supabase.ts                       → server Supabase client
  supabase-browser.ts               → browser Supabase client (anon key)
  admin.ts                          → session, login, password, seed admin
  github.ts                         → GitHub Contents API client
  config.ts                         → static app config (tokens, timeframes)

cloud/
  config.json                       ← mirrors repo-root config.json
  config_loader.py                  → loads cloud/config.json
  mexc.py                           → MEXC klines + EMA math
  supabase_client.py                → Supabase writes + reads
  telegram.py                       → Telegram alert builder + sender
  run.py                            → entrypoint: fetch → compare → write → alert

supabase/migrations/
  0001_init.sql                     → trend_transitions table + indexes + RLS
  0002_admin.sql                    → admin_users table + RLS

middleware.ts                       → protects /admin and /api/admin routes
vercel.json                         → forces Next.js framework detection
```

## 7. Timing diagram (steady state)

```mermaid
gantt
    title Steady-state timeline (GitHub Actions + Vercel + Client)
    dateFormat  s
    axisFormat %M:%S

    section GitHub Actions
    Run #1 (fetch 84 pairs)     :a1, 0, 60s
    Gap until next trigger      :a2, after a1, 60s
    Run #2 (fetch 84 pairs)     :a3, after a2, 60s
    Gap until next trigger      :a4, after a3, 60s

    section Vercel (server)
    SSR render (revalidate=60)  :v1, 0, 5s
    Idle until revalidate       :v2, after v1, 55s
    SSR render (revalidate=60)  :v3, after v2, 5s

    section Browser (client)
    Poll /api/last-updated      :c1, 0, 60s
    Poll /api/last-updated      :c2, 60s, 60s
    Poll /api/last-updated      :c3, 120s, 60s
    router.refresh() on change  :crit, after c3, 0s
```

## 8. Environment variables reference

| Variable | Where set | Used by | Purpose |
|---|---|---|---|
| `SUPABASE_URL` | Vercel + GitHub | pipeline + web | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel + GitHub | pipeline + web | Server-side Supabase access |
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel only | web (browser) | Supabase URL for anon client |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel only | web (browser) | Anon key for RLS reads |
| `TELEGRAM_BOT_TOKEN` | GitHub only | pipeline | Telegram bot token |
| `TELEGRAM_CHAT_ID` | GitHub only | pipeline | Telegram target chat |
| `ADMIN_SESSION_SECRET` | Vercel only | web (server) | HMAC secret for session cookies |
| `GITHUB_TOKEN` | Vercel only | web (server) | GitHub PAT for Contents API |
| `GITHUB_REPO_OWNER` | Vercel only | web (server) | GitHub username/org |
| `GITHUB_REPO_NAME` | Vercel only | web (server) | Repo name |
| `GITHUB_REPO_BRANCH` | Vercel only | web (server) | Branch (defaults to `main`) |
