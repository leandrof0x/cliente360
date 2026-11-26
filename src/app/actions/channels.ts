"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getOrgContext, canManage } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isServiceRoleConfigured } from "@/lib/server-env";
import { verifyWhatsAppCredentials } from "@/lib/whatsapp";
import { friendlyDbError } from "@/lib/utils";
import type { ActionResult } from "@/lib/types";

const connectSchema = z.object({
  phone_number_id: z.string().trim().regex(/^\d{6,30}$/, "El Phone number ID son solo números"),
  business_account_id: z.string().trim().regex(/^\d{0,30}$/, "Solo números").optional(),
  access_token: z.string().trim().min(20, "Token inválido").max(1000),
});

/** Conecta la API oficial de WhatsApp: verifica las credenciales con Meta antes de guardarlas. */
export async function connectWhatsApp(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!canManage(ctx.role)) return { ok: false, error: "Solo propietarios y administradores pueden conectar canales." };
  if (!ctx.writable) return { ok: false, error: "Tu cuenta está en modo solo lectura." };
  if (!isServiceRoleConfigured()) return { ok: false, error: "Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor." };

  const parsed = connectSchema.safeParse({
    phone_number_id: formData.get("phone_number_id"),
    business_account_id: formData.get("business_account_id") ?? "",
    access_token: formData.get("access_token"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };

  const check = await verifyWhatsAppCredentials(parsed.data.phone_number_id, parsed.data.access_token);
  if (!check.ok) return { ok: false, error: `Meta rechazó las credenciales: ${check.error}` };

  const admin = createAdminClient();
  // Un número solo puede estar conectado a una empresa
  const { data: other } = await admin
    .from("channel_connections")
    .select("organization_id")
    .eq("channel", "whatsapp")
    .contains("public_config", { phone_number_id: parsed.data.phone_number_id })
    .neq("organization_id", ctx.org.id)
    .limit(1);
  if (other?.length) return { ok: false, error: "Ese número ya está conectado a otra cuenta de CLIENTE360." };

  const { data: conn, error } = await admin
    .from("channel_connections")
    .upsert(
      {
        organization_id: ctx.org.id,
        channel: "whatsapp",
        provider: "whatsapp_cloud_api",
        status: "conectado",
        display_name: check.verifiedName ? `${check.verifiedName} (${check.displayPhone})` : check.displayPhone,
        public_config: { phone_number_id: parsed.data.phone_number_id, business_account_id: parsed.data.business_account_id || null },
        authorized_at: null,
        authorized_by: null,
        last_error: null,
      },
      { onConflict: "organization_id,channel,provider" },
    )
    .select("id")
    .single();
  if (error || !conn) return { ok: false, error: friendlyDbError(error) };

  const { error: secErr } = await admin
    .from("channel_secrets")
    .upsert({ connection_id: conn.id, organization_id: ctx.org.id, secrets: { access_token: parsed.data.access_token }, updated_at: new Date().toISOString() });
  if (secErr) return { ok: false, error: "No se pudo guardar el token de forma segura." };

  revalidatePath("/configuracion");
  return { ok: true, message: "WhatsApp conectado. Ya recibís los mensajes entrantes. Los envíos automáticos siguen desactivados hasta que los autorices." };
}

/** Autorizar (o revocar) que las automatizaciones envíen mensajes por WhatsApp. */
export async function setWhatsAppAuthorization(authorize: boolean): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!canManage(ctx.role)) return { ok: false, error: "Solo propietarios y administradores pueden autorizar envíos." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("channel_connections")
    .update({ authorized_at: authorize ? new Date().toISOString() : null, authorized_by: authorize ? ctx.user.id : null })
    .eq("organization_id", ctx.org.id)
    .eq("channel", "whatsapp")
    .eq("status", "conectado")
    .select("id");
  if (error) return { ok: false, error: friendlyDbError(error) };
  if (!data?.length) return { ok: false, error: "Primero conectá el canal de WhatsApp." };
  if (!authorize) {
    // Al revocar, se desactivan las automatizaciones que envían mensajes
    await supabase.from("automations").update({ is_active: false }).eq("organization_id", ctx.org.id).eq("action_type", "send_whatsapp");
  }
  revalidatePath("/configuracion");
  revalidatePath("/automatizaciones");
  return { ok: true };
}

export async function disconnectWhatsApp(): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!canManage(ctx.role)) return { ok: false, error: "Solo propietarios y administradores pueden desconectar canales." };
  if (!isServiceRoleConfigured()) return { ok: false, error: "Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor." };
  const admin = createAdminClient();
  await admin.from("automations").update({ is_active: false }).eq("organization_id", ctx.org.id).eq("action_type", "send_whatsapp");
  const { error } = await admin.from("channel_connections").delete().eq("organization_id", ctx.org.id).eq("channel", "whatsapp");
  if (error) return { ok: false, error: friendlyDbError(error) };
  revalidatePath("/configuracion");
  return { ok: true };
}
