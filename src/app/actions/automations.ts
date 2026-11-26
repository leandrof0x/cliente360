"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext, canManage } from "@/lib/session";
import { friendlyDbError } from "@/lib/utils";
import type { ActionResult } from "@/lib/types";

const STATUSES = ["nueva", "contactado", "interesado", "seguimiento", "negociacion", "ganado", "perdido"] as const;

const schema = z
  .object({
    name: z.string().trim().min(1, "Poné un nombre").max(120),
    trigger_type: z.enum(["lead_created", "lead_status_changed", "no_contact_days"]),
    trigger_status: z.enum(STATUSES).optional(),
    trigger_days: z.coerce.number().int().min(1).max(365).optional(),
    only_open_leads: z.string().optional(),
    action_type: z.enum(["create_task", "webhook_n8n", "send_whatsapp"]),
    task_title: z.string().trim().max(200).optional(),
    task_due_hours: z.coerce.number().min(0).max(24 * 60).optional(),
    task_priority: z.enum(["baja", "media", "alta"]).optional(),
    webhook_url: z.string().trim().max(500).optional(),
    message: z.string().trim().max(1000).optional(),
    is_active: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.trigger_type === "lead_status_changed" && !v.trigger_status) ctx.addIssue({ code: "custom", path: ["trigger_status"], message: "Elegí el estado" });
    if (v.trigger_type === "no_contact_days" && !v.trigger_days) ctx.addIssue({ code: "custom", path: ["trigger_days"], message: "Indicá los días" });
    if (v.action_type === "create_task" && !v.task_title) ctx.addIssue({ code: "custom", path: ["task_title"], message: "Escribí el título de la tarea" });
    if (v.action_type === "webhook_n8n" && !/^https:\/\/[^\s]+$/.test(v.webhook_url ?? "")) ctx.addIssue({ code: "custom", path: ["webhook_url"], message: "La URL debe empezar con https://" });
    if (v.action_type === "send_whatsapp" && !v.message) ctx.addIssue({ code: "custom", path: ["message"], message: "Escribí el mensaje" });
  });

export async function saveAutomation(id: string | null, _: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!canManage(ctx.role)) return { ok: false, error: "Solo propietarios y administradores gestionan automatizaciones." };
  if (!ctx.writable) return { ok: false, error: "Tu cuenta está en modo solo lectura." };
  const raw = Object.fromEntries([...formData.entries()].filter(([, v]) => typeof v === "string" && v !== "")) as Record<string, string>;
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const fe = z.flattenError(parsed.error).fieldErrors as Record<string, string[] | undefined>;
    return { ok: false, error: "Revisá los campos.", fieldErrors: fe };
  }
  const v = parsed.data;
  const row = {
    name: v.name,
    trigger_type: v.trigger_type,
    trigger_config:
      v.trigger_type === "lead_status_changed"
        ? { status: v.trigger_status }
        : v.trigger_type === "no_contact_days"
          ? { days: v.trigger_days, only_open_leads: v.only_open_leads === "on" }
          : {},
    action_type: v.action_type,
    action_config:
      v.action_type === "create_task"
        ? { title: v.task_title, due_in_hours: v.task_due_hours ?? 24, priority: v.task_priority ?? "media" }
        : v.action_type === "webhook_n8n"
          ? { url: v.webhook_url }
          : { message: v.message },
    is_active: v.is_active === "on",
  };
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("automations").update(row).eq("id", id).eq("organization_id", ctx.org.id)
    : await supabase.from("automations").insert({ ...row, organization_id: ctx.org.id });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath("/automatizaciones");
  return { ok: true, message: "Automatización guardada." };
}

export async function toggleAutomation(id: string, active: boolean): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Inválida." };
  const ctx = await getOrgContext();
  if (!canManage(ctx.role)) return { ok: false, error: "Sin permiso." };
  const supabase = await createClient();
  const { error } = await supabase.from("automations").update({ is_active: active }).eq("id", id).eq("organization_id", ctx.org.id);
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath("/automatizaciones");
  return { ok: true };
}

export async function deleteAutomation(id: string): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Inválida." };
  const ctx = await getOrgContext();
  if (!canManage(ctx.role)) return { ok: false, error: "Sin permiso." };
  const supabase = await createClient();
  const { error } = await supabase.from("automations").delete().eq("id", id).eq("organization_id", ctx.org.id);
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath("/automatizaciones");
  return { ok: true };
}

/** Ejecuta ahora las automatizaciones programadas (clientes sin contacto) de la empresa. */
export async function runScheduledNow(): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!canManage(ctx.role)) return { ok: false, error: "Sin permiso." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("run_scheduled_automations", { p_org: ctx.org.id });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath("/automatizaciones");
  revalidatePath("/seguimientos");
  return { ok: true, message: data ? `Se crearon ${data} tareas.` : "No había clientes que cumplieran la condición." };
}
