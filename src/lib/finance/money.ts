// Money helpers. Amounts are ringgit numbers with 2 decimals. To avoid binary
// floating-point drift, sums/rounding are done in integer sen (cents).

export function toSen(v: number | string | null | undefined): number {
  if (v === null || v === undefined || v === "") return 0;
  return Math.round(Number(v) * 100);
}

export function fromSen(sen: number): number {
  return sen / 100;
}

/** Round a ringgit amount to 2 decimals exactly. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Sum ringgit amounts without float drift. */
export function sumMoney(nums: Array<number | string | null | undefined>): number {
  return fromSen(nums.reduce<number>((acc, n) => acc + toSen(n), 0));
}

/** a - b (ringgit) without float drift. */
export function subMoney(a: number | string, b: number | string): number {
  return fromSen(toSen(a) - toSen(b));
}

/** Format as Malaysian Ringgit, e.g. RM5,000 or RM25,430.50. */
export function formatMYR(v: number | string | null | undefined): string {
  const n = round2(Number(v ?? 0));
  const hasCents = Math.round(n * 100) % 100 !== 0;
  const s = n.toLocaleString("en-MY", {
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  });
  return `RM${s}`;
}

/** Compact format for tight cells, e.g. RM25.4k. */
export function formatMYRCompact(v: number | string | null | undefined): string {
  const n = Number(v ?? 0);
  if (Math.abs(n) >= 1000) {
    return `RM${(n / 1000).toLocaleString("en-MY", { maximumFractionDigits: 1 })}k`;
  }
  return formatMYR(n);
}
