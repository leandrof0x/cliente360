"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext, canManage } from "@/lib/session";
import { friendlyDbError } from "@/lib/utils";
import type { ActionResult } from "@/lib/types";

export async function requestPlanChange(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!canManage(ctx.role)) return { ok: false, error: "Solo propietarios y administradores pueden cambiar el plan." };
  const parsed = z
    .object({ plan: z.string().regex(/^[a-z0-9_-]{2,40}$/), message: z.string().trim().max(1000).optional() })
    .safeParse({ plan: formData.get("plan"), message: formData.get("message") ?? undefined });
  if (!parsed.success) return { ok: false, error: "Solicitud inválida." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("request_plan_change", { p_org: ctx.org.id, p_plan: parsed.data.plan, p_message: parsed.data.message ?? null });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath("/suscripcion");
  return { ok: true, message: "Solicitud enviada. El equipo de CLIENTE360 la confirma al recibir el pago." };
}

export async function cancelPlanRequest(id: string): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!canManage(ctx.role)) return { ok: false, error: "Sin permisos." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cancel_plan_request", { p_id: id });
  if (error || !data) return { ok: false, error: friendlyDbError(error) };
  revalidatePath("/suscripcion");
  return { ok: true };
}
