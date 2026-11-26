import type { Metadata } from "next";
import { getOrgContext, canManage } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { aiAvailability } from "@/lib/ai/availability";
import { PageHeader } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/alert";
import { Assistant } from "@/components/ai/assistant";

export const metadata: Metadata = { title: "CLIENTE AI" };
// Las respuestas de IA pueden tardar varios segundos
export const maxDuration = 60;

export default async function AssistantPage() {
  const ctx = await getOrgContext();
  const availability = aiAvailability(ctx);
  const manager = canManage(ctx.role);
  let used = 0;
  let limit = ctx.plan?.ai_monthly_requests ?? 0;
  if (availability.planIncludes) {
    const supabase = await createClient();
    const { data } = await supabase.rpc("ai_quota", { p_org: ctx.org.id });
    const q = data as { used: number; limit: number } | null;
    used = q?.used ?? 0;
    limit = q?.limit ?? limit;
  }

  return (
    <>
      <PageHeader
        title="CLIENTE AI"
        description="Tu asistente comercial: trabaja solo con los datos reales de tu negocio y respeta los permisos de tu usuario."
      />
      {!availability.ready ? (
        <div className="max-w-2xl space-y-4">
          <Alert tone={availability.planIncludes ? "warning" : "info"} title="CLIENTE AI no está disponible todavía">
            {availability.reason}
          </Alert>
          {manager && availability.planIncludes && !availability.configured && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
              <p className="font-medium text-slate-900">Qué hace falta para activarlo</p>
              <ol className="mt-2 list-decimal space-y-1 pl-5">
                <li>Crear una clave de API en console.anthropic.com (Settings → API keys).</li>
                <li>Cargarla en Vercel como variable de entorno <code className="rounded bg-slate-100 px-1">ANTHROPIC_API_KEY</code> (solo servidor).</li>
                <li>Volver a desplegar el proyecto.</li>
              </ol>
              <p className="mt-2 text-xs text-slate-500">La clave nunca se envía al navegador. Cada consulta descuenta del cupo mensual de tu plan ({limit} por mes).</p>
            </div>
          )}
        </div>
      ) : (
        <Assistant isManager={manager} initialUsed={used} limit={limit} />
      )}
    </>
  );
}
