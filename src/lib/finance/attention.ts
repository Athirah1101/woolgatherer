// Auto-generated "Attention Required" action items. Assembled by the dashboard
// data layer from the various module summaries; ordered most-urgent first.

export type AttentionSeverity = "critical" | "high" | "medium" | "low";

export interface AttentionItem {
  id: string;
  severity: AttentionSeverity;
  module: "receivables" | "payables" | "expenses" | "hrdc";
  title: string;
  href: string;
}

const ORDER: Record<AttentionSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export function sortAttention(items: AttentionItem[]): AttentionItem[] {
  return [...items].sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
}
