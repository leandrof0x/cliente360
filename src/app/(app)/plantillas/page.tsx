import type { Metadata } from "next";
import { getOrgContext, canManage } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/page-header";
import { TemplateManager, type TemplateRow } from "@/components/templates/template-manager";

export const metadata: Metadata = { title: "Plantillas" };

export default async function TemplatesPage() {
  const ctx = await getOrgContext();
  const supabase = await createClient();
  const { data } = await supabase
    .from("message_templates")
    .select("id, name, category, channel, body")
    .eq("organization_id", ctx.org.id)
    .order("name");
  return (
    <>
      <PageHeader title="Plantillas de mensajes" description="Mensajes listos para personalizar y enviar por WhatsApp desde la ficha de cada cliente." />
      <TemplateManager templates={(data ?? []) as TemplateRow[]} canEdit={ctx.writable && ctx.role !== "collaborator"} canDelete={ctx.writable && canManage(ctx.role)} />
    </>
  );
}
