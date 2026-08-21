import { createClient } from "@/lib/supabase/server";
import type { Expense } from "@/lib/types";

export async function getExpenses(): Promise<Expense[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("expenses")
    .select("*")
    .order("invoice_date", { ascending: false, nullsFirst: false });
  return (data ?? []) as Expense[];
}
