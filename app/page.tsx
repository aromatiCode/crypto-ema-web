import TrendsTable from "@/components/TrendsTable";
import { fetchLatestTrends } from "@/lib/data";
import { TIMEFRAMES } from "@/lib/trends";
import config from "./config.json";

export const revalidate = 60;

function dedupeTokens(input: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of input) {
    const u = String(t).toUpperCase();
    if (!seen.has(u)) {
      seen.add(u);
      out.push(u);
    }
  }
  return out;
}

interface ConfigShape {
  tokens: string[];
}

const cfg = config as ConfigShape;
const tokens = dedupeTokens(cfg.tokens);

export default async function Page() {
  const { tokens: tokenTrends, lastUpdated } = await fetchLatestTrends(tokens);

  return (
    <main className="page">
      <header className="page-header">
        <h1>MEXC EMA Trend Dashboard</h1>
        <p className="subtitle">
          EMA20 · EMA50 · EMA100 · EMA200 across {TIMEFRAMES.map((t) => t).join(" / ")}
        </p>
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
