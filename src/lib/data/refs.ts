import { createClient } from "@/lib/supabase/server";
import type { BankAccount, Category, PaymentMethod, Profile } from "@/lib/types";

export async function getCategories(kind?: "expense" | "payable"): Promise<Category[]> {
  const supabase = await createClient();
  let q = supabase.from("categories").select("*").order("name");
  if (kind) q = q.eq("kind", kind);
  const { data } = await q;
  return (data ?? []) as Category[];
}

export async function getPaymentMethods(): Promise<PaymentMethod[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("payment_methods")
    .select("*")
    .order("name");
  return (data ?? []) as PaymentMethod[];
}

export async function getBankAccounts(): Promise<BankAccount[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("bank_accounts")
    .select("*")
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("account_name");
  return (data ?? []) as BankAccount[];
}

export async function getProfiles(): Promise<Profile[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("*").order("full_name");
  return (data ?? []) as Profile[];
}

/** Distinct Sales PIC names for filters / assignment. */
export async function getSalesPics(): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("sales_pic")
    .eq("role", "sales")
    .not("sales_pic", "is", null);
  const set = new Set<string>();
  for (const row of data ?? []) if (row.sales_pic) set.add(row.sales_pic);
  return [...set].sort();
}

export function methodName(methods: PaymentMethod[], id: string | null): string {
  if (!id) return "—";
  return methods.find((m) => m.id === id)?.name ?? "—";
}
export function categoryName(cats: Category[], id: string | null): string {
  if (!id) return "—";
  return cats.find((c) => c.id === id)?.name ?? "—";
}
