"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AttentionBadge, Card, Chip, EmptyState, StatusChip,
  SummaryCard, Table, TBody, TD, TH, THead, TR, cn, type Tone,
} from "@/components/ui";
import { formatMYR, sumMoney } from "@/lib/finance/money";
import { formatDate, daysUntil } from "@/lib/finance/dates";
import { collectionStatusChip } from "@/lib/finance/display";
import type { CollectionStatus } from "@/lib/finance/receivables";

export interface RecvRowView {
  id: string;
  client: string;
  product: string | null;
  salesPic: string | null;
  dealAmount: number;
  paid: number;
  outstanding: number;
  overdue: number;
  daysOverdue: number;
  nextDate: string | null;
  nextAmount: number;
  collectionStatus: CollectionStatus;
  dealStatus: string; // active | on_hold | stopped | completed | cancelled
  hrdc: boolean;
  remarks: string | null;
}

const QUICK = [
  { key: "", label: "All" },
  { key: "outstanding", label: "Outstanding" },
  { key: "overdue", label: "Overdue" },
  { key: "due_week", label: "Due This Week" },
  { key: "due_month", label: "Due This Month" },
  { key: "paid", label: "Paid" },
  { key: "on_hold", label: "On Hold" },
  { key: "stopped", label: "Stopped" },
];

const SORTS = [
  { key: "outstanding", label: "Outstanding (high→low)" },
  { key: "overdue", label: "Overdue (high→low)" },
  { key: "days", label: "Days Overdue (high→low)" },
  { key: "deal", label: "Deal Amount (high→low)" },
  { key: "client", label: "Client (A→Z)" },
  { key: "next", label: "Next Payment Date" },
];

const DEAL_STATUS_CHIP: Record<string, { label: string; tone: Tone }> = {
  on_hold: { label: "On Hold", tone: "amber" },
  stopped: { label: "Stopped", tone: "red" },
  cancelled: { label: "Cancelled", tone: "gray" },
};

