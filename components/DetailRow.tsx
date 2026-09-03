import type { TimeframeState } from "@/lib/trends";
import TrendBadge from "./TrendBadge";

interface Props {
  state?: TimeframeState;
}

function fmt(n: number | undefined): string {
  if (n === undefined || n === null || Number.isNaN(n)) return "—";
  if (Math.abs(n) >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
  return n.toPrecision(4);
}

export default function DetailRow({ state }: Props) {
  if (!state) {
    return <div className="detail-row">No data yet for this timeframe.</div>;
  }
  return (
    <div className="detail-row">
      <div className="detail-col">
        <div className="detail-label">Trend</div>
        <TrendBadge trend={state.trend} size="sm" />
      </div>
      <div className="detail-col">
        <div className="detail-label">Close</div>
        <div className="detail-value">{fmt(state.close)}</div>
      </div>
      <div className="detail-col">
        <div className="detail-label">EMA20</div>
        <div className="detail-value">{fmt(state.ema.ema20)}</div>
      </div>
      <div className="detail-col">
        <div className="detail-label">EMA50</div>
        <div className="detail-value">{fmt(state.ema.ema50)}</div>
      </div>
      <div className="detail-col">
        <div className="detail-label">EMA100</div>
        <div className="detail-value">{fmt(state.ema.ema100)}</div>
      </div>
      <div className="detail-col">
        <div className="detail-label">EMA200</div>
        <div className="detail-value">{fmt(state.ema.ema200)}</div>
      </div>
      <div className="detail-col">
        <div className="detail-label">Candle</div>
        <div className="detail-value detail-time">{new Date(state.candleTime).toLocaleString()}</div>
      </div>
    </div>
  );
}
