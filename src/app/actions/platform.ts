"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requirePlatformAdmin } from "@/lib/platform";
import { friendlyDbError } from "@/lib/utils";
import type { ActionResult } from "@/lib/types";

const SUB_STATUSES = ["trialing", "active", "past_due", "suspended", "canceled"] as const;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Fecha 'YYYY-MM-DD' de la interfaz → fin de ese día en Paraguay. */
const endOfDayPy = (d: string | undefined) => (d && DATE_RE.test(d) ? new Date(`${d}T23:59:59-03:00`).toISOString() : null);
const fe = (e: z.ZodError) => z.flattenError(e).fieldErrors as Record<string, string[] | undefined>;

export async function updateSubscription(orgId: string, _: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requirePlatformAdmin();
  const parsed = z
    .object({
      plan: z.string().regex(/^[a-z0-9_-]{2,40}$/),
      status: z.enum(SUB_STATUSES),
      trial_ends_at: z.string().optional(),
      period_end: z.string().optional(),
      price_gs: z.coerce.number().int().min(0).max(100_000_000).optional(),
      notes: z.string().trim().max(1000).optional(),
    })
    .safeParse(Object.fromEntries([...formData.entries()].filter(([, v]) => v !== "")));
  if (!parsed.success) return { ok: false, error: "Revisá los campos.", fieldErrors: fe(parsed.error) };
  const v = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("platform_update_subscription", {
    p_org: orgId,
    p_plan: v.plan,
    p_status: v.status,
    p_trial_ends_at: endOfDayPy(v.trial_ends_at),
    p_period_end: endOfDayPy(v.period_end),
    p_price_gs: v.price_gs ?? null,
    p_notes: v.notes ?? null,
  });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath(`/admin/empresas/${orgId}`);
  return { ok: true, message: "Suscripción actualizada." };
}

export async function recordPayment(orgId: string, _: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requirePlatformAdmin();
  const parsed = z
    .object({
      amount_gs: z.coerce.number().int().min(1, "Ingresá el monto").max(1_000_000_000),
      months: z.coerce.number().int().min(1).max(24),
      method: z.string().trim().min(2, "Indicá el medio").max(60),
      reference: z.string().trim().max(120).optional(),
      notes: z.string().trim().max(1000).optional(),
    })
    .safeParse(Object.fromEntries([...formData.entries()].filter(([, v]) => v !== "")));
  if (!parsed.success) return { ok: false, error: "Revisá los campos.", fieldErrors: fe(parsed.error) };
  const v = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("platform_record_payment", {
    p_org: orgId,
    p_amount_gs: v.amount_gs,
    p_months: v.months,
    p_method: v.method,
    p_reference: v.reference ?? null,
    p_notes: v.notes ?? null,
  });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath(`/admin/empresas/${orgId}`);
  return { ok: true, message: "Pago registrado: la suscripción quedó activa y se extendió el período." };
}

export async function setOrgStatus(orgId: string, status: "active" | "suspended", reason?: string): Promise<ActionResult> {
  await requirePlatformAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("platform_set_org_status", { p_org: orgId, p_status: status, p_reason: reason ?? null });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath(`/admin/empresas/${orgId}`);
  return { ok: true };
}

export async function suspendOrg(orgId: string, _: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const reason = String(formData.get("reason") ?? "").trim();
  if (reason.length < 3) return { ok: false, error: "Indicá el motivo (lo verá la empresa)." };
  return setOrgStatus(orgId, "suspended", reason.slice(0, 300));
}

export async function resolvePlanRequest(id: string, approve: boolean, orgId: string): Promise<ActionResult> {
  await requirePlatformAdmin();
  const supabase = await createClient();
  const { error } = await supabase.rpc("platform_resolve_plan_request", { p_id: id, p_approve: approve, p_note: null });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath(`/admin/empresas/${orgId}`);
  revalidatePath("/admin");
  return { ok: true };
}

export async function updatePlan(planId: string, _: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requirePlatformAdmin();
  const parsed = z
    .object({
      name: z.string().trim().min(2).max(60),
      description: z.string().trim().max(300).optional(),
      price_gs: z.coerce.number().int().min(0).max(100_000_000),
      max_users: z.coerce.number().int().min(1).max(1000),
      max_customers: z.coerce.number().int().min(1).max(10_000_000).optional(),
      ai_monthly_requests: z.coerce.number().int().min(0).max(100_000),
      is_active: z.string().optional(),
    })
    .safeParse(Object.fromEntries([...formData.entries()].filter(([, v]) => v !== "")));
  if (!parsed.success) return { ok: false, error: "Revisá los campos.", fieldErrors: fe(parsed.error) };
  const v = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase
    .from("plans")
    .update({
      name: v.name,
      description: v.description ?? null,
      price_gs: v.price_gs,
      max_users: v.max_users,
      max_customers: v.max_customers ?? null,
      ai_monthly_requests: v.ai_monthly_requests,
      is_active: v.is_active === "on",
    })
    .eq("id", planId);
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath("/admin/planes");
  return { ok: true, message: "Plan guardado. Las suscripciones existentes conservan su precio pactado." };
}

export async function updatePlatformSettings(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  await requirePlatformAdmin();
  const parsed = z
    .object({
      trial_days: z.coerce.number().int().min(0).max(90),
      trial_plan: z.string().regex(/^[a-z0-9_-]{2,40}$/),
      payment_instructions: z.string().trim().max(2000).default(""),
      support_contact: z.string().trim().max(200).default(""),
    })
    .safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "Revisá los campos.", fieldErrors: fe(parsed.error) };
  const v = parsed.data;
  const supabase = await createClient();
  const { data: plan } = await supabase.from("plans").select("id").eq("id", v.trial_plan).eq("is_active", true).maybeSingle();
  if (!plan) return { ok: false, error: "El plan de prueba debe ser un plan activo." };
  const rows = [
    { key: "trial_days", value: v.trial_days },
    { key: "trial_plan", value: v.trial_plan },
    { key: "payment_instructions", value: v.payment_instructions },
    { key: "support_contact", value: v.support_contact },
  ].map((r) => ({ ...r, updated_at: new Date().toISOString() }));
  const { error } = await supabase.from("platform_settings").upsert(rows, { onConflict: "key" });
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath("/admin/ajustes");
  return { ok: true, message: "Ajustes guardados." };
}
