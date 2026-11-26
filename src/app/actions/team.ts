"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext, canManage } from "@/lib/session";
import { siteUrl } from "@/lib/site-url";
import { ORG_COOKIE } from "@/lib/constants";
import { friendlyDbError } from "@/lib/utils";
import type { ActionResult, OrgRole } from "@/lib/types";

const roleSchema = z.enum(["admin", "seller", "collaborator"]);

export async function inviteMember(_: ActionResult<{ link: string }> | null, formData: FormData): Promise<ActionResult<{ link: string }>> {
  const ctx = await getOrgContext();
  if (!canManage(ctx.role)) return { ok: false, error: "Solo propietarios y administradores invitan al equipo." };
  if (!ctx.writable) return { ok: false, error: "Tu cuenta está en modo solo lectura." };
  const parsed = z
    .object({ email: z.email("Ingresá un correo válido").max(200), role: roleSchema })
    .safeParse({ email: String(formData.get("email") ?? "").trim().toLowerCase(), role: formData.get("role") });
  if (!parsed.success) {
    return { ok: false, error: "Revisá los datos.", fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]> };
  }
  if (parsed.data.email === ctx.user.email?.toLowerCase()) return { ok: false, error: "Ya sos parte del equipo." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organization_invitations")
    .insert({ organization_id: ctx.org.id, email: parsed.data.email, role: parsed.data.role })
    .select("token")
    .single();
  if (error) {
    if (error.code === "23505") return { ok: false, error: "Ya hay una invitación pendiente para ese correo." };
    return { ok: false, error: friendlyDbError(error) };
  }
  revalidatePath("/configuracion");
  return {
    ok: true,
    data: { link: `${await siteUrl()}/invitacion/${data.token}` },
    message: "Invitación creada. Compartí el enlace con la persona: al abrirlo e ingresar con ese correo, se suma al equipo.",
  };
}

export async function revokeInvitation(id: string): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!canManage(ctx.role)) return { ok: false, error: "Sin permisos." };
  const supabase = await createClient();
  const { error } = await supabase.from("organization_invitations").delete().eq("id", id).eq("organization_id", ctx.org.id).is("accepted_at", null);
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath("/configuracion");
  return { ok: true };
}

export async function changeMemberRole(userId: string, role: OrgRole): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!canManage(ctx.role)) return { ok: false, error: "Sin permisos." };
  if (!z.uuid().safeParse(userId).success || !["owner", "admin", "seller", "collaborator"].includes(role)) return { ok: false, error: "Datos inválidos." };
  if (userId === ctx.user.id) return { ok: false, error: "No podés cambiar tu propio rol." };
  if (role === "owner" && ctx.role !== "owner") return { ok: false, error: "Solo un propietario puede nombrar a otro propietario." };
  const supabase = await createClient();
  const { error } = await supabase.from("organization_members").update({ role }).eq("organization_id", ctx.org.id).eq("user_id", userId);
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath("/configuracion");
  return { ok: true, message: "Rol actualizado." };
}

export async function removeMember(userId: string): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!canManage(ctx.role)) return { ok: false, error: "Sin permisos." };
  if (userId === ctx.user.id) return { ok: false, error: "Para salir de la empresa usá “Salir de esta empresa”." };
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("organization_members")
    .delete({ count: "exact" })
    .eq("organization_id", ctx.org.id)
    .eq("user_id", userId);
  if (error) return { ok: false, error: friendlyDbError(error) };
  if (!count) return { ok: false, error: "No se pudo quitar a esa persona." };
  revalidatePath("/configuracion");
  return { ok: true };
}

export async function leaveOrganization(): Promise<ActionResult> {
  const ctx = await getOrgContext();
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("organization_members")
    .delete({ count: "exact" })
    .eq("organization_id", ctx.org.id)
    .eq("user_id", ctx.user.id);
  if (error) return { ok: false, error: friendlyDbError(error) };
  if (!count) return { ok: false, error: "No se pudo salir de la empresa." };
  (await cookies()).delete(ORG_COOKIE);
  redirect("/dashboard");
}

export async function acceptInvitation(token: string): Promise<ActionResult> {
  if (!/^[a-f0-9]{32,80}$/.test(token)) return { ok: false, error: "Enlace de invitación inválido." };
  const supabase = await createClient();
  const { data: orgId, error } = await supabase.rpc("accept_invitation", { p_token: token });
  if (error) return { ok: false, error: friendlyDbError(error) };
  (await cookies()).set(ORG_COOKIE, String(orgId), { path: "/", httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 365 });
  redirect("/dashboard");
}
