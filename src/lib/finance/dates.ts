// Date-only business-deadline helpers.
// All dates are ISO strings "YYYY-MM-DD". Arithmetic uses UTC midnight so there
// is never a timezone/DST shift. "Today" is computed in the business timezone.

export const BUSINESS_TZ = "Asia/Kuala_Lumpur";

/** Today's date in the business timezone, as "YYYY-MM-DD". */
export function todayISO(tz: string = BUSINESS_TZ): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function toUTC(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUTC(ms: number): string {
  const dt = new Date(ms);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const DAY = 86_400_000;

/** Add (or subtract) whole calendar days. */
export function addDays(iso: string, days: number): string {
  return fromUTC(toUTC(iso) + days * DAY);
}

/** b - a in whole calendar days (positive if b is after a). */
export function diffDays(a: string, b: string): number {
  return Math.round((toUTC(b) - toUTC(a)) / DAY);
}

/** How many days from `today` until `date` (negative = overdue). */
export function daysUntil(date: string, today: string): number {
  return diffDays(today, date);
}

/** How many days `date` is overdue relative to `today` (0 if not past). */
export function daysOverdue(date: string, today: string): number {
  const d = diffDays(date, today);
  return d > 0 ? d : 0;
}

export function isPast(date: string, today: string): boolean {
  return diffDays(date, today) > 0;
}
export function isToday(date: string, today: string): boolean {
  return date === today;
}
export function compareISO(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
export function minISO(a: string, b: string): string {
  return a <= b ? a : b;
}
export function maxISO(a: string, b: string): string {
  return a >= b ? a : b;
}

/** Add whole months, clamping the day to the target month's length. */
export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const total = (y * 12 + (m - 1)) + months;
  const ny = Math.floor(total / 12);
  const nm = total % 12; // 0-based
  const lastDay = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  const nd = Math.min(d, lastDay);
  return `${ny}-${String(nm + 1).padStart(2, "0")}-${String(nd).padStart(2, "0")}`;
}

/** A given day-of-month within the month of `iso`, clamped to month length. */
export function dayOfMonth(iso: string, day: number): string {
  const [y, m] = iso.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const nd = Math.min(day, lastDay);
  return `${y}-${String(m).padStart(2, "0")}-${String(nd).padStart(2, "0")}`;
}

export function startOfMonth(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return `${y}-${String(m).padStart(2, "0")}-01`;
}
export function endOfMonth(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
}
/** "YYYY-MM" period key for a date. */
export function periodKey(iso: string): string {
  return iso.slice(0, 7);
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Human date: "21 Aug 2026". */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return "—";
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** Short date without year: "21 Aug". */
export function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

/** Time only in the business timezone: "11:30 AM". */
export function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("en-MY", { timeZone: BUSINESS_TZ, timeStyle: "short" }).format(new Date(iso));
  } catch {
    return "—";
  }
}

/** Full timestamp in the business timezone: "25 Aug 2026, 11:30 AM". */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("en-MY", {
      timeZone: BUSINESS_TZ,
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return "—";
  }
}

/** Relative wording: "in 3 days", "today", "tomorrow", "5 days ago". */
export function relativeDays(date: string, today: string): string {
  const n = diffDays(today, date);
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n === -1) return "yesterday";
  if (n > 1) return `in ${n} days`;
  return `${-n} days ago`;
}
