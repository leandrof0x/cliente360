"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/session";
import { formFields, leadSchema, pyLocalToIso } from "@/lib/crm";
import { fieldErrors } from "@/lib/validation";
import { friendlyDbError } from "@/lib/utils";
import type { ActionResult, LeadStatus } from "@/lib/types";

const LEAD_KEYS = [
  "customer_id", "title", "description", "product_service", "estimated_value", "entered_at",
  "assigned_to", "status", "next_action", "next_follow_up_at", "lost_reason",
];
const STATUSES = ["nueva", "contactado", "interesado", "seguimiento", "negociacion", "ganado", "perdido"] as const;

function revalidateLeads(leadId?: string, customerId?: string) {
  revalidatePath("/pipeline");
  revalidatePath("/dashboard");
  revalidatePath("/seguimientos");
  if (leadId) revalidatePath(`/pipeline/${leadId}`);
  if (customerId) revalidatePath(`/clientes/${customerId}`);
}

export async function saveLead(leadId: string | null, _: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx.writable) return { ok: false, error: "Tu cuenta está en modo solo lectura." };
  const parsed = leadSchema.safeParse(formFields(formData, LEAD_KEYS));
  if (!parsed.success) return { ok: false, error: "Revisá los campos marcados.", fieldErrors: fieldErrors(parsed.error) };

  const input = parsed.data;
  const row = {
    ...input,
    entered_at: input.entered_at ?? undefined,
    next_follow_up_at: pyLocalToIso(input.next_follow_up_at),
    lost_reason: input.status === "perdido" ? input.lost_reason : null,
  };
  const supabase = await createClient();

  if (leadId) {
    const { error } = await supabase.from("leads").update(row).eq("id", leadId).eq("organization_id", ctx.org.id);
    if (error) return { ok: false, error: friendlyDbError(error) };
    revalidateLeads(leadId, input.customer_id);
    return { ok: true, message: "Oportunidad actualizada." };
  }

  // Nueva: al final de su columna
  const { data: last } = await supabase
    .from("leads")
    .select("position")
    .eq("organization_id", ctx.org.id)
    .eq("status", input.status)
    .order("position", { ascending: false })
    .limit(1);
  const position = (last?.[0]?.position ?? 0) + 1000;
  const { data, error } = await supabase
    .from("leads")
    .insert({ ...row, position, organization_id: ctx.org.id })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: friendlyDbError(error) };
  revalidateLeads(data.id, input.customer_id);
  redirect(`/pipeline/${data.id}?creada=1`);
}

const moveSchema = z.object({
  leadId: z.string().uuid(),
  status: z.enum(STATUSES),
  position: z.number().finite(),
  lostReason: z.string().trim().max(500).optional(),
});

/** Mover una tarjeta del Kanban (cambio de estado y/o de orden). */
export async function moveLead(input: { leadId: string; status: LeadStatus; position: number; lostReason?: string }): Promise<ActionResult> {
  const parsed = moveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Movimiento inválido." };
  const ctx = await getOrgContext();
  if (!ctx.writable) return { ok: false, error: "Tu cuenta está en modo solo lectura." };
  const supabase = await createClient();
  const update: Record<string, unknown> = { status: parsed.data.status, position: parsed.data.position };
  if (parsed.data.status === "perdido" && parsed.data.lostReason) update.lost_reason = parsed.data.lostReason;
  const { data, error } = await supabase
    .from("leads")
    .update(update)
    .eq("id", parsed.data.leadId)
    .eq("organization_id", ctx.org.id)
    .select("id, customer_id");
  if (error) return { ok: false, error: friendlyDbError(error) };
  if (!data?.length) return { ok: false, error: "No se encontró la oportunidad." };
  revalidateLeads(parsed.data.leadId, data[0].customer_id);
  return { ok: true };
}

export async function deleteLead(leadId: string): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(leadId).success) return { ok: false, error: "Oportunidad inválida." };
  const ctx = await getOrgContext();
  if (ctx.role === "collaborator") return { ok: false, error: "Tu rol no permite eliminar oportunidades." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leads")
    .delete()
    .eq("id", leadId)
    .eq("organization_id", ctx.org.id)
    .select("id, customer_id");
  if (error) return { ok: false, error: friendlyDbError(error) };
  if (!data?.length) return { ok: false, error: "No se pudo eliminar la oportunidad." };
  revalidateLeads(undefined, data[0].customer_id);
  redirect("/pipeline");
}
