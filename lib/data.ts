import { getServerSupabase } from "./supabase";
import type { TimeframeId, TokenTrend, TrendsResponse, Trend } from "./trends";
import { TIMEFRAMES } from "./trends";

interface Row {
  token: string;
  timeframe: TimeframeId;
  previous_trend: Trend;
  new_trend: Trend;
  ema20: number;
  ema50: number;
  ema100: number;
  ema200: number;
  close: number;
  candle_time: string;
  created_at: string;
}

/**
 * Fetch the latest trend per (token, timeframe) from Supabase.
 * Returns an empty array if Supabase is not configured.
 */
export async function fetchLatestTrends(tokens: string[]): Promise<TrendsResponse> {
  const client = getServerSupabase();
  if (!client) {
    return { tokens: tokens.map((t) => ({ token: t, timeframes: {} })), lastUpdated: null };
  }

  // Most recent row per (token, timeframe) using PostgREST's order+limit-per-group pattern.
  // Fetch all rows ordered desc then bucket in code; this is fine for the small dataset.
  const { data, error } = await client
    .from("trend_transitions")
    .select(
      "token,timeframe,previous_trend,new_trend,ema20,ema50,ema100,ema200,close,candle_time,created_at"
    )
    .order("created_at", { ascending: false })
    .limit(5000);

  if (error) {
    console.error("Supabase fetch error:", error);
    return { tokens: tokens.map((t) => ({ token: t, timeframes: {} })), lastUpdated: null };
  }

  const rows = (data as Row[]) ?? [];

  const byTokenTimeframe = new Map<string, Row>();
  for (const r of rows) {
    const key = `${r.token}::${r.timeframe}`;
    if (!byTokenTimeframe.has(key)) {
      byTokenTimeframe.set(key, r);
    }
  }

  let lastUpdated: string | null = null;
  const out: TokenTrend[] = tokens.map((token) => {
    const t: TokenTrend = { token, timeframes: {} };
    for (const tf of TIMEFRAMES) {
      const row = byTokenTimeframe.get(`${token}::${tf}`);
      if (row) {
        t.timeframes[tf] = {
          trend: row.new_trend,
          ema: {
            ema20: row.ema20,
            ema50: row.ema50,
            ema100: row.ema100,
            ema200: row.ema200,
          },
          close: row.close,
          candleTime: row.candle_time,
          transitionedAt: row.created_at,
        };
        if (!lastUpdated || row.created_at > lastUpdated) {
          lastUpdated = row.created_at;
        }
      }
    }
    return t;
  });

  return { tokens: out, lastUpdated };
}
