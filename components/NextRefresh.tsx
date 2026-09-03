"use client";

import { useEffect, useState } from "react";

interface Props {
  /** The scheduled cadence in minutes. */
  intervalMinutes?: number;
  /** Optional className for layout styling. */
  className?: string;
}

function getSecondsUntilNextBoundary(intervalMinutes: number): number {
  const now = new Date();
  const ms = now.getTime();
  const minutesSinceHour = now.getMinutes();
  const secondsSinceMinute = now.getSeconds();
  const msSinceMinute = now.getMilliseconds();

  const nextBoundaryMinute =
    (Math.floor(minutesSinceHour / intervalMinutes) + 1) * intervalMinutes;

  const minutesUntilNext = nextBoundaryMinute - minutesSinceHour;
  const secondsUntilNext =
    minutesUntilNext * 60 - secondsSinceMinute - msSinceMinute / 1000;

  return Math.max(0, secondsUntilNext);
}

function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.ceil(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export default function NextRefresh({
  intervalMinutes = 5,
  className,
}: Props) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    setSecondsLeft(getSecondsUntilNextBoundary(intervalMinutes));
    const id = setInterval(() => {
      setSecondsLeft(getSecondsUntilNextBoundary(intervalMinutes));
    }, 1000);
    return () => clearInterval(id);
  }, [intervalMinutes]);

  if (secondsLeft === null) {
    return (
      <div className={className ?? "next-refresh"}>
        <span className="next-refresh-label">Next refresh in</span>
        <span className="next-refresh-value">--:--</span>
      </div>
    );
  }

  const isClose = secondsLeft <= 15;

  return (
    <div className={`${className ?? "next-refresh"} ${isClose ? "is-close" : ""}`}>
      <span className="next-refresh-label">Next refresh in</span>
      <span className="next-refresh-value">{formatCountdown(secondsLeft)}</span>
    </div>
  );
}
