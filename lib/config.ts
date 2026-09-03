/**
 * Static app config. The token list and timeframes are mirrored in
 * `cloud/config.json` for the Python pipeline; keep them in sync.
 */

export type TimeframeId = "1m" | "5m" | "15m";

export interface TimeframeMeta {
  mexc_interval: string;
  minutes: number;
}

export interface AppConfig {
  tokens: string[];
  timeframes: Record<TimeframeId, TimeframeMeta>;
  ema_periods: number[];
  check_interval_minutes: number;
}

const RAW_TOKENS: string[] = [
  "BTC",
  "ZORA",
  "ZEN",
  "ZEC",
  "CYS",
  "SKR",
  "JUP",
  "ETHFI",
  "AKE",
  "BULLA",
  "BTW",
  "MAGMA",
  "BTR",
  "HEMI",
  "RED",
  "UAI",
  "ARB",
  "SUI",
  "LIT",
  "ASTER",
  "AAVE",
  "CRV",
  "ENA",
  "SEI",
];

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

export const config: AppConfig = {
  tokens: dedupeTokens(RAW_TOKENS),
  timeframes: {
    "1m":  { mexc_interval: "Min1",  minutes: 1  },
    "5m":  { mexc_interval: "Min5",  minutes: 5  },
    "15m": { mexc_interval: "Min15", minutes: 15 },
  },
  ema_periods: [20, 50, 100, 200],
  check_interval_minutes: 1,
};
