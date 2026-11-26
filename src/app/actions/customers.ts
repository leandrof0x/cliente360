"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext, canManage } from "@/lib/session";
import { customerSchema, formFields, interactionSchema, pyLocalToIso } from "@/lib/crm";
import { fieldErrors } from "@/lib/validation";
import { friendlyDbError } from "@/lib/utils";
import { normalizePhone } from "@/lib/phone";
import type { ActionResult } from "@/lib/types";

const CUSTOMER_KEYS = [
  "full_name", "phone", "whatsapp", "email", "company", "customer_type", "source",
  "registered_at", "status", "tags", "notes", "assigned_to",
];

/** Busca un cliente existente con el mismo teléfono/WhatsApp o correo. */
async function findDuplicate(orgId: string, phone: string | null, email: string | null, excludeId?: string) {
  const supabase = await createClient();
  const norm = normalizePhone(phone);
  if (norm) {
    let q = supabase.from("customers").select("id, full_name").eq("organization_id", orgId).eq("phone_normalized", norm);
    if (excludeId) q = q.neq("id", excludeId);
    const { data } = await q.limit(1);
    if (data?.[0]) return { ...data[0], field: "teléfono" };
  }
  if (email) {
    let q = supabase.from("customers").select("id, full_name").eq("organization_id", orgId).ilike("email", email);
    if (excludeId) q = q.neq("id", excludeId);
    const { data } = await q.limit(1);
    if (data?.[0]) return { ...data[0], field: "correo" };
  }
  return null;
}

export async function saveCustomer(
  customerId: string | null,
  _: ActionResult<{ id: string; duplicateId?: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ id: string; duplicateId?: string }>> {
  const ctx = await getOrgContext();
  if (!ctx.writable) return { ok: false, error: "Tu cuenta está en modo solo lectura." };

  const parsed = customerSchema.safeParse(formFields(formData, CUSTOMER_KEYS));
  if (!parsed.success) return { ok: false, error: "Revisá los campos marcados.", fieldErrors: fieldErrors(parsed.error) };
  const input = parsed.data;

  const dup = await findDuplicate(ctx.org.id, input.whatsapp ?? input.phone, input.email, customerId ?? undefined);
  const dupPhone2 = !dup && input.whatsapp && input.phone ? await findDuplicate(ctx.org.id, input.phone, null, customerId ?? undefined) : null;
  const duplicate = dup ?? dupPhone2;
  if (duplicate) {
    return {
      ok: false,
      error: `Ya existe un cliente con ese ${duplicate.field}: ${duplicate.full_name}.`,
      fieldErrors: duplicate.field === "correo" ? { email: ["Duplicado"] } : { phone: ["Duplicado"] },
      data: { id: duplicate.id, duplicateId: duplicate.id },
    } as ActionResult<{ id: string; duplicateId?: string }>;
  }

  const supabase = await createClient();
  const row = { ...input, registered_at: input.registered_at ?? undefined };

  if (customerId) {
    const { error } = await supabase.from("customers").update(row).eq("id", customerId).eq("organization_id", ctx.org.id);
    if (error) return { ok: false, error: friendlyDbError(error) };
    revalidatePath("/clientes");
    revalidatePath(`/clientes/${customerId}`);
    redirect(`/clientes/${customerId}`);
  }

  const { data, error } = await supabase
    .from("customers")
    .insert({ ...row, organization_id: ctx.org.id })
    .select("id")
    .single();
  if (error || !data) return { ok: false, error: friendlyDbError(error) };
  revalidatePath("/clientes");
  revalidatePath("/dashboard");
  redirect(`/clientes/${data.id}?creado=1`);
}

export async function deleteCustomer(customerId: string): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(customerId).success) return { ok: false, error: "Cliente inválido." };
  const ctx = await getOrgContext();
  if (!canManage(ctx.role)) return { ok: false, error: "Solo propietarios y administradores pueden eliminar clientes." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("customers")
    .delete()
    .eq("id", customerId)
    .eq("organization_id", ctx.org.id)
    .select("id");
  if (error) return { ok: false, error: friendlyDbError(error) };
  if (!data?.length) return { ok: false, error: "No se pudo eliminar el cliente." };
  revalidatePath("/clientes");
  revalidatePath("/dashboard");
  redirect("/clientes?eliminado=1");
}

export async function addInteraction(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx.writable) return { ok: false, error: "Tu cuenta está en modo solo lectura." };
  const parsed = interactionSchema.safeParse(
    formFields(formData, ["customer_id", "lead_id", "type", "direction", "content", "occurred_at"]),
  );
  if (!parsed.success) return { ok: false, error: "Revisá los datos.", fieldErrors: fieldErrors(parsed.error) };
  const { occurred_at, ...rest } = parsed.data;
  const when = pyLocalToIso(occurred_at ?? null);
  if (when && new Date(when).getTime() > Date.now() + 5 * 60_000) {
    return { ok: false, error: "La fecha de la interacción no puede estar en el futuro." };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("interactions").insert({
    ...rest,
    direction: rest.type === "nota" ? "interna" : rest.direction,
    occurred_at: when ?? new Date().toISOString(),
    organization_id: ctx.org.id,
  });
  if (error) return { ok: false, error: friendlyDbError(error) };

  // Un cliente "nuevo" con el que ya hubo contacto pasa a "activo"
  if (rest.type !== "nota") {
    await supabase
      .from("customers")
      .update({ status: "activo" })
      .eq("id", rest.customer_id)
      .eq("organization_id", ctx.org.id)
      .eq("status", "nuevo");
  }
  revalidatePath(`/clientes/${rest.customer_id}`);
  revalidatePath("/dashboard");
  return { ok: true, message: rest.type === "nota" ? "Nota guardada." : "Interacción registrada." };
}

export async function deleteInteraction(id: string, customerId: string): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Registro inválido." };
  const ctx = await getOrgContext();
  const supabase = await createClient();
  const { data, error } = await supabase.from("interactions").delete().eq("id", id).eq("organization_id", ctx.org.id).select("id");
  if (error) return { ok: false, error: friendlyDbError(error) };
  if (!data?.length) return { ok: false, error: "Solo podés borrar tus propios registros." };
  revalidatePath(`/clientes/${customerId}`);
  return { ok: true };
}
