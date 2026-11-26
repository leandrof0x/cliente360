"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext, canManage } from "@/lib/session";
import { STARTER_TEMPLATES } from "@/lib/templates";
import { fieldErrors } from "@/lib/validation";
import { friendlyDbError } from "@/lib/utils";
import type { ActionResult } from "@/lib/types";

const templateSchema = z.object({
  name: z.string().trim().min(1, "Poné un nombre").max(120),
  category: z.string().trim().max(60).optional().transform((v) => v || null),
  channel: z.enum(["whatsapp", "email"]).default("whatsapp"),
  body: z.string().trim().min(1, "Escribí el mensaje").max(4000, "Máximo 4000 caracteres"),
});

function canEdit(role: string) {
  return role !== "collaborator";
}

export async function saveTemplate(id: string | null, _: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx.writable) return { ok: false, error: "Tu cuenta está en modo solo lectura." };
  if (!canEdit(ctx.role)) return { ok: false, error: "Tu rol no permite editar plantillas." };
  const parsed = templateSchema.safeParse({
    name: formData.get("name"),
    category: formData.get("category") ?? undefined,
    channel: formData.get("channel") ?? undefined,
    body: formData.get("body"),
  });
  if (!parsed.success) return { ok: false, error: "Revisá los campos.", fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("message_templates").update(parsed.data).eq("id", id).eq("organization_id", ctx.org.id)
    : await supabase.from("message_templates").insert({ ...parsed.data, organization_id: ctx.org.id });
  if (error) {
    if (error.code === "23505") return { ok: false, error: "Ya existe una plantilla con ese nombre.", fieldErrors: { name: ["Nombre repetido"] } };
    return { ok: false, error: friendlyDbError(error) };
  }
  revalidatePath("/plantillas");
  return { ok: true, message: id ? "Plantilla actualizada." : "Plantilla creada." };
}

export async function deleteTemplate(id: string): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Plantilla inválida." };
  const ctx = await getOrgContext();
  if (!canManage(ctx.role)) return { ok: false, error: "Solo propietarios y administradores pueden eliminar plantillas." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("message_templates").delete().eq("id", id).eq("organization_id", ctx.org.id).select("id");
  if (error) return { ok: false, error: friendlyDbError(error) };
  if (!data?.length) return { ok: false, error: "No se pudo eliminar." };
  revalidatePath("/plantillas");
  return { ok: true };
}

export async function addStarterTemplates(): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx.writable || !canEdit(ctx.role)) return { ok: false, error: "No tenés permiso para crear plantillas." };
  const supabase = await createClient();
  const { data: existing } = await supabase.from("message_templates").select("name").eq("organization_id", ctx.org.id);
  const names = new Set((existing ?? []).map((t) => t.name));
  const rows = STARTER_TEMPLATES.filter((t) => !names.has(t.name)).map((t) => ({ ...t, channel: "whatsapp", organization_id: ctx.org.id }));
  if (rows.length) {
    const { error } = await supabase.from("message_templates").insert(rows);
    if (error) return { ok: false, error: friendlyDbError(error) };
  }
  revalidatePath("/plantillas");
  return { ok: true, message: `${rows.length} plantillas agregadas.` };
}

/** Registra en el historial un mensaje de WhatsApp enviado manualmente por el usuario. */
export async function logManualWhatsApp(input: { customerId: string; leadId?: string | null; content: string }): Promise<ActionResult> {
  const parsed = z
    .object({ customerId: z.string().uuid(), leadId: z.string().uuid().nullish(), content: z.string().trim().min(1).max(5000) })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Mensaje inválido." };
  const ctx = await getOrgContext();
  if (!ctx.writable) return { ok: false, error: "Tu cuenta está en modo solo lectura." };
  const supabase = await createClient();
  const { error } = await supabase.from("interactions").insert({
    organization_id: ctx.org.id,
    customer_id: parsed.data.customerId,
    lead_id: parsed.data.leadId ?? null,
    type: "whatsapp",
    direction: "saliente",
    content: parsed.data.content,
  });
  if (error) return { ok: false, error: friendlyDbError(error) };
  await supabase.from("customers").update({ status: "activo" }).eq("id", parsed.data.customerId).eq("organization_id", ctx.org.id).eq("status", "nuevo");
  revalidatePath(`/clientes/${parsed.data.customerId}`);
  revalidatePath("/dashboard");
  return { ok: true, message: "Mensaje registrado en el historial." };
}
