// Payex → FinanceOS balance sync.
//
// Payex (by Xendit) has NO "read my balance" endpoint, so we RECONSTRUCT the
// balance held at Payex from two lists it does expose:
//
//   balance held at Payex  =  (successful money collected)  −  (money settled out)
//
//   • Collections in  → GET /api/v1/Transactions      (only successful, MYR,
//                        net of any refunds)
//   • Settled out     → GET /api/v1/Transactions/Settlements  (gross_amount)
//
// The fee (mdr) that Payex keeps is deducted at settlement time, so pending
// funds sit at GROSS — which is why we subtract each settlement's gross_amount
// (not its net): that is exactly the amount of collections leaving the pool.
//
// Because we sum the full history every run, the number is self-correcting —
// there is no stored anchor to drift. It is still a RECONSTRUCTION (Payex gives
// no live balance), so it is labelled "estimated" in the UI and should be
// sanity-checked against the Payex portal after the first run.
//
// Amounts from Payex are in MAJOR units (ringgit, e.g. 1997 = RM1,997.00), so
// no sen conversion is needed.

import { writeBankBalance } from "./bank-sync";
import { todayISO } from "@/lib/finance/dates";
import { round2 } from "@/lib/finance/money";

const PAYEX_ACCOUNT_NAME = "Payex";
const MYR = "MYR";
// Page size + a safety cap so a runaway never loops forever.
const PAGE_SIZE = 100;
const MAX_PAGES = 200;

/** Transaction statuses that count as money actually collected (case-insensitive). */
const COLLECTED_STATUSES = new Set([
  "success",
  "successful",
  "paid",
  "settled",
  "completed",
  "capture",
  "captured",
  "sale",
  "approved",
  "done",
]);

function base(): string {
  return (process.env.PAYEX_BASE || "https://api.payex.io").replace(/\/$/, "");
}

/** Earliest date to scan from (yyyyMMdd). Default well before Payex was used. */
function startDate(): string {
  return (process.env.PAYEX_START_DATE || "20240101").replace(/-/g, "");
}

export function payexConfigured(): boolean {
  return Boolean(process.env.PAYEX_EMAIL && process.env.PAYEX_SECRET);
}

const toNum = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const lc = (v: unknown): string => (typeof v === "string" ? v.toLowerCase().trim() : "");

/** Log in with the merchant email + Secret (HTTP Basic) to get a bearer token. */
async function getToken(): Promise<string> {
  const email = process.env.PAYEX_EMAIL;
  const secret = process.env.PAYEX_SECRET;
  if (!email || !secret) throw new Error("Payex credentials are not set.");

  const basic = Buffer.from(`${email}:${secret}`).toString("base64");
  // NOTE: the login lives at /api/Auth/Token (no "v1"), unlike the data
  // endpoints which are under /api/v1/. Payex uses different path prefixes.
  const res = await fetch(`${base()}/api/Auth/Token`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, Accept: "application/json" },
    cache: "no-store",
  });
  const body = (await res.json().catch(() => null)) as
    | { result?: { access_token?: string; token?: string } | string; access_token?: string; token?: string; message?: string }
    | null;
  if (!res.ok) {
    throw new Error(`Payex login failed: ${body?.message ?? res.statusText}`);
  }
  const r = body?.result;
  const token =
    (typeof r === "object" && r ? r.access_token ?? r.token : typeof r === "string" ? r : undefined) ??
    body?.access_token ??
    body?.token;
  if (!token) throw new Error("Payex login returned no access token.");
  return token;
}

interface PayexList<T> {
  status?: string;
  result?: T[];
  total_pages?: number;
  message?: string;
}

/** Fetch every page of a Payex list endpoint over [start, end], newest first. */
async function fetchAll<T>(path: string, token: string, start: string, end: string): Promise<T[]> {
  const out: T[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `${base()}${path}?start_date=${start}&end_date=${end}&limit=${PAGE_SIZE}&page=${page}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
    });
    const body = (await res.json().catch(() => null)) as PayexList<T> | null;
    if (!res.ok) throw new Error(`Payex ${path} error: ${body?.message ?? res.statusText}`);
    const rows = Array.isArray(body?.result) ? body!.result! : [];
    out.push(...rows);
    const totalPages = toNum(body?.total_pages);
    if (rows.length < PAGE_SIZE) break; // last (partial) page
    if (totalPages && page >= totalPages) break;
  }
  return out;
}

interface PayexTxn {
  status?: string;
  currency?: string;
  base_amount?: number | string;
  amount?: number | string;
  amount_refunded?: number | string;
}
interface PayexSettlement {
  currency?: string;
  base_currency?: string;
  gross_amount?: number | string;
  base_amount?: number | string;
}

export interface PayexSyncResult {
  balance: number;
  collected: number;
  settled: number;
  asOf: string;
  detail?: string;
}

/**
 * Reconstruct the Payex balance (collected − settled) and write it to the
 * "Payex" bank account. Throws with a human-readable message on any failure.
 */
export async function syncPayexBalance(): Promise<PayexSyncResult> {
  const token = await getToken();
  const start = startDate();
  const end = todayISO().replace(/-/g, "");

  const [txns, settlements] = await Promise.all([
    fetchAll<PayexTxn>("/api/v1/Transactions", token, start, end),
    fetchAll<PayexSettlement>("/api/v1/Transactions/Settlements", token, start, end),
  ]);

  // Collections: successful MYR transactions, net of refunds.
  const statusCount = new Map<string, number>();
  let collected = 0;
  let collectedCount = 0;
  for (const t of txns) {
    const st = lc(t.status);
    statusCount.set(st || "(blank)", (statusCount.get(st || "(blank)") ?? 0) + 1);
    if ((t.currency ?? MYR).toUpperCase() !== MYR) continue;
    if (!COLLECTED_STATUSES.has(st)) continue;
    const gross = toNum(t.amount ?? t.base_amount);
    collected += gross - toNum(t.amount_refunded);
    collectedCount++;
  }

  // Settled out: MYR settlements, gross amount (matches the gross collected).
  let settled = 0;
  for (const s of settlements) {
    const cur = (s.currency ?? s.base_currency ?? MYR).toUpperCase();
    if (cur !== MYR) continue;
    settled += toNum(s.gross_amount ?? s.base_amount);
  }

  const balance = round2(collected - settled);
  const asOf = await writeBankBalance(PAYEX_ACCOUNT_NAME, balance);

  // Surface a status breakdown so the collected-status filter can be verified
  // against the portal and tuned if Payex uses an unexpected status label.
  const breakdown = [...statusCount.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([s, n]) => `${s}:${n}`)
    .join(" ");
  const detail = `${collectedCount} collected − ${settlements.length} settlements · statuses ${breakdown}`;

  return { balance, collected: round2(collected), settled: round2(settled), asOf, detail };
}
