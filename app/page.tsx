import TrendsTable from "@/components/TrendsTable";
import NextRefresh from "@/components/NextRefresh";
import { fetchLatestTrends } from "@/lib/data";
import { TIMEFRAMES } from "@/lib/trends";
import { config } from "@/lib/config";

export const revalidate = 60;

const tokens = config.tokens;

export default async function Page() {
  const { tokens: tokenTrends, lastUpdated } = await fetchLatestTrends(tokens);

  const withData = tokenTrends.filter((t) => Object.keys(t.timeframes).length > 0).length;
  const sample = tokenTrends.find((t) => t.token === "BTC");
  const debug = {
    totalTokens: tokens.length,
    tokensWithData: withData,
    lastUpdated,
    sampleBtc: sample
      ? {
          1m: sample.timeframes["1m"]?.trend ?? null,
          5m: sample.timeframes["5m"]?.trend ?? null,
          15m: sample.timeframes["15m"]?.trend ?? null,
        }
      : null,
    hasSupabaseEnv:
      !!process.env.SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    supabaseUrl: process.env.SUPABASE_URL || null,
  };

  return (
    <main className="page">
      <header className="page-header">
        <div className="page-header-row">
          <div>
            <h1>MEXC EMA Trend Dashboard</h1>
            <p className="subtitle">
              EMA20 · EMA50 · EMA100 · EMA200 across {TIMEFRAMES.map((t) => t).join(" / ")}
            </p>
          </div>
          <NextRefresh intervalMinutes={config.check_interval_minutes} className="next-refresh next-refresh-header" />
        </div>
      </header>

      <details className="debug-panel">
        <summary>Debug info</summary>
        <pre className="debug-pre">
{JSON.stringify(debug, null, 2)}
        </pre>
      </details>

      {tokens.length === 0 ? (
        <div className="empty-state">
          <p>No tokens configured. Edit <code>config.json</code> at the repo root.</p>
        </div>
      ) : (
        <TrendsTable tokens={tokenTrends} lastUpdated={lastUpdated} />
      )}

      <footer className="page-footer">
        <span>
          Data refreshes every {config.check_interval_minutes} min via GitHub Actions. This page revalidates every 60s.
        </span>
      </footer>
    </main>
  );
}
