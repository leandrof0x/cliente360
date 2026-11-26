import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/server-env";
import { normalizePhone } from "@/lib/phone";

const graph = (path: string) => `https://graph.facebook.com/${serverEnv.whatsappGraphVersion}/${path}`;

/** Verifica la firma X-Hub-Signature-256 que Meta agrega a cada webhook. */
export function verifyMetaSignature(rawBody: string, header: string | null): boolean {
  if (!header || !serverEnv.whatsappAppSecret) return false;
  const expected = "sha256=" + createHmac("sha256", serverEnv.whatsappAppSecret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(header);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Comprueba con la API de Meta que el número y el token son válidos. */
export async function verifyWhatsAppCredentials(phoneNumberId: string, accessToken: string) {
  const res = await fetch(graph(`${encodeURIComponent(phoneNumberId)}?fields=display_phone_number,verified_name`), {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const body = (await res.json().catch(() => ({}))) as { display_phone_number?: string; verified_name?: string; error?: { message?: string } };
  if (!res.ok) return { ok: false as const, error: body.error?.message ?? `Meta respondió ${res.status}` };
  return { ok: true as const, displayPhone: body.display_phone_number ?? null, verifiedName: body.verified_name ?? null };
}

/**
 * Envía un mensaje de texto por la API oficial. Se niega a enviar si el canal
 * de la empresa no está conectado Y autorizado por un propietario/administrador.
 * Nota: fuera de la ventana de 24 h Meta exige plantillas aprobadas.
 */
export async function sendWhatsAppText(organizationId: string, to: string, text: string) {
  const admin = createAdminClient();
  const { data: conn } = await admin
    .from("channel_connections")
    .select("id, status, authorized_at, public_config")
    .eq("organization_id", organizationId)
    .eq("channel", "whatsapp")
    .eq("provider", "whatsapp_cloud_api")
    .maybeSingle();
  if (!conn || conn.status !== "conectado" || !conn.authorized_at) {
    return { ok: false as const, error: "El canal de WhatsApp no está conectado o no fue autorizado para envíos." };
  }
  const { data: secret } = await admin.from("channel_secrets").select("secrets").eq("connection_id", conn.id).maybeSingle();
  const token = (secret?.secrets as { access_token?: string } | null)?.access_token;
  const phoneNumberId = (conn.public_config as { phone_number_id?: string }).phone_number_id;
  const toDigits = normalizePhone(to);
  if (!token || !phoneNumberId || !toDigits) return { ok: false as const, error: "Configuración o destinatario inválido." };

  const res = await fetch(graph(`${encodeURIComponent(phoneNumberId)}/messages`), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to: toDigits, type: "text", text: { body: text.slice(0, 4096) } }),
  });
  const body = (await res.json().catch(() => ({}))) as { messages?: { id: string }[]; error?: { message?: string } };
  if (!res.ok) return { ok: false as const, error: body.error?.message ?? `Meta respondió ${res.status}` };
  return { ok: true as const, messageId: body.messages?.[0]?.id ?? null };
}

interface InboundMessage {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body: string };
}

/**
 * Procesa los mensajes entrantes del webhook: asocia cada mensaje a un cliente
 * (por número normalizado) o crea el cliente y una "Nueva consulta" si no existe.
 */
export async function handleInboundWhatsApp(payload: unknown) {
  const admin = createAdminClient();
  const entries = (payload as { entry?: { changes?: { value?: { metadata?: { phone_number_id?: string }; contacts?: { profile?: { name?: string }; wa_id?: string }[]; messages?: InboundMessage[] } }[] }[] }).entry ?? [];
  let processed = 0;

  for (const entry of entries) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      const phoneNumberId = value?.metadata?.phone_number_id;
      if (!phoneNumberId || !value?.messages?.length) continue;

      const { data: conn } = await admin
        .from("channel_connections")
        .select("organization_id, status")
        .eq("channel", "whatsapp")
        .eq("provider", "whatsapp_cloud_api")
        .contains("public_config", { phone_number_id: phoneNumberId })
        .maybeSingle();
      if (!conn || conn.status !== "conectado") continue;
      const orgId = conn.organization_id as string;
      // Cuentas suspendidas o vencidas no registran datos nuevos
      const { data: writable } = await admin.rpc("org_is_writable", { org: orgId });
      if (!writable) continue;

      for (const msg of value.messages) {
        const norm = normalizePhone(msg.from);
        if (!norm) continue;
        const profileName = value.contacts?.find((c) => c.wa_id === msg.from)?.profile?.name;
        const content = msg.type === "text" && msg.text?.body ? msg.text.body : `[Mensaje de tipo ${msg.type}]`;

        let { data: customer } = await admin
          .from("customers")
          .select("id")
          .eq("organization_id", orgId)
          .eq("phone_normalized", norm)
          .maybeSingle();

        if (!customer) {
          const { data: created, error } = await admin
            .from("customers")
            .insert({ organization_id: orgId, full_name: profileName?.slice(0, 160) || `+${norm}`, whatsapp: `+${norm}`, source: "WhatsApp" })
            .select("id")
            .single();
          if (error || !created) continue; // p. ej. límite del plan alcanzado
          customer = created;
          await admin.from("leads").insert({
            organization_id: orgId,
            customer_id: created.id,
            title: content.slice(0, 120) || "Consulta por WhatsApp",
            status: "nueva",
          });
        }

        await admin.from("interactions").upsert(
          {
            organization_id: orgId,
            customer_id: customer.id,
            type: "whatsapp",
            direction: "entrante",
            content: content.slice(0, 5000),
            occurred_at: new Date(Number(msg.timestamp) * 1000 || Date.now()).toISOString(),
            channel_message_id: msg.id,
          },
          { onConflict: "organization_id,channel_message_id", ignoreDuplicates: true },
        );
        processed++;
      }
    }
  }
  return processed;
}
