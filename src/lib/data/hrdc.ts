import { createClient } from "@/lib/supabase/server";
import type { HrdcClaim, HrdcRefund } from "@/lib/types";
import {
  deriveStage, queryStatus, refundAttention, refundSummary,
  stageTab, type HrdcStage, type QueryStatus, type RefundAttention, type RefundSummary,
} from "@/lib/finance/hrdc";
import { todayISO } from "@/lib/finance/dates";

export interface HrdcRow {
  claim: HrdcClaim;
  refunds: HrdcRefund[];
  refund: RefundSummary;
  refundAttn: RefundAttention | null;
  query: QueryStatus;
  stage: HrdcStage;
  tab: string;
}

function buildRow(claim: HrdcClaim, refunds: HrdcRefund[], today: string): HrdcRow {
  const refund = refundSummary(claim, refunds);
  const stage = deriveStage(claim, refunds);
  return {
    claim,
    refunds,
    refund,
    refundAttn: refundAttention(claim, refunds, today),
    query: queryStatus(claim, today),
    stage,
    tab: stageTab(stage),
  };
}

export async function getHrdcRows(): Promise<HrdcRow[]> {
  const supabase = await createClient();
  const today = todayISO();
  const [{ data: claims }, { data: refunds }] = await Promise.all([
    supabase.from("hrdc_claims").select("*").order("created_at", { ascending: false }),
    supabase.from("hrdc_refunds").select("*"),
  ]);
  const refByClaim = new Map<string, HrdcRefund[]>();
  for (const r of (refunds ?? []) as HrdcRefund[])
    (refByClaim.get(r.claim_id) ?? refByClaim.set(r.claim_id, []).get(r.claim_id)!).push(r);
  return ((claims ?? []) as HrdcClaim[]).map((c) => buildRow(c, refByClaim.get(c.id) ?? [], today));
}

export async function getHrdcDetail(id: string): Promise<HrdcRow | null> {
  const supabase = await createClient();
  const today = todayISO();
  const { data: claim } = await supabase.from("hrdc_claims").select("*").eq("id", id).single();
  if (!claim) return null;
  const { data: refunds } = await supabase
    .from("hrdc_refunds")
    .select("*")
    .eq("claim_id", id)
    .order("refund_date", { ascending: false });
  return buildRow(claim as HrdcClaim, (refunds ?? []) as HrdcRefund[], today);
}
