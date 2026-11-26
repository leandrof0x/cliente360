import "server-only";
import { createClient } from "@/lib/supabase/server";

/** Lista corta de clientes para selectores (ordenados por nombre). */
export async function getCustomerOptions(orgId: string, limit = 1000) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("customers")
    .select("id, full_name, company")
    .eq("organization_id", orgId)
    .order("full_name")
    .limit(limit);
  return (data ?? []).map((c) => ({ id: c.id as string, name: c.company ? `${c.full_name} (${c.company})` : (c.full_name as string) }));
}
