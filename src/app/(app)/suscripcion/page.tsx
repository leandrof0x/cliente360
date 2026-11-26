import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Check, CreditCard, Info } from "lucide-react";
import { getOrgContext, canManage } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { FEATURE_LABELS, SUBSCRIPTION_STATUS_LABELS } from "@/lib/constants";
import { formatGs, formatNumber } from "@/lib/utils";
import type { Plan } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { PlanRequestButton } from "@/components/billing/plan-request";
import { cancelPlanRequest } from "@/app/actions/billing";

export const metadata: Metadata = { title: "Plan y pagos" };

const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso.length === 10 ? `${iso}T12:00:00-03:00` : iso).toLocaleDateString("es-PY", { day: "2-digit", month: "long", year: "numeric", timeZone: "America/Asuncion" }) : "—";

function Meter({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const pct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 0;
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-sm">
        <span className="text-slate-600">{label}</span>
        <span className="tabular text-slate-900">
          {formatNumber(used)} {limit === null ? <span className="text-slate-500">(ilimitado)</span> : `/ ${formatNumber(limit)}`}
        </span>
      </div>
      {limit !== null && (
        <div className="h-1.5 rounded-full bg-slate-100" aria-hidden>
          <div className={`h-1.5 rounded-full ${pct >= 90 ? "bg-red-500" : pct >= 75 ? "bg-amber-500" : "bg-brand-600"}`} style={{ width: `${Math.max(pct, used ? 2 : 0)}%` }} />
        </div>
      )}
    </div>
  );
}

