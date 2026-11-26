"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/session";
import { formFields, pyLocalToIso, taskSchema } from "@/lib/crm";
import { fieldErrors } from "@/lib/validation";
import { friendlyDbError } from "@/lib/utils";
import type { ActionResult } from "@/lib/types";

function revalidateTasks(customerId?: string | null, leadId?: string | null) {
  revalidatePath("/seguimientos");
  revalidatePath("/dashboard");
  if (customerId) revalidatePath(`/clientes/${customerId}`);
  if (leadId) revalidatePath(`/pipeline/${leadId}`);
}

export async function saveTask(taskId: string | null, _: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx.writable) return { ok: false, error: "Tu cuenta está en modo solo lectura." };
  const parsed = taskSchema.safeParse(
    formFields(formData, ["title", "description", "type", "priority", "due_at", "customer_id", "lead_id", "assigned_to"]),
  );
  if (!parsed.success) return { ok: false, error: "Revisá los campos marcados.", fieldErrors: fieldErrors(parsed.error) };
  const dueAt = pyLocalToIso(parsed.data.due_at);
  if (parsed.data.due_at && !dueAt) return { ok: false, error: "Fecha y hora inválidas.", fieldErrors: { due_at: ["Fecha inválida"] } };

  const row = { ...parsed.data, due_at: dueAt };
  const supabase = await createClient();
  const { error } = taskId
    ? await supabase.from("tasks").update(row).eq("id", taskId).eq("organization_id", ctx.org.id)
    : await supabase.from("tasks").insert({ ...row, organization_id: ctx.org.id });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidateTasks(row.customer_id, row.lead_id);
  return { ok: true, message: taskId ? "Tarea actualizada." : "Tarea creada." };
}

async function setStatus(taskId: string, status: "completada" | "pendiente" | "cancelada"): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(taskId).success) return { ok: false, error: "Tarea inválida." };
  const ctx = await getOrgContext();
  if (!ctx.writable) return { ok: false, error: "Tu cuenta está en modo solo lectura." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .update({ status })
    .eq("id", taskId)
    .eq("organization_id", ctx.org.id)
    .select("id, customer_id, lead_id");
  if (error) return { ok: false, error: friendlyDbError(error) };
  if (!data?.length) return { ok: false, error: "No se encontró la tarea o no tenés permiso." };
  revalidateTasks(data[0].customer_id, data[0].lead_id);
  return { ok: true };
}

export async function completeTask(taskId: string) {
  return setStatus(taskId, "completada");
}
export async function reopenTask(taskId: string) {
  return setStatus(taskId, "pendiente");
}

export async function deleteTask(taskId: string): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(taskId).success) return { ok: false, error: "Tarea inválida." };
  const ctx = await getOrgContext();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .delete()
    .eq("id", taskId)
    .eq("organization_id", ctx.org.id)
    .select("id, customer_id, lead_id");
  if (error) return { ok: false, error: friendlyDbError(error) };
  if (!data?.length) return { ok: false, error: "Solo podés eliminar tareas que creaste (o ser administrador)." };
  revalidateTasks(data[0].customer_id, data[0].lead_id);
  return { ok: true };
}
