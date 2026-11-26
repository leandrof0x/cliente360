"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext, canManage } from "@/lib/session";
import { ORG_COOKIE } from "@/lib/constants";
import { fieldErrors, organizationSchema, organizationUpdateSchema } from "@/lib/validation";
import { friendlyDbError } from "@/lib/utils";
import type { ActionResult } from "@/lib/types";

const cookieOpts = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 };

export async function createOrganization(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = organizationSchema.safeParse({ name: formData.get("name"), phone: formData.get("phone") ?? "" });
  if (!parsed.success) return { ok: false, error: "Revisá los datos.", fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_organization", {
    p_name: parsed.data.name,
    p_phone: parsed.data.phone || null,
  });
  if (error || !data) return { ok: false, error: friendlyDbError(error) };

  (await cookies()).set(ORG_COOKIE, data as string, cookieOpts);
  redirect("/dashboard");
}

export async function switchOrganization(formData: FormData) {
  const orgId = String(formData.get("organizationId") ?? "");
  const ctx = await getOrgContext();
  // Solo se puede cambiar a una empresa de la que el usuario es miembro
  if (ctx.memberships.some((m) => m.organization_id === orgId)) {
    (await cookies()).set(ORG_COOKIE, orgId, cookieOpts);
  }
  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function updateOrganization(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!canManage(ctx.role)) return { ok: false, error: "Solo propietarios y administradores pueden editar la empresa." };

  const parsed = organizationUpdateSchema.safeParse({
    name: formData.get("name"),
    phone: formData.get("phone") ?? "",
    email: formData.get("email") ?? "",
  });
  if (!parsed.success) return { ok: false, error: "Revisá los datos.", fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase
    .from("organizations")
    .update({ name: parsed.data.name, phone: parsed.data.phone || null, email: parsed.data.email || null })
    .eq("id", ctx.org.id);
  if (error) return { ok: false, error: friendlyDbError(error) };

  revalidatePath("/", "layout");
  return { ok: true, message: "Datos de la empresa actualizados." };
}

export async function updateProfile(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const ctx = await getOrgContext();
  const fullName = String(formData.get("fullName") ?? "").trim();
  if (fullName.length < 2 || fullName.length > 120) return { ok: false, error: "Ingresá un nombre válido." };
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ full_name: fullName }).eq("id", ctx.user.id);
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath("/", "layout");
  return { ok: true, message: "Perfil actualizado." };
}
