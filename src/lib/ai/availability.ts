import "server-only";
import { canManage, type OrgContext } from "@/lib/session";
import { getAIStatus } from "./index";

export interface AIAvailabilityInfo {
  ready: boolean;
  reason?: string;
  planIncludes: boolean;
  configured: boolean;
  missing: string[];
}

/** Indica si CLIENTE AI puede usarse y, si no, por qué (sin simular respuestas). */
export function aiAvailability(ctx: OrgContext): AIAvailabilityInfo {
  const status = getAIStatus();
  const feature = ctx.plan?.features?.ai;
  const planIncludes = Boolean(feature && feature !== "false" && (ctx.plan?.ai_monthly_requests ?? 0) > 0);
  let reason: string | undefined;
  if (!planIncludes) reason = `Tu plan ${ctx.plan?.name ?? "actual"} no incluye CLIENTE AI. Está disponible en los planes Profesional y Negocio.`;
  else if (!status.configured)
    reason = canManage(ctx.role)
      ? `CLIENTE AI está listo para activarse: falta configurar ${status.missing.join(", ")} en el servidor (ver docs/ETAPA-4.md).`
      : "CLIENTE AI todavía no está activado. Pedile al administrador de la cuenta que lo configure.";
  else if (!ctx.writable) reason = "Tu cuenta está en modo solo lectura: regularizá la suscripción para usar CLIENTE AI.";
  return { ready: !reason, reason, planIncludes, configured: status.configured, missing: status.missing };
}
