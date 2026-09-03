"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { TimeframeState, TokenTrend, Trend } from "@/lib/trends";
import { TIMEFRAMES } from "@/lib/trends";
import TrendBadge from "./TrendBadge";
import DetailRow from "./DetailRow";

interface Props {
  tokens: TokenTrend[];
  lastUpdated: string | null;
  initialRefreshMs?: number;
}

function fmt(n: number | undefined): string {
  if (n === undefined || n === null || Number.isNaN(n)) return "—";
  if (Math.abs(n) >= 1) return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
  return n.toPrecision(4);
}

export default function TrendsTable({ tokens, lastUpdated, initialRefreshMs = 60_000 }: Props) {
  const router = useRouter();
  const [filter, setFilter] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [hasNew, setHasNew] = useState(false);
  const lastSeenRef = useRef<string | null>(lastUpdated);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const res = await fetch("/api/last-updated", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as { lastUpdated: string | null };
        if (cancelled) return;
        const next = json.lastUpdated;
        if (next && lastSeenRef.current && next !== lastSeenRef.current) {
          setHasNew(true);
        }
      } catch {
        // ignore network blips
      }
    };
    const id = setInterval(tick, initialRefreshMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [initialRefreshMs]);

  const handleManualRefresh = () => {
    lastSeenRef.current = lastUpdated;
    setHasNew(false);
    router.refresh();
  };

  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return tokens;
    return tokens.filter((t) => t.token.toLowerCase().includes(f));
  }, [tokens, filter]);

  const toggle = (token: string) => {
    setExpanded((cur) => (cur === token ? null : token));
  };

  return (
    <div className="trends-wrap">
      <div className="trends-toolbar">
        <input
          type="text"
          placeholder="Filter tokens..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="filter-input"
          aria-label="Filter tokens"
        />
        <div className="refresh-area">
          {hasNew && (
            <button className="refresh-hint" onClick={handleManualRefresh}>
              New data available · Refresh
            </button>
          )}
          <button className="refresh-btn" onClick={handleManualRefresh} aria-label="Refresh">
            Refresh
          </button>
        </div>
      </div>

      <div className="table-scroll">
        <table className="trends-table">
          <thead>
            <tr>
              <th>Token</th>
              {TIMEFRAMES.map((tf) => (
                <th key={tf}>{tf.toUpperCase()}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((t) => {
              const isOpen = expanded === t.token;
              return (
                <Fragment key={t.token}>
                  <tr
                    className={`token-row ${isOpen ? "open" : ""}`}
                    onClick={() => toggle(t.token)}
                  >
                    <td className="token-cell">
                      <span className="caret" aria-hidden>
                        {isOpen ? "▾" : "▸"}
                      </span>
                      <span className="token-name">{t.token}</span>
                      <span className="token-suffix">/USDT</span>
                    </td>
                    {TIMEFRAMES.map((tf) => {
                      const st: TimeframeState | undefined = t.timeframes[tf];
                      if (!st) {
                        return (
                          <td key={tf} className="cell">
                            <TrendBadge trend="UNKNOWN" size="sm" />
                          </td>
                        );
                      }
                      return (
                        <td key={tf} className="cell">
                          <TrendBadge trend={st.trend as Trend} size="sm" />
                          <div className="ema-mini">
                            <div>
                              <span className="ema-k">20</span>
                              <span className="ema-v">{fmt(st.ema.ema20)}</span>
                            </div>
                            <div>
                              <span className="ema-k">50</span>
                              <span className="ema-v">{fmt(st.ema.ema50)}</span>
                            </div>
                            <div>
                              <span className="ema-k">100</span>
                              <span className="ema-v">{fmt(st.ema.ema100)}</span>
                            </div>
                            <div>
                              <span className="ema-k">200</span>
                              <span className="ema-v">{fmt(st.ema.ema200)}</span>
                            </div>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                  {isOpen && (
                    <tr className="detail-tr">
                      <td colSpan={1 + TIMEFRAMES.length}>
                        <div className="detail-grid">
                          {TIMEFRAMES.map((tf) => (
                            <div key={tf} className="detail-card">
                              <div className="detail-card-title">{tf.toUpperCase()}</div>
                              <DetailRow state={t.timeframes[tf]} />
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={1 + TIMEFRAMES.length} className="empty">
                  No tokens match “{filter}”.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
