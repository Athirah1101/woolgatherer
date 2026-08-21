import { createClient } from "@/lib/supabase/server";
import type {
  HrdcClaim,
  PaymentAllocation,
  PaymentSchedule,
  Receivable,
  ReceivablePayment,
} from "@/lib/types";
import { summarizeReceivable, type ReceivableSummary } from "@/lib/finance/receivables";
import { todayISO } from "@/lib/finance/dates";

export interface ReceivableRow {
  receivable: Receivable;
  summary: ReceivableSummary;
}

export async function getReceivableRows(): Promise<ReceivableRow[]> {
  const supabase = await createClient();
  const today = todayISO();

  const [{ data: receivables }, { data: schedules }, { data: payments }, { data: allocations }] =
    await Promise.all([
      supabase.from("receivables").select("*").order("deal_date", { ascending: false }),
      supabase.from("payment_schedules").select("*"),
      supabase.from("receivable_payments").select("*"),
      supabase.from("payment_allocations").select("*"),
    ]);

  const schedByR = new Map<string, PaymentSchedule[]>();
  for (const s of (schedules ?? []) as PaymentSchedule[])
    (schedByR.get(s.receivable_id) ?? schedByR.set(s.receivable_id, []).get(s.receivable_id)!).push(s);
  const payByR = new Map<string, ReceivablePayment[]>();
  for (const p of (payments ?? []) as ReceivablePayment[])
    (payByR.get(p.receivable_id) ?? payByR.set(p.receivable_id, []).get(p.receivable_id)!).push(p);
  const allocByPayment = allocations ?? [];

  return ((receivables ?? []) as Receivable[]).map((r) => {
    const sched = schedByR.get(r.id) ?? [];
    const pays = payByR.get(r.id) ?? [];
    const payIds = new Set(pays.map((p) => p.id));
    const allocs = (allocByPayment as PaymentAllocation[]).filter((a) => payIds.has(a.payment_id));
    return { receivable: r, summary: summarizeReceivable(sched, pays, allocs, today) };
  });
}

export interface ReceivableDetail {
  receivable: Receivable;
  schedules: PaymentSchedule[];
  payments: ReceivablePayment[];
  allocations: PaymentAllocation[];
  summary: ReceivableSummary;
  hrdcClaim: Pick<HrdcClaim, "id" | "stage"> | null;
}

export async function getReceivableDetail(id: string): Promise<ReceivableDetail | null> {
  const supabase = await createClient();
  const today = todayISO();

  const { data: receivable } = await supabase
    .from("receivables")
    .select("*")
    .eq("id", id)
    .single();
  if (!receivable) return null;

  const [{ data: schedules }, { data: payments }, { data: hrdc }] = await Promise.all([
    supabase.from("payment_schedules").select("*").eq("receivable_id", id),
    supabase
      .from("receivable_payments")
      .select("*")
      .eq("receivable_id", id)
      .order("received_date", { ascending: false }),
    supabase.from("hrdc_claims").select("id, stage").eq("receivable_id", id).maybeSingle(),
  ]);

  const payIds = (payments ?? []).map((p) => p.id);
  const { data: allocations } = payIds.length
    ? await supabase.from("payment_allocations").select("*").in("payment_id", payIds)
    : { data: [] as PaymentAllocation[] };

  const s = (schedules ?? []) as PaymentSchedule[];
  const p = (payments ?? []) as ReceivablePayment[];
  const a = (allocations ?? []) as PaymentAllocation[];

  return {
    receivable: receivable as Receivable,
    schedules: s,
    payments: p,
    allocations: a,
    summary: summarizeReceivable(s, p, a, today),
    hrdcClaim: (hrdc as { id: string; stage: string } | null) ?? null,
  };
}
