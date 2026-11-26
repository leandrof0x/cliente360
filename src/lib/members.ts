import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export interface MemberOption {
  id: string;
  name: string;
}

/** Miembros de la empresa para asignar responsables. */
export const getMemberOptions = cache(async (orgId: string): Promise<MemberOption[]> => {
  const supabase = await createClient();
  const { data: members } = await supabase.from("organization_members").select("user_id").eq("organization_id", orgId);
  const ids = (members ?? []).map((m) => m.user_id as string);
  if (!ids.length) return [];
  const { data: profiles } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
  return (profiles ?? [])
    .map((p) => ({ id: p.id as string, name: (p.full_name as string | null) ?? (p.email as string) ?? "Usuario" }))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
});
