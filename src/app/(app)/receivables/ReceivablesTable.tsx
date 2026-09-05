"use client";

import { Fragment, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  AttentionBadge, Card, Chip, EmptyState, StatusChip,
  SummaryCard, Table, TBody, TD, TH, THead, TR, cn, type Tone,
} from "@/components/ui";
import { formatMYR, sumMoney } from "@/lib/finance/money";
import { formatDate, daysUntil } from "@/lib/finance/dates";
import type { CollectionStatus } from "@/lib/finance/receivables";
import { updateReceivableStatus } from "./actions";
import { RECV_STATUS_OPTIONS, recvStatusLabel, recvStatusTone } from "./statusOptions";

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

const UPCOMING_HIDDEN_KEY = "financeos.recv.upcomingHidden";

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
  { key: "next", label: "Next Payment (soonest)" },
  { key: "next_desc", label: "Next Payment (latest)" },
];

// Left-border colour for the inline status <select>, keyed by tone.
const STATUS_BORDER: Record<string, string> = {
  green: "#10b981", orange: "#f97316", amber: "#f59e0b", red: "#ef4444",
  blue: "#0ea5e9", indigo: "#6366f1", gray: "#9ca3af", neutral: "#9ca3af",
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
  const [groupBy, setGroupBy] = useState(""); // "" | pic | status | deal | hrdc
  const [q, setQ] = useState("");
  const [pic, setPic] = useState("");
  const [hrdc, setHrdc] = useState("");
  const [sort, setSort] = useState("outstanding");
  const [, startTransition] = useTransition();
  const [statusOverride, setStatusOverride] = useState<Record<string, string>>({});

  function changeStatus(id: string, value: string) {
    setStatusOverride((m) => ({ ...m, [id]: value }));
    startTransition(() => updateReceivableStatus(id, value));
  }

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
        case "next_desc": return (b.nextDate ?? "0000").localeCompare(a.nextDate ?? "0000");
        default: return b.outstanding - a.outstanding;
      }
    });
    return sorted;
  }, [rows, q, pic, hrdc, quick, sort, today]);

  const totalOutstanding = sumMoney(filtered.map((r) => r.outstanding));
  const totalOverdue = sumMoney(filtered.map((r) => r.overdue));
  const totalCollected = sumMoney(filtered.map((r) => r.paid));

  // Receivables with a payment due within the next 7 days (or already overdue),
  // computed from the live data + today — so it's always current.
  const upcoming = useMemo(
    () =>
      rows
        .filter(
          (r) =>
            r.nextDate &&
            r.outstanding > 0 &&
            daysUntil(r.nextDate, today) >= 0 && // exclude overdue — those live in their own list
            daysUntil(r.nextDate, today) <= 7,
        )
        .sort((a, b) => (a.nextDate ?? "").localeCompare(b.nextDate ?? "")),
    [rows, today],
  );
  // Per-browser hide list for the upcoming board.
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [showHidden, setShowHidden] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(UPCOMING_HIDDEN_KEY);
      if (raw) setHidden(new Set(JSON.parse(raw) as string[]));
    } catch {
      /* ignore */
    }
  }, []);
  function persistHidden(next: Set<string>) {
    setHidden(next);
    try {
      localStorage.setItem(UPCOMING_HIDDEN_KEY, JSON.stringify([...next]));
    } catch {
      /* ignore */
    }
  }
  const hide = (id: string) => persistHidden(new Set(hidden).add(id));
  const unhide = (id: string) => {
    const n = new Set(hidden);
    n.delete(id);
    persistHidden(n);
  };

  const visibleUpcoming = upcoming.filter((r) => !hidden.has(r.id));
  const hiddenUpcoming = upcoming.filter((r) => hidden.has(r.id));
  const upcomingTotal = sumMoney(visibleUpcoming.map((r) => (r.nextAmount > 0 ? r.nextAmount : r.outstanding)));

  const upcomingRow = (r: RecvRowView, isHidden: boolean) => {
    const d = daysUntil(r.nextDate!, today);
    return (
      <li key={r.id} className="flex items-center justify-between gap-3 py-2 text-sm">
        <Link href={`/receivables/${r.id}`} className="min-w-0 truncate font-medium hover:text-brand hover:underline">
          {r.client}
          {r.product && <span className="font-normal text-muted"> · {r.product}</span>}
        </Link>
        <div className="flex shrink-0 items-center gap-3">
          <span className="tabular-nums">{formatMYR(r.nextAmount > 0 ? r.nextAmount : r.outstanding)}</span>
          <AttentionBadge
            label={`${formatDate(r.nextDate)} · ${relative(r.nextDate!, today)}`}
            tone={d < 0 ? "red" : d <= 2 ? "amber" : "blue"}
          />
          <button
            onClick={() => (isHidden ? unhide(r.id) : hide(r.id))}
            className="rounded px-1.5 py-0.5 text-xs text-muted hover:bg-gray-100"
            title={isHidden ? "Unhide" : "Hide from this board"}
          >
            {isHidden ? "Unhide" : "Hide"}
          </button>
        </div>
      </li>
    );
  };

  // ---- Optional group-by (spreadsheet-style sections with subtotals) ----
  const dealLabel = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const colSpan = isSalesView ? 10 : 11;
  const groups = useMemo(() => {
    if (!groupBy) return null;
    const keyOf = (r: RecvRowView) =>
      groupBy === "pic" ? r.salesPic || "Unassigned"
      : groupBy === "status" ? recvStatusLabel(r.collectionStatus)
      : groupBy === "deal" ? dealLabel(r.dealStatus)
      : r.hrdc ? "HRDC" : "Non-HRDC";
    const m = new Map<string, RecvRowView[]>();
    for (const r of filtered) {
      const k = keyOf(r);
      const arr = m.get(k);
      if (arr) arr.push(r);
      else m.set(k, [r]);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered, groupBy]);

  const renderRow = (r: RecvRowView) => {
    const curStatus = statusOverride[r.id] ?? r.dealStatus;
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
          {isSalesView ? (
            <StatusChip label={recvStatusLabel(curStatus)} tone={recvStatusTone[curStatus] ?? "gray"} />
          ) : (
            <select
              value={curStatus}
              onChange={(e) => changeStatus(r.id, e.target.value)}
              className={cn(
                "rounded-md border px-2 py-1 text-xs font-medium outline-none focus:border-brand",
                "border-l-4 bg-surface",
              )}
              style={{ borderLeftColor: STATUS_BORDER[recvStatusTone[curStatus] ?? "gray"] }}
              title="Change status"
            >
              {RECV_STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          )}
        </TD>
        <TD><AttentionBadge label={attn.label} tone={attn.tone} /></TD>
        <TD className="text-muted">
          <span className="block max-w-[16rem] truncate" title={r.remarks ?? ""}>{r.remarks ?? "—"}</span>
        </TD>
      </TR>
    );
  };

  return (
    <div>
      <Card className="mb-6 border-l-4 border-l-amber-400">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold">Upcoming Receivables — next 7 days</h3>
          <span className="text-sm text-muted">
            {visibleUpcoming.length} due · <span className="font-semibold text-text">{formatMYR(upcomingTotal)}</span>
          </span>
        </div>
        {visibleUpcoming.length === 0 && hiddenUpcoming.length === 0 ? (
          <p className="text-sm text-muted">Nothing due in the next 7 days. 🎉</p>
        ) : (
          <>
            {visibleUpcoming.length > 0 ? (
              <ul className="divide-y divide-border">{visibleUpcoming.map((r) => upcomingRow(r, false))}</ul>
            ) : (
              <p className="text-sm text-muted">All upcoming items are hidden.</p>
            )}
            {hiddenUpcoming.length > 0 && (
              <div className="mt-3 border-t border-border pt-3">
                <button
                  onClick={() => setShowHidden((v) => !v)}
                  className="text-sm font-medium text-brand hover:underline"
                >
                  {showHidden ? "Hide" : "Reveal"} hidden ({hiddenUpcoming.length})
                </button>
                {showHidden && (
                  <ul className="mt-2 divide-y divide-border opacity-70">
                    {hiddenUpcoming.map((r) => upcomingRow(r, true))}
                  </ul>
                )}
              </div>
            )}
          </>
        )}
      </Card>
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
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value)}
            className="ml-auto rounded-lg border border-border bg-surface px-3 py-2 text-sm"
            title="Group rows (like a spreadsheet)"
          >
            <option value="">No grouping</option>
            {showSalesPic && <option value="pic">Group by Sales PIC</option>}
            <option value="status">Group by Collection Status</option>
            <option value="deal">Group by Deal Status</option>
            <option value="hrdc">Group by HRDC</option>
          </select>
          <select value={sort} onChange={(e) => setSort(e.target.value)} className="rounded-lg border border-border bg-surface px-3 py-2 text-sm">
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
              {groups
                ? groups.map(([name, rs]) => (
                    <Fragment key={name}>
                      <tr className="border-t border-border bg-gray-50">
                        <td colSpan={colSpan} className="px-4 py-2 text-sm">
                          <span className="font-semibold">{name}</span>
                          <span className="text-muted"> · {rs.length} deal{rs.length === 1 ? "" : "s"} · outstanding </span>
                          <span className="font-medium tabular-nums">{formatMYR(sumMoney(rs.map((r) => r.outstanding)))}</span>
                        </td>
                      </tr>
                      {rs.map(renderRow)}
                    </Fragment>
                  ))
                : filtered.map(renderRow)}
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
