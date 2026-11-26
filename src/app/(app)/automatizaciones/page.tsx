import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getOrgContext, canManage } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { AutomationManager, type AutomationRow } from "@/components/automations/automation-manager";

export const metadata: Metadata = { title: "Automatizaciones" };

export default async function AutomationsPage() {
  const ctx = await getOrgContext();
  if (!canManage(ctx.role)) redirect("/dashboard");
  const supabase = await createClient();
  const [{ data: automations }, { data: runs }, { data: planAllows }, { data: waReady }] = await Promise.all([
    supabase.from("automations").select("*").eq("organization_id", ctx.org.id).order("created_at"),
    supabase.from("automation_runs").select("id, automation_id, status, detail, created_at").eq("organization_id", ctx.org.id).order("created_at", { ascending: false }).limit(20),
    supabase.rpc("org_has_feature", { org: ctx.org.id, feature: "automations" }),
    supabase.rpc("channel_is_authorized", { org: ctx.org.id, ch: "whatsapp" }),
  ]);
  const nameById = new Map((automations ?? []).map((a) => [a.id, a.name as string]));
  return (
    <>
      <PageHeader title="Automatizaciones" description="Reglas simples que trabajan por vos. Nunca envían mensajes sin un canal autorizado." />
      <AutomationManager
        automations={(automations ?? []) as AutomationRow[]}
        runs={(runs ?? []).map((r) => ({ ...r, automation_name: nameById.get(r.automation_id) ?? "Automatización" }))}
        canEdit={ctx.writable}
        planAllows={Boolean(planAllows)}
        whatsappReady={Boolean(waReady)}
      />
    </>
  );
}