export function ReceivablesTable({
  rows,
  today,
  isSalesView,
  salesPics,
  showSalesPic,
}: {
  rows: RecvRowView[];
  today: string;
  isSalesView: boolean;
  salesPics: string[];
  showSalesPic: boolean;
}) {
  const [quick, setQuick] = useState("");
  const [q, setQ] = useState("");
  const [pic, setPic] = useState("");
  const [hrdc, setHrdc] = useState("");
  const [sort, setSort] = useState("outstanding");

  const filtered = useMemo(() => {
    let r = rows;
    const query = q.trim().toLowerCase();
    if (query)
      r = r.filter(
        (x) => x.client.toLowerCase().includes(query) || (x.product ?? "").toLowerCase().includes(query),
      );
    if (pic) r = r.filter((x) => x.salesPic === pic);
    if (hrdc === "yes") r = r.filter((x) => x.hrdc);
    if (hrdc === "no") r = r.filter((x) => !x.hrdc);
    switch (quick) {
      case "outstanding": r = r.filter((x) => x.outstanding > 0); break;
      case "overdue": r = r.filter((x) => x.overdue > 0); break;
      case "paid": r = r.filter((x) => x.collectionStatus === "paid"); break;
      case "on_hold": r = r.filter((x) => x.dealStatus === "on_hold"); break;
      case "stopped": r = r.filter((x) => x.dealStatus === "stopped"); break;
      case "due_week":
        r = r.filter((x) => x.nextDate && x.outstanding > 0 && daysUntil(x.nextDate, today) >= 0 && daysUntil(x.nextDate, today) <= 7);
        break;
      case "due_month":
        r = r.filter((x) => x.nextDate && x.outstanding > 0 && x.nextDate.slice(0, 7) === today.slice(0, 7));
        break;
    }
    const sorted = [...r];
    sorted.sort((a, b) => {
      switch (sort) {
        case "overdue": return b.overdue - a.overdue;
        case "days": return b.daysOverdue - a.daysOverdue;
        case "deal": return b.dealAmount - a.dealAmount;
        case "client": return a.client.localeCompare(b.client);
        case "next": return (a.nextDate ?? "9999").localeCompare(b.nextDate ?? "9999");
        default: return b.outstanding - a.outstanding;
      }
    });
    return sorted;
  }, [rows, q, pic, hrdc, quick, sort, today]);

  const totalOutstanding = sumMoney(filtered.map((r) => r.outstanding));
  const totalOverdue = sumMoney(filtered.map((r) => r.overdue));
  const totalCollected = sumMoney(filtered.map((r) => r.paid));

  return (
    <div>
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryCard label="Outstanding" value={formatMYR(totalOutstanding)} tone="amber" />
        <SummaryCard label="Overdue" value={formatMYR(totalOverdue)} tone="red" />
        <SummaryCard label="Collected" value={formatMYR(totalCollected)} tone="green" />
      </div>

      <div className="mb-4 space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {QUICK.map((quickOpt) => (
            <button
              key={quickOpt.key}
              onClick={() => setQuick(quickOpt.key)}
              className={cn(
                "rounded-full px-3 py-1.5 text-sm font-medium transition",
                quick === quickOpt.key ? "bg-brand text-white" : "border border-border bg-surface hover:bg-gray-50",
              )}
            >
              {quickOpt.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search client or product…"
            className="w-56 rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand"
          />
          {showSalesPic && (
            <select value={pic} onChange={(e) => setPic(e.target.value)} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm">
              <option value="">All Sales PICs</option>
              {salesPics.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          )}
          <select value={hrdc} onChange={(e) => setHrdc(e.target.value)} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm">
            <option value="">HRDC &amp; Non-HRDC</option>
            <option value="yes">HRDC only</option>
            <option value="no">Non-HRDC only</option>
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value)} className="ml-auto rounded-lg border border-border bg-surface px-3 py-2 text-sm">
            {SORTS.map((s) => <option key={s.key} value={s.key}>Sort: {s.label}</option>)}
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState title="No receivables match this view." message="Try clearing the filters." />
      ) : (
        <Card padded={false}>
          <Table>
            <THead>
              <TR>
                <TH>Client</TH>
                <TH>Product</TH>
                {!isSalesView && <TH>Sales PIC</TH>}
                <TH right>Deal Amount</TH>
                <TH right>Paid</TH>
                <TH right>Outstanding</TH>
                <TH right>Overdue</TH>
                <TH>Next Payment</TH>
                <TH>Status</TH>
                <TH>Attention</TH>
                <TH>Remarks</TH>
              </TR>
            </THead>
            <TBody>
              {filtered.map((r) => {
                const status = collectionStatusChip(r.collectionStatus);
                const override = DEAL_STATUS_CHIP[r.dealStatus];
                const attn =
                  r.overdue > 0
                    ? { label: `${r.daysOverdue} day${r.daysOverdue === 1 ? "" : "s"} overdue`, tone: "red" as Tone }
                    : r.nextDate && r.nextAmount > 0 && daysUntil(r.nextDate, today) <= 7
                    ? { label: `Due ${relative(r.nextDate, today)}`, tone: (daysUntil(r.nextDate, today) <= 2 ? "amber" : "blue") as Tone }
                    : { label: "—", tone: "gray" as Tone };
                return (
                  <TR key={r.id}>
                    <TD className="font-medium">
                      <Link href={`/receivables/${r.id}`} className="hover:text-brand hover:underline">{r.client}</Link>
                      {r.hrdc && <Chip tone="indigo" className="ml-2">HRDC</Chip>}
                    </TD>
                    <TD className="text-muted">{r.product ?? "—"}</TD>
                    {!isSalesView && <TD>{r.salesPic ?? "—"}</TD>}
                    <TD right>{formatMYR(r.dealAmount)}</TD>
                    <TD right className="text-emerald-700">{formatMYR(r.paid)}</TD>
                    <TD right className="font-medium">{formatMYR(r.outstanding)}</TD>
                    <TD right className={r.overdue > 0 ? "font-medium text-red-600" : "text-muted"}>
                      {r.overdue > 0 ? formatMYR(r.overdue) : "—"}
                    </TD>
                    <TD>
                      {r.nextDate ? (
                        <div className="whitespace-nowrap">
                          <div>{formatDate(r.nextDate)}</div>
                          <div className="text-xs text-muted">{formatMYR(r.nextAmount)}</div>
                        </div>
                      ) : <span className="text-muted">—</span>}
                    </TD>
                    <TD>
                      {override ? <StatusChip label={override.label} tone={override.tone} /> : <StatusChip label={status.label} tone={status.tone} />}
                    </TD>
                    <TD><AttentionBadge label={attn.label} tone={attn.tone} /></TD>
                    <TD className="text-muted">
                      <span className="block max-w-[16rem] truncate" title={r.remarks ?? ""}>{r.remarks ?? "—"}</span>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

function relative(date: string, today: string): string {
  const n = daysUntil(date, today);
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n < 0) return `${-n}d ago`;
  return `in ${n} days`;
}
