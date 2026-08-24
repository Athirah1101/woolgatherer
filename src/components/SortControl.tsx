"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Select } from "@/components/form";

export interface SortOption {
  value: string;
  label: string;
}

/**
 * A "Sort by" dropdown that stores the choice in the URL (?sort=…), preserving
 * any other query params (filters). The default option clears the param.
 */
export function SortControl({
  options,
  param = "sort",
  label = "Sort by",
}: {
  options: SortOption[];
  param?: string;
  label?: string;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const pathname = usePathname();
  const def = options[0].value;
  const current = sp.get(param) ?? def;

  function onChange(value: string) {
    const params = new URLSearchParams(sp.toString());
    if (value === def) params.delete(param);
    else params.set(param, value);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <label className="flex items-center gap-2 text-sm text-muted">
      <span className="whitespace-nowrap">{label}</span>
      <Select value={current} onChange={(e) => onChange(e.target.value)} className="w-auto bg-surface">
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </Select>
    </label>
  );
}
