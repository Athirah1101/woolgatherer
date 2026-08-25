import type { Tone } from "@/components/ui";

// Receivable status options — the deal/collection status Finance sets manually.
// Includes the "Collection Status" values from the original cashflow sheet
// (On Time / Delayed / Cleared / Others) plus the app's lifecycle states.
export const RECV_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "on_time", label: "On Time" },
  { value: "delayed", label: "Delayed" },
  { value: "cleared", label: "Cleared" },
  { value: "others", label: "Others" },
  { value: "on_hold", label: "On Hold" },
  { value: "stopped", label: "Stopped" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

export const recvStatusLabel = (v: string) =>
  RECV_STATUS_OPTIONS.find((o) => o.value === v)?.label ?? v;

export const recvStatusTone: Record<string, Tone> = {
  active: "blue",
  on_time: "green",
  delayed: "orange",
  cleared: "green",
  others: "gray",
  on_hold: "amber",
  stopped: "red",
  completed: "green",
  cancelled: "gray",
};
