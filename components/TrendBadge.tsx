import type { Trend } from "@/lib/trends";

interface Props {
  trend: Trend | "UNKNOWN";
  size?: "sm" | "md";
}

const LABELS: Record<Trend | "UNKNOWN", { label: string; icon: string; cls: string }> = {
  BULLISH: { label: "BULLISH", icon: "▲", cls: "badge-bullish" },
  BEARISH: { label: "BEARISH", icon: "▼", cls: "badge-bearish" },
  NEUTRAL: { label: "NEUTRAL", icon: "—", cls: "badge-neutral" },
  UNKNOWN: { label: "NO DATA", icon: "?", cls: "badge-unknown" },
};

export default function TrendBadge({ trend, size = "md" }: Props) {
  const { label, icon, cls } = LABELS[trend];
  return (
    <span className={`badge ${cls} ${size === "sm" ? "badge-sm" : ""}`}>
      <span className="badge-icon" aria-hidden>
        {icon}
      </span>
      <span className="badge-label">{label}</span>
    </span>
  );
}
