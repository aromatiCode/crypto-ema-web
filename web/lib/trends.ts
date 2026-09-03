export type TimeframeId = "1m" | "5m" | "15m";
export type Trend = "BULLISH" | "BEARISH" | "NEUTRAL";

export const TIMEFRAMES: TimeframeId[] = ["1m", "5m", "15m"];

export interface TimeframeState {
  trend: Trend;
  ema: { ema20: number; ema50: number; ema100: number; ema200: number };
  close: number;
  candleTime: string;
  transitionedAt: string;
}

export interface TokenTrend {
  token: string;
  timeframes: Partial<Record<TimeframeId, TimeframeState>>;
}

export interface TrendsResponse {
  tokens: TokenTrend[];
  lastUpdated: string | null;
}
