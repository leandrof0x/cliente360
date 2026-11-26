import Link from "next/link";
import { Building2, CircleDollarSign, Clock, Inbox, Search, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { SUBSCRIPTION_STATUS_LABELS } from "@/lib/constants";
import { formatGs, formatNumber } from "@/lib/utils";
import type { SubscriptionStatus } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { KpiCard } from "@/components/dashboard/kpi-card";

interface Stats {
  organizations: number;
  suspended: number;
  trialing: number;
  trial_expired: number;
  active: number;
  past_due: number;
  trials_ending_7d: number;
  renewals_due_7d: number;
  mrr_gs: number;
  paid_last_30d_gs: number;
  users: number;
  pending_plan_requests: number;
  by_plan: { plan: string; count: number }[];
}

interface OrgRow {
  id: string;
  name: string;
  created_at: string;
  status: "active" | "suspended";
  owner_email: string | null;
  plan_name: string | null;
  sub_status: SubscriptionStatus | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
  members: number;
  customers: number;
  leads: number;
  last_activity: string | null;
  pending_request: string | null;
}

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("es-PY", { day: "2-digit", month: "short", year: "2-digit", timeZone: "America/Asuncion" }) : "—");

function statusBadge(o: OrgRow) {
  if (o.status === "suspended") return <Badge tone="danger">Suspendida</Badge>;
  if (!o.sub_status) return <Badge tone="neutral">Sin suscripción</Badge>;
  const expired =
    (o.sub_status === "trialing" && o.trial_ends_at && new Date(o.trial_ends_at) < new Date()) ||
    (o.sub_status === "active" && o.current_period_end && new Date(o.current_period_end) < new Date());
  if (expired) return <Badge tone="warning">{o.sub_status === "trialing" ? "Prueba vencida" : "Vencida"}</Badge>;
  return <Badge tone={o.sub_status === "active" ? "success" : o.sub_status === "trialing" ? "brand" : "warning"}>{SUBSCRIPTION_STATUS_LABELS[o.sub_status]}</Badge>;
}

export default async function AdminHome({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const search = (q ?? "").trim().slice(0, 80);
  const supabase = await createClient();
  const [{ data: stats, error }, { data: orgs }] = await Promise.all([
    supabase.rpc("platform_stats"),
    supabase.rpc("platform_organizations", { p_search: search || null }),
  ]);
  if (error || !stats) return <Alert tone="error">No se pudieron cargar las estadísticas.</Alert>;
  const s = stats as Stats;
  const rows = (orgs ?? []) as OrgRow[];

  return (
    <>
      <PageHeader title="Resumen de la plataforma" description="Cuentas, suscripciones e ingresos. No se muestra información de los clientes de cada empresa." />
      <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <KpiCard label="Empresas" value={formatNumber(s.organizations)} hint={`${formatNumber(s.users)} usuarios · ${formatNumber(s.suspended)} suspendidas`} icon={Building2} />
        <KpiCard label="Suscripciones activas" value={formatNumber(s.active)} hint={`${formatNumber(s.past_due)} con pago atrasado`} icon={Users} tone="success" />
        <KpiCard label="En prueba" value={formatNumber(s.trialing)} hint={`${formatNumber(s.trials_ending_7d)} terminan en 7 días · ${formatNumber(s.trial_expired)} vencidas`} icon={Clock} tone="warning" />
        <KpiCard label="Ingreso mensual recurrente" value={formatGs(s.mrr_gs)} hint={`Cobrado últimos 30 días: ${formatGs(s.paid_last_30d_gs)}`} icon={CircleDollarSign} tone="success" />
      </section>

      {s.pending_plan_requests > 0 && (
        <Alert tone="info" className="mt-6" title={`${s.pending_plan_requests} solicitud(es) de cambio de plan pendientes`}>
          <span className="inline-flex items-center gap-1"><Inbox className="h-4 w-4" /> Están marcadas en la tabla de empresas.</span>
        </Alert>
      )}

      <Card className="mt-6">
        <CardHeader
          title="Empresas"
          description={`${rows.length} resultado${rows.length === 1 ? "" : "s"}${s.by_plan.length ? ` · ${s.by_plan.map((b) => `${b.plan}: ${b.count}`).join(" · ")}` : ""}`}
          action={
            <form className="relative" role="search">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <Input name="q" defaultValue={search} placeholder="Buscar por nombre o correo" className="h-9 w-56 pl-9" aria-label="Buscar empresas" />
            </form>
          }
        />
        <CardBody className="overflow-x-auto px-0 pt-2">
          {rows.length === 0 ? (
            <p className="px-5 py-6 text-sm text-slate-500">{search ? "Sin resultados." : "Todavía no hay empresas registradas."}</p>
          ) : (
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500">
                  <th className="px-5 py-2 font-medium">Empresa</th>
                  <th className="px-2 py-2 font-medium">Plan</th>
                  <th className="px-2 py-2 font-medium">Estado</th>
                  <th className="px-2 py-2 font-medium">Vence</th>
                  <th className="px-2 py-2 text-right font-medium">Usuarios</th>
                  <th className="px-2 py-2 text-right font-medium">Clientes</th>
                  <th className="px-2 py-2 font-medium">Última actividad</th>
                  <th className="px-5 py-2 font-medium">Alta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((o) => (
                  <tr key={o.id} className="hover:bg-slate-50">
                    <td className="px-5 py-2.5">
                      <Link href={`/admin/empresas/${o.id}`} className="font-medium text-slate-900 hover:text-brand-700">{o.name}</Link>
                      <p className="text-xs text-slate-500">{o.owner_email ?? "sin propietario"}</p>
                    </td>
                    <td className="px-2 py-2.5">
                      {o.plan_name ?? "—"}
                      {o.pending_request && <Badge tone="brand" className="ml-1">pide {o.pending_request}</Badge>}
                    </td>
                    <td className="px-2 py-2.5">{statusBadge(o)}</td>
                    <td className="px-2 py-2.5 text-slate-600">{fmt(o.sub_status === "trialing" ? o.trial_ends_at : o.current_period_end)}</td>
                    <td className="tabular px-2 py-2.5 text-right">{formatNumber(o.members)}</td>
                    <td className="tabular px-2 py-2.5 text-right">{formatNumber(o.customers)}</td>
                    <td className="px-2 py-2.5 text-slate-600">{fmt(o.last_activity)}</td>
                    <td className="px-5 py-2.5 text-slate-600">{fmt(o.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>
    </>
  );
}
