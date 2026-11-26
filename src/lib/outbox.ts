import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendWhatsAppText } from "@/lib/whatsapp";
import { renderTemplate } from "@/lib/templates";

const MAX_ATTEMPTS = 5;

/**
 * Entrega los eventos encolados por las automatizaciones:
 *  - webhook_n8n: POST JSON a la URL configurada por la empresa.
 *  - send_whatsapp: solo si el canal está conectado y autorizado (se verifica de nuevo aquí).
 */
export async function processOutbox(opts: { organizationId?: string; limit?: number } = {}) {
  const admin = createAdminClient();
  let q = admin
    .from("automation_outbox")
    .select("id, organization_id, action_type, payload, attempts")
    .eq("status", "pending")
    .lt("attempts", MAX_ATTEMPTS)
    .order("created_at")
    .limit(opts.limit ?? 50);
  if (opts.organizationId) q = q.eq("organization_id", opts.organizationId);
  const { data: items } = await q;
  let sent = 0;

  for (const item of items ?? []) {
    const payload = item.payload as { config?: Record<string, string>; data?: Record<string, string> } & Record<string, unknown>;
    let ok = false;
    let error: string | null = null;
    let skipped = false;
    try {
      if (item.action_type === "webhook_n8n") {
        const url = payload.config?.url;
        if (!url || !url.startsWith("https://")) throw new Error("URL inválida");
        const { config, ...body } = payload;
        void config;
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "User-Agent": "CLIENTE360-Automations/1.0" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(10_000),
        });
        ok = res.ok;
        if (!ok) error = `HTTP ${res.status}`;
      } else if (item.action_type === "send_whatsapp") {
        const to = payload.data?.customer_phone;
        const text = renderTemplate(payload.config?.message ?? "", {
          nombre: payload.data?.customer_name,
          primer_nombre: payload.data?.customer_name?.split(" ")[0],
        });
        if (!to || !text) {
          skipped = true;
          error = "Sin número o mensaje";
        } else {
          const r = await sendWhatsAppText(item.organization_id, to, text);
          ok = r.ok;
          if (!r.ok) {
            error = r.error;
            skipped = r.error.includes("no está conectado");
          }
          if (r.ok && payload.data?.customer_id) {
            await admin.from("interactions").insert({
              organization_id: item.organization_id,
              customer_id: payload.data.customer_id,
              lead_id: payload.data.lead_id ?? null,
              type: "whatsapp",
              direction: "saliente",
              content: `[Automático] ${text}`.slice(0, 5000),
              channel_message_id: r.messageId,
            });
          }
        }
      } else {
        skipped = true;
        error = "Acción desconocida";
      }
    } catch (e) {
      error = e instanceof Error ? e.message : "Error";
    }

    const attempts = item.attempts + 1;
    await admin
      .from("automation_outbox")
      .update({
        status: ok ? "sent" : skipped ? "skipped" : attempts >= MAX_ATTEMPTS ? "error" : "pending",
        attempts,
        last_error: error,
        processed_at: new Date().toISOString(),
      })
      .eq("id", item.id);
    if (ok) sent++;
  }
  return { processed: items?.length ?? 0, sent };
}
