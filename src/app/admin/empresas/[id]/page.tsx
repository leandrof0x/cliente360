import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ROLE_LABELS } from "@/lib/constants";
import { formatGs, formatNumber } from "@/lib/utils";
import type { OrgRole, SubscriptionStatus } from "@/lib/types";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { OrgStatusControl, PaymentForm, RequestActions, SubscriptionForm } from "@/components/admin/forms";

const fmt = (iso: string | null | undefined) =>
  iso ? new Date(iso.length === 10 ? `${iso}T12:00:00-03:00` : iso).toLocaleDateString("es-PY", { day: "2-digit", month: "short", year: "numeric", timeZone: "America/Asuncion" }) : "—";

export default async function AdminOrgPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const supabase = await createClient();
  const { data: org } = await supabase.from("organizations").select("id, name, phone, email, status, suspended_reason, created_at").eq("id", id).maybeSingle();
  if (!org) notFound();
  const [{ data: sub }, { data: plans }, { data: payments }, { data: requests }, { data: members }, { data: summary }] = await Promise.all([
    supabase.from("subscriptions").select("plan_id, status, trial_ends_at, current_period_start, current_period_end, price_gs, notes").eq("organization_id", id).maybeSingle(),
    supabase.from("plans").select("id, name, price_gs").order("sort_order"),
    supabase.from("payments").select("id, amount_gs, method, provider_ref, period_start, period_end, paid_at, notes").eq("organization_id", id).order("created_at", { ascending: false }).limit(50),
    supabase.from("plan_change_requests").select("id, requested_plan, current_plan, status, message, created_at, resolved_at").eq("organization_id", id).order("created_at", { ascending: false }).limit(10),
    supabase.from("organization_members").select("user_id, role, created_at").eq("organization_id", id),
    supabase.rpc("platform_organizations", { p_search: org.name }),
  ]);
  const ids = (members ?? []).map((m) => m.user_id);
  const { data: profiles } = ids.length ? await supabase.from("profiles").select("id, full_name, email").in("id", ids) : { data: [] };
  const profile = new Map((profiles ?? []).map((p) => [p.id, p]));
  const agg = ((summary ?? []) as { id: string; customers: number; leads: number; last_activity: string | null }[]).find((r) => r.id === id);
  const planName = new Map((plans ?? []).map((p) => [p.id, p.name as string]));
  const pending = (requests ?? []).find((r) => r.status === "pendiente");

  return (
    <>
      <Link href="/admin" className="text-sm text-slate-500 hover:text-slate-800">← Empresas</Link>
      <div className="mb-6 mt-1 flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{org.name}</h1>
        {org.status === "suspended" ? <Badge tone="danger">Suspendida</Badge> : <Badge tone="success">Activa</Badge>}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {pending && (
            <Card className="border-brand-300">
              <CardHeader title={`Solicitud de cambio a ${planName.get(pending.requested_plan) ?? pending.requested_plan}`} description={`Enviada el ${fmt(pending.created_at)} · plan actual ${planName.get(pending.current_plan ?? "") ?? "—"}`} />
              <CardBody className="space-y-3 pt-3">
                {pending.message && <p className="whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-sm text-slate-700">{pending.message}</p>}
                <p className="text-xs text-slate-500">Aprobar cambia el plan y su precio. Para activar el período, registrá el pago cuando lo recibas.</p>
                <RequestActions id={pending.id} orgId={id} />
              </CardBody>
            </Card>
          )}
          <Card>
            <CardHeader title="Suscripción" description={sub ? `Período actual: ${fmt(sub.current_period_start)} al ${fmt(sub.current_period_end)}` : "Sin suscripción"} />
            <CardBody className="pt-3">
              <SubscriptionForm orgId={id} plans={(plans ?? []) as { id: string; name: string; price_gs: number }[]} sub={sub as { plan_id: string; status: SubscriptionStatus; trial_ends_at: string | null; current_period_end: string | null; price_gs: number | null; notes: string | null } | null} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Registrar pago recibido" />
            <CardBody className="pt-3">
              <PaymentForm orgId={id} suggested={sub?.price_gs ?? null} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Pagos" />
            <CardBody className="overflow-x-auto pt-2">
              {(payments ?? []).length === 0 ? (
                <p className="text-sm text-slate-500">Sin pagos registrados.</p>
              ) : (
                <table className="w-full min-w-[520px] text-sm">
                  <thead><tr className="text-left text-xs text-slate-500"><th className="py-2 font-medium">Fecha</th><th className="py-2 font-medium">Período</th><th className="py-2 font-medium">Medio</th><th className="py-2 text-right font-medium">Monto</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {(payments ?? []).map((p) => (
                      <tr key={p.id}>
                        <td className="py-2">{fmt(p.paid_at)}</td>
                        <td className="py-2 text-slate-600">{fmt(p.period_start)} al {fmt(p.period_end)}</td>
                        <td className="py-2 text-slate-600">{p.method}{p.provider_ref ? ` · ${p.provider_ref}` : ""}</td>
                        <td className="tabular py-2 text-right font-medium">{formatGs(p.amount_gs)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Cuenta" />
            <CardBody className="space-y-2 pt-3 text-sm">
              <p className="flex justify-between"><span className="text-slate-500">Alta</span><span>{fmt(org.created_at)}</span></p>
              <p className="flex justify-between"><span className="text-slate-500">Teléfono</span><span>{org.phone ?? "—"}</span></p>
              <p className="flex justify-between"><span className="text-slate-500">Correo</span><span className="truncate">{org.email ?? "—"}</span></p>
              <p className="flex justify-between"><span className="text-slate-500">Clientes</span><span className="tabular">{formatNumber(agg?.customers ?? 0)}</span></p>
              <p className="flex justify-between"><span className="text-slate-500">Oportunidades</span><span className="tabular">{formatNumber(agg?.leads ?? 0)}</span></p>
              <p className="flex justify-between"><span className="text-slate-500">Última actividad</span><span>{fmt(agg?.last_activity)}</span></p>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Equipo" />
            <CardBody className="pt-2">
              <ul className="divide-y divide-slate-100">
                {(members ?? []).map((m) => {
                  const p = profile.get(m.user_id);
                  return (
                    <li key={m.user_id} className="flex items-center justify-between gap-2 py-2 text-sm">
                      <span className="min-w-0"><span className="block truncate text-slate-900">{p?.full_name ?? p?.email ?? "Usuario"}</span><span className="block truncate text-xs text-slate-500">{p?.email}</span></span>
                      <Badge tone={m.role === "owner" ? "brand" : "neutral"}>{ROLE_LABELS[m.role as OrgRole]}</Badge>
                    </li>
                  );
                })}
              </ul>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Estado de la cuenta" />
            <CardBody className="pt-3">
              <OrgStatusControl orgId={id} status={org.status as "active" | "suspended"} reason={org.suspended_reason} />
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
