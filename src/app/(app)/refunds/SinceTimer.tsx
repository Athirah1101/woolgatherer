"use client";

import { useEffect, useState } from "react";

/**
 * Live count-up showing how long it has been since HRD Corp funds landed.
 * The 30-day refund clock is running from this moment — the timer makes the
 * pressure visible "on the side" without anyone refreshing the page.
 */
export function SinceTimer({
  since,
  compact = false,
}: {
  since: string; // ISO date (YYYY-MM-DD) when HRDC funds were received
  compact?: boolean;
}) {
  const start = new Date(`${since}T00:00:00`).getTime();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const elapsed = Math.max(0, now - start);
  const totalSec = Math.floor(elapsed / 1000);
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  const pad = (n: number) => String(n).padStart(2, "0");

  if (compact) {
    return (
      <span className="whitespace-nowrap tabular-nums">
        {days}d {pad(hours)}:{pad(minutes)}:{pad(seconds)}
      </span>
    );
  }

  return (
    <span className="tabular-nums font-semibold">
      {days}
      <span className="text-xs font-normal text-muted">d </span>
      {pad(hours)}
      <span className="text-xs font-normal text-muted">h </span>
      {pad(minutes)}
      <span className="text-xs font-normal text-muted">m </span>
      {pad(seconds)}
      <span className="text-xs font-normal text-muted">s</span>
    </span>
  );
}
