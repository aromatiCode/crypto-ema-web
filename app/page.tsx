import TrendsTable from "@/components/TrendsTable";
import NextRefresh from "@/components/NextRefresh";
import { fetchLatestTrends } from "@/lib/data";
import { TIMEFRAMES } from "@/lib/trends";
import { config } from "@/lib/config";

export const revalidate = 60;

const tokens = config.tokens;

export default async function Page() {
  const { tokens: tokenTrends, lastUpdated } = await fetchLatestTrends(tokens);

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
          <NextRefresh intervalMinutes={5} className="next-refresh next-refresh-header" />
        </div>
      </header>

      {tokens.length === 0 ? (
        <div className="empty-state">
          <p>No tokens configured. Edit <code>config.json</code> at the repo root.</p>
        </div>
      ) : (
        <TrendsTable tokens={tokenTrends} lastUpdated={lastUpdated} />
      )}

      <footer className="page-footer">
        <span>
          Data refreshes every 5 minutes via GitHub Actions. This page revalidates every 60s.
        </span>
      </footer>
    </main>
  );
}