export default async function SubscriptionPage() {
  const ctx = await getOrgContext();
  if (!canManage(ctx.role)) redirect("/configuracion");
  const supabase = await createClient();
  const [{ data: plans }, { count: members }, { count: customers }, { data: quota }, { data: requests }, { data: payments }, { data: settings }] = await Promise.all([
    supabase.from("plans").select("*").eq("is_active", true).order("sort_order"),
    supabase.from("organization_members").select("user_id", { count: "exact", head: true }).eq("organization_id", ctx.org.id),
    supabase.from("customers").select("id", { count: "exact", head: true }).eq("organization_id", ctx.org.id),
    supabase.rpc("ai_quota", { p_org: ctx.org.id }),
    supabase.from("plan_change_requests").select("id, requested_plan, status, created_at, admin_note, resolved_at").eq("organization_id", ctx.org.id).order("created_at", { ascending: false }).limit(5),
    supabase.from("payments").select("id, amount_gs, status, method, period_start, period_end, paid_at, provider_ref").eq("organization_id", ctx.org.id).order("created_at", { ascending: false }).limit(24),
    supabase.from("platform_settings").select("key, value").in("key", ["payment_instructions", "support_contact"]),
  ]);
  const setting = (k: string) => {
    const v = (settings ?? []).find((s) => s.key === k)?.value;
    return typeof v === "string" ? v.trim() : "";
  };
  const instructions = setting("payment_instructions");
  const support = setting("support_contact");
  const sub = ctx.subscription;
  const plan = ctx.plan;
  const planName = new Map(((plans ?? []) as Plan[]).map((p) => [p.id, p.name]));
  const pending = (requests ?? []).find((r) => r.status === "pendiente");
  const lastResolved = (requests ?? []).find((r) => r.status === "aprobada" || r.status === "rechazada");
  const q = quota as { used: number; limit: number } | null;

  return (
    <>
      <PageHeader title="Plan y pagos" description="Tu suscripción, consumo del plan y cambios de plan." />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6">
          <Card>
            <CardHeader title="Tu plan" />
            <CardBody className="space-y-3 pt-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Plan</span>
                <span className="font-semibold text-slate-900">{plan?.name ?? "—"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Estado</span>
                <Badge tone={ctx.writable ? (sub?.status === "active" ? "success" : "brand") : "danger"}>
                  {sub ? SUBSCRIPTION_STATUS_LABELS[sub.status] : "Sin suscripción"}
                  {!ctx.writable && " · solo lectura"}
                </Badge>
              </div>
              {sub?.status === "trialing" && (
                <div className="flex items-center justify-between"><span className="text-slate-500">Prueba hasta</span><span>{fmtDate(sub.trial_ends_at)}</span></div>
              )}
              {sub?.current_period_end && (
                <div className="flex items-center justify-between"><span className="text-slate-500">Pagado hasta</span><span>{fmtDate(sub.current_period_end)}</span></div>
              )}
              {sub?.price_gs != null && sub.status === "active" && (
                <div className="flex items-center justify-between"><span className="text-slate-500">Precio mensual</span><span className="tabular">{formatGs(sub.price_gs)}</span></div>
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Uso del plan" />
            <CardBody className="space-y-4 pt-3">
              <Meter label="Usuarios" used={members ?? 0} limit={plan?.max_users ?? null} />
              <Meter label="Clientes" used={customers ?? 0} limit={plan?.max_customers ?? null} />
              <Meter label="Consultas de CLIENTE AI este mes" used={q?.used ?? 0} limit={q?.limit ?? plan?.ai_monthly_requests ?? 0} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Cómo pagar" />
            <CardBody className="space-y-3 pt-3 text-sm text-slate-700">
              <p className="flex gap-2 text-slate-600"><Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" /> El pago en línea todavía no está habilitado. No se realizan cobros automáticos.</p>
              {instructions ? (
                <div className="whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 p-3">{instructions}</div>
              ) : (
                <p>Al solicitar un plan, el equipo de CLIENTE360 te contacta con los datos para el pago.</p>
              )}
              {support && <p className="text-xs text-slate-500">Contacto: {support}</p>}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6 lg:col-span-2">
          {pending && (
            <Alert tone="info" title={`Solicitud pendiente: plan ${planName.get(pending.requested_plan) ?? pending.requested_plan}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>Enviada el {fmtDate(pending.created_at)}. Se activa al confirmarse el pago.</span>
                <ConfirmButton size="sm" variant="secondary" title="¿Cancelar la solicitud?" description="Podés pedir otro plan después." confirmLabel="Cancelar solicitud" action={cancelPlanRequest.bind(null, pending.id)}>
                  Cancelar solicitud
                </ConfirmButton>
              </div>
            </Alert>
          )}
          {!pending && lastResolved && lastResolved.status === "rechazada" && (
            <Alert tone="warning" title="Tu última solicitud de plan fue rechazada">{lastResolved.admin_note ?? "Comunicate con soporte para más detalles."}</Alert>
          )}
          <div className="grid gap-4 md:grid-cols-3">
            {((plans ?? []) as Plan[]).map((p) => {
              const current = p.id === plan?.id;
              const downgradeBlocked = (members ?? 0) > p.max_users || (p.max_customers !== null && (customers ?? 0) > p.max_customers);
              return (
                <div key={p.id} className={`flex flex-col rounded-2xl border bg-white p-5 shadow-sm ${current ? "border-brand-500 ring-2 ring-brand-100" : "border-slate-200"}`}>
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-slate-900">{p.name}</p>
                    {current && <Badge tone="brand">Actual</Badge>}
                  </div>
                  <p className="tabular mt-2 text-2xl font-semibold text-slate-900">{formatGs(p.price_gs)}<span className="text-sm font-normal text-slate-500"> /mes</span></p>
                  {p.description && <p className="mt-1 text-xs text-slate-500">{p.description}</p>}
                  <ul className="mt-4 flex-1 space-y-1.5 text-sm text-slate-700">
                    <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-success-600" />{p.max_users === 1 ? "1 usuario" : `Hasta ${p.max_users} usuarios`}</li>
                    <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-success-600" />{p.max_customers ? `Hasta ${formatNumber(p.max_customers)} clientes` : "Clientes ilimitados"}</li>
                    {p.ai_monthly_requests > 0 && (
                      <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-success-600" />{formatNumber(p.ai_monthly_requests)} consultas de CLIENTE AI por mes</li>
                    )}
                    {Object.entries(p.features)
                      .filter(([k, v]) => v && v !== "false" && k !== "ai")
                      .map(([k]) => (
                        <li key={k} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-success-600" />{FEATURE_LABELS[k] ?? k}</li>
                      ))}
                  </ul>
                  <div className="mt-5">
                    {current && sub?.status === "active" ? (
                      <p className="text-center text-xs font-medium text-brand-700">Tu plan actual</p>
                    ) : downgradeBlocked ? (
                      <p className="text-center text-xs text-slate-500">Tu uso actual supera los límites de este plan.</p>
                    ) : (
                      <PlanRequestButton planId={p.id} planName={p.name} priceGs={p.price_gs} disabled={Boolean(pending)} />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <Card>
            <CardHeader title="Pagos registrados" description="Pagos confirmados por el equipo de CLIENTE360." />
            <CardBody className="pt-2">
              {(payments ?? []).length === 0 ? (
                <p className="flex items-center gap-2 text-sm text-slate-500"><CreditCard className="h-4 w-4" /> Todavía no hay pagos registrados.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[480px] text-sm">
                    <thead><tr className="text-left text-xs text-slate-500"><th className="py-2 font-medium">Fecha</th><th className="py-2 font-medium">Período</th><th className="py-2 font-medium">Medio</th><th className="py-2 text-right font-medium">Monto</th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {(payments ?? []).map((p) => (
                        <tr key={p.id}>
                          <td className="py-2">{fmtDate(p.paid_at)}</td>
                          <td className="py-2 text-slate-600">{p.period_start && p.period_end ? `${fmtDate(p.period_start)} al ${fmtDate(p.period_end)}` : "—"}</td>
                          <td className="py-2 text-slate-600">{p.method ?? "—"}{p.provider_ref ? ` · ${p.provider_ref}` : ""}</td>
                          <td className="tabular py-2 text-right font-medium">{formatGs(p.amount_gs)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
