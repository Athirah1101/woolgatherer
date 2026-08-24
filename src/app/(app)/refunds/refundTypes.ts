// Plain (non-client) module so both the server page and the client form can
// import these without crossing a "use client" boundary.

export const REFUND_TYPES: { value: string; label: string }[] = [
  { value: "hrdc", label: "HRDC" },
  { value: "deposit", label: "Refundable Deposit" },
  { value: "changed_mind", label: "Client Changed Mind" },
  { value: "other", label: "Other" },
];

export const refundTypeLabel = (v: string | null | undefined) =>
  REFUND_TYPES.find((t) => t.value === v)?.label ?? "Other";
