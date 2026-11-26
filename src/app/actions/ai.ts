"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext, canManage } from "@/lib/session";
import { ROLE_LABELS } from "@/lib/constants";
import { resolveRange, RANGE_OPTIONS } from "@/lib/date-range";
import { getAIProvider } from "@/lib/ai";
import { AIProviderError, type AIMessage } from "@/lib/ai/types";
import { AI_ACTIONS, AI_ACTION_IDS, buildSystemPrompt, buildUserPrompt, pyDate, type AIActionId } from "@/lib/ai/prompts";
import { customerData, leadData, overviewData, reportData, staleLeadsData } from "@/lib/ai/context";

export type AIResponse =
  | { ok: true; text: string; truncated: boolean; isDraft: boolean; used: number; limit: number }
  | { ok: false; error: string; code?: string };

const inputSchema = z.object({
  action: z.enum(AI_ACTION_IDS as [AIActionId, ...AIActionId[]]),
  customerId: z.uuid().optional(),
  leadId: z.uuid().optional(),
  question: z.string().trim().max(2000).optional(),
  incoming: z.string().trim().max(3000).optional(),
  tone: z.enum(["cercano", "formal"]).optional(),
  range: z.string().max(20).optional(),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(6000) }))
    .max(12)
    .optional(),
});

export type AIInput = z.input<typeof inputSchema>;

const REASONS: Record<string, string> = {
  forbidden: "No tenés acceso a esta empresa.",
  read_only: "Tu cuenta está en modo solo lectura: regularizá la suscripción para usar CLIENTE AI.",
  not_in_plan: "Tu plan no incluye CLIENTE AI. Está disponible en los planes Profesional y Negocio.",
  limit_reached: "Se alcanzó el límite mensual de consultas de CLIENTE AI de tu plan. Se renueva el primer día del mes.",
  invalid_feature: "Acción no válida.",
};

export async function runClienteAI(raw: AIInput): Promise<AIResponse> {
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Solicitud inválida." };
  const input = parsed.data;
  const def = AI_ACTIONS[input.action];

  const ctx = await getOrgContext();
  if (def.managersOnly && !canManage(ctx.role)) {
    return { ok: false, error: "Esta acción está disponible para propietarios y administradores." };
  }
  if (input.action === "chat" && !input.question) return { ok: false, error: "Escribí tu pregunta." };
  if (def.scope === "customer" && !input.customerId) return { ok: false, error: "Falta el cliente." };
  if (def.scope === "lead" && !input.leadId) return { ok: false, error: "Falta la oportunidad." };

  const provider = getAIProvider();
  if (!provider) {
    return {
      ok: false,
      code: "not_configured",
      error: canManage(ctx.role)
        ? "CLIENTE AI todavía no está configurado: falta la clave del proveedor de IA (ANTHROPIC_API_KEY) en el servidor."
        : "CLIENTE AI todavía no está configurado. Pedile al administrador de la cuenta que lo active.",
    };
  }

  const supabase = await createClient();

  // 1. Datos reales con los permisos de quien consulta
  let data: unknown;
  let periodLabel: string | undefined;
  switch (def.scope === "org" ? input.action : def.scope) {
    case "customer":
      data = await customerData(supabase, ctx, input.customerId!);
      break;
    case "lead":
      data = await leadData(supabase, ctx, input.leadId!);
      break;
    case "stale_leads":
      data = await staleLeadsData(supabase, ctx);
      break;
    case "commercial_report":
    case "conversion_tips": {
      const r = resolveRange({ rango: input.range ?? (input.action === "conversion_tips" ? "90d" : "30d") });
      periodLabel = `${RANGE_OPTIONS.find((o) => o.id === r.key)?.label ?? ""} (${pyDate(r.desde)} al ${pyDate(r.hasta)})`;
      data = await reportData(supabase, ctx, r.from, r.to, periodLabel);
      break;
    }
    default:
      data = await overviewData(supabase, ctx);
  }
  if (!data) return { ok: false, error: "No se encontró el registro o no tenés acceso." };

  // 2. Reserva del cupo mensual (atómica, en la base)
  const { data: reservation, error: resErr } = await supabase.rpc("ai_reserve_request", { p_org: ctx.org.id, p_feature: input.action });
  if (resErr) return { ok: false, error: "No se pudo verificar el cupo de CLIENTE AI." };
  const res = reservation as { ok: boolean; reason?: string; id?: number; used?: number; limit?: number };
  if (!res.ok) return { ok: false, code: res.reason, error: REASONS[res.reason ?? ""] ?? "No se pudo usar CLIENTE AI." };

  // 3. Consulta al proveedor
  const system = buildSystemPrompt({
    businessName: ctx.org.name,
    userName: ctx.user.fullName,
    roleLabel: ROLE_LABELS[ctx.role],
    today: pyDate(new Date().toISOString()) ?? "",
  });
  const userPrompt = buildUserPrompt({ action: input.action, data, question: input.question, tone: input.tone, incoming: input.incoming, periodLabel });
  const history: AIMessage[] = input.action === "chat" ? normalizeHistory(input.history ?? []) : [];

  try {
    const result = await provider.generate({
      system,
      messages: [...history, { role: "user", content: userPrompt }],
      maxTokens: def.maxTokens,
      effort: def.effort,
    });
    await supabase.rpc("ai_complete_request", {
      p_id: res.id,
      p_provider: provider.id,
      p_model: result.model,
      p_input_tokens: result.inputTokens,
      p_output_tokens: result.outputTokens,
    });
    return { ok: true, text: result.text, truncated: result.truncated, isDraft: Boolean(def.isDraft), used: res.used ?? 0, limit: res.limit ?? 0 };
  } catch (error) {
    await supabase.rpc("ai_release_request", { p_id: res.id });
    if (error instanceof AIProviderError) return { ok: false, code: error.code, error: error.message };
    console.error("[CLIENTE AI]", error);
    return { ok: false, error: "No se pudo completar la consulta al asistente." };
  }
}

/** La conversación debe alternar y empezar por la persona. */
function normalizeHistory(history: AIMessage[]): AIMessage[] {
  const out: AIMessage[] = [];
  for (const m of history.slice(-8)) {
    if (!m.content.trim()) continue;
    if (out.length === 0 && m.role !== "user") continue;
    if (out.at(-1)?.role === m.role) out[out.length - 1] = m;
    else out.push(m);
  }
  if (out.at(-1)?.role === "user") out.pop();
  return out;
}
