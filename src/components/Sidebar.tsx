"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/components/ui";
import { FeedbackButton } from "@/components/FeedbackButton";
import type { Role } from "@/lib/types";

interface Item {
  label: string;
  href: string;
  icon: string;
  roles: Role[];
}
interface Group {
  heading?: string;
  items: Item[];
}

const ALL: Role[] = ["finance", "sales", "management"];
const FIN_MGMT: Role[] = ["finance", "management"];
const FIN: Role[] = ["finance"];

const NAV: Group[] = [
  { items: [{ label: "Dashboard", href: "/dashboard", icon: "🏠", roles: ALL }] },
  { items: [{ label: "Bank Accounts", href: "/settings/bank-accounts", icon: "🏦", roles: FIN }] },
  {
    heading: "Money In",
    items: [
      { label: "Receivables", href: "/receivables", icon: "📥", roles: ALL },
      { label: "HRDC Claims", href: "/hrdc", icon: "🎓", roles: FIN_MGMT },
    ],
  },
  {
    heading: "Money Out",
    items: [{ label: "Payables", href: "/payables", icon: "📤", roles: FIN_MGMT }],
  },
  {
    heading: "Refunds",
    items: [{ label: "Refunds", href: "/refunds", icon: "↩️", roles: FIN_MGMT }],
  },
  { items: [{ label: "Cashflow", href: "/cashflow", icon: "💵", roles: FIN_MGMT }] },
  { items: [{ label: "Change History", href: "/activity", icon: "🕒", roles: FIN_MGMT }] },
  { items: [{ label: "Feedback", href: "/feedback", icon: "💬", roles: FIN_MGMT }] },
  {
    heading: "Settings",
    items: [
      { label: "Recurring Payables", href: "/settings/recurring", icon: "🔁", roles: FIN },
      { label: "Categories", href: "/settings/categories", icon: "🏷️", roles: FIN },
      { label: "Payment Methods", href: "/settings/payment-methods", icon: "💳", roles: FIN },
      { label: "Users & Access", href: "/settings/users", icon: "👥", roles: FIN },
    ],
  },
];

const COLLAPSE_KEY = "financeos.sidebar.collapsed";

export function Sidebar({
  role,
  name,
  email,
}: {
  role: Role;
  name: string;
  email: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false); // mobile drawer
  const [collapsed, setCollapsed] = useState(false); // desktop icon-only

  // Restore the collapsed preference per browser.
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      /* ignore */
    }
  }, []);
  function toggleCollapsed() {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  async function signOut() {
    await createClient().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  const roleLabel = { finance: "Finance", sales: "Sales", management: "Management" }[role];

  const nav = (
    <nav className="flex flex-1 flex-col gap-5 overflow-y-auto px-3 py-4">
      {NAV.map((group, gi) => {
        const items = group.items.filter((i) => i.roles.includes(role));
        if (items.length === 0) return null;
        return (
          <div key={gi}>
            {group.heading && !collapsed && (
              <p className="mb-1.5 px-3 text-xs font-semibold uppercase tracking-wide text-muted">
                {group.heading}
              </p>
            )}
            <div className="space-y-0.5">
              {items.map((i) => {
                const active =
                  pathname === i.href || pathname.startsWith(i.href + "/");
                return (
                  <Link
                    key={i.href}
                    href={i.href}
                    onClick={() => setOpen(false)}
                    title={collapsed ? i.label : undefined}
                    className={cn(
                      "flex items-center rounded-lg text-sm font-medium transition",
                      collapsed ? "justify-center px-0 py-2.5" : "gap-2.5 px-3 py-2",
                      active ? "bg-brand text-white" : "text-text hover:bg-gray-100",
                    )}
                  >
                    <span className="text-base leading-none">{i.icon}</span>
                    {!collapsed && <span>{i.label}</span>}
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>
  );

  return (
    <>
      {/* Mobile top bar */}
      <div className="flex items-center justify-between border-b border-border bg-surface px-4 py-3 md:hidden">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-sm font-bold text-white">
            F
          </div>
          <span className="font-semibold">FinanceOS</span>
        </div>
        <button
          onClick={() => setOpen((o) => !o)}
          className="rounded-md border border-border px-3 py-1.5 text-sm"
        >
          Menu
        </button>
      </div>

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex flex-col border-r border-border bg-surface transition-all md:static md:translate-x-0",
          collapsed ? "w-64 md:w-16" : "w-64",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div
          className={cn(
            "flex items-center border-b border-border py-4",
            collapsed ? "justify-center px-2" : "gap-2 px-5",
          )}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand font-bold text-white">
            F
          </div>
          {!collapsed && (
            <div>
              <p className="font-semibold leading-tight">FinanceOS</p>
              <p className="text-xs text-muted">Vertex Mastery</p>
            </div>
          )}
        </div>

        {/* Collapse toggle (desktop only) */}
        <button
          onClick={toggleCollapsed}
          className="hidden items-center gap-2 border-b border-border px-3 py-2 text-xs font-medium text-muted hover:bg-gray-50 md:flex"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <span className="flex w-9 justify-center text-base">{collapsed ? "»" : "«"}</span>
          {!collapsed && <span>Collapse</span>}
        </button>

        {nav}

        <div className="border-t border-border p-3">
          {collapsed ? (
            <button
              onClick={signOut}
              title="Sign out"
              className="flex w-full justify-center rounded-lg py-2 text-muted hover:bg-gray-100"
            >
              ⎋
            </button>
          ) : (
            <>
              <div className="mb-3">
                <FeedbackButton />
              </div>
              <div className="mb-2 px-2">
                <p className="truncate text-sm font-medium">{name}</p>
                <p className="truncate text-xs text-muted">{email}</p>
                <span className="mt-1 inline-block rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
                  {roleLabel}
                </span>
              </div>
              <button
                onClick={signOut}
                className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-muted hover:bg-gray-100"
              >
                Sign out
              </button>
            </>
          )}
        </div>
      </aside>
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/20 md:hidden"
          onClick={() => setOpen(false)}
        />
      )}
    </>
  );
}
