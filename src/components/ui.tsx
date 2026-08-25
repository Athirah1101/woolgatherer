import Link from "next/link";
import type { ReactNode } from "react";

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

// ---------------------------------------------------------------- Card
export function Card({
  children,
  className,
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-surface shadow-sm",
        padded && "p-5",
        className,
      )}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------- Page header
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
      {children}
    </h2>
  );
}

// ---------------------------------------------------------------- Buttons
type BtnVariant = "primary" | "secondary" | "ghost" | "danger";
const btnStyles: Record<BtnVariant, string> = {
  primary: "bg-brand text-white hover:bg-indigo-700",
  secondary: "border border-border bg-surface text-text hover:bg-gray-50",
  ghost: "text-muted hover:bg-gray-100",
  danger: "border border-red-200 bg-white text-red-600 hover:bg-red-50",
};
const btnBase =
  "inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition disabled:opacity-50 disabled:pointer-events-none";

export function ButtonLink({
  href,
  children,
  variant = "primary",
  className,
}: {
  href: string;
  children: ReactNode;
  variant?: BtnVariant;
  className?: string;
}) {
  return (
    <Link href={href} className={cn(btnBase, btnStyles[variant], className)}>
      {children}
    </Link>
  );
}

export const buttonClass = (variant: BtnVariant = "primary") =>
  cn(btnBase, btnStyles[variant]);

// ---------------------------------------------------------------- Badges / chips
export type Tone =
  | "neutral"
  | "green"
  | "amber"
  | "red"
  | "blue"
  | "indigo"
  | "orange"
  | "gray";

const toneStyles: Record<Tone, string> = {
  neutral: "bg-gray-100 text-gray-700",
  gray: "bg-gray-100 text-gray-600",
  green: "bg-emerald-100 text-emerald-800",
  amber: "bg-amber-100 text-amber-800",
  orange: "bg-orange-100 text-orange-800",
  red: "bg-red-100 text-red-800",
  blue: "bg-sky-100 text-sky-800",
  indigo: "bg-indigo-100 text-indigo-800",
};

export function Chip({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium",
        toneStyles[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Status chip = the record's state (Unpaid, Partially Paid, ...). */
export function StatusChip({ label, tone }: { label: string; tone: Tone }) {
  return <Chip tone={tone}>{label}</Chip>;
}

/** Attention badge = timing/urgency, deliberately separate from Status. */
export function AttentionBadge({
  label,
  tone,
}: {
  label: string;
  tone: Tone;
}) {
  if (!label) return <span className="text-muted">—</span>;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold",
        toneStyles[tone],
      )}
    >
      {label}
    </span>
  );
}

// ---------------------------------------------------------------- Summary card
export function SummaryCard({
  label,
  value,
  sub,
  tone = "neutral",
  href,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: Tone;
  href?: string;
}) {
  const accent: Record<Tone, string> = {
    neutral: "",
    gray: "",
    green: "text-emerald-600",
    amber: "text-amber-600",
    orange: "text-orange-600",
    red: "text-red-600",
    blue: "text-sky-600",
    indigo: "text-indigo-600",
  };
  const inner = (
    <Card className={href ? "transition hover:border-indigo-300 hover:shadow" : undefined}>
      <div className="text-xs font-medium uppercase tracking-wide text-muted">
        {label}
      </div>
      <div className={cn("mt-1.5 text-xl font-semibold leading-tight tabular-nums break-words lg:text-2xl", accent[tone])}>
        {value}
      </div>
      {sub != null && <div className="mt-1 text-xs text-muted">{sub}</div>}
    </Card>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

// ---------------------------------------------------------------- Empty state
export function EmptyState({
  title,
  message,
  action,
}: {
  title: string;
  message?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-surface px-6 py-14 text-center">
      <p className="text-sm font-medium text-text">{title}</p>
      {message && <p className="mt-1 max-w-md text-sm text-muted">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- Table
export function Table({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-surface">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        {children}
      </table>
    </div>
  );
}
export function THead({ children }: { children: ReactNode }) {
  return (
    <thead className="border-b border-border bg-gray-50 text-left text-xs uppercase tracking-wide text-muted">
      {children}
    </thead>
  );
}
export function TH({
  children,
  className,
  right,
}: {
  children?: ReactNode;
  className?: string;
  right?: boolean;
}) {
  return (
    <th className={cn("px-4 py-2.5 font-medium", right && "text-right", className)}>
      {children}
    </th>
  );
}
export function TBody({ children }: { children: ReactNode }) {
  return <tbody>{children}</tbody>;
}
export function TR({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <tr className={cn("border-b border-border last:border-0 hover:bg-gray-50/60", className)}>
      {children}
    </tr>
  );
}
export function TD({
  children,
  className,
  right,
}: {
  children?: ReactNode;
  className?: string;
  right?: boolean;
}) {
  return (
    <td className={cn("px-4 py-3 align-middle", right && "text-right tabular-nums", className)}>
      {children}
    </td>
  );
}
