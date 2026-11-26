import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CalendarCheck, CircleDollarSign, Download, FileSpreadsheet, Inbox, Percent, Repeat, TrendingDown, UserPlus, Users } from "lucide-react";
import { getOrgContext, canManage } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { resolveRange } from "@/lib/date-range";
import { formatGs, formatNumber } from "@/lib/utils";
import { EXPORT_KINDS, loadReport } from "@/lib/reports";
import type { DashboardData } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { DateRangeFilter } from "@/components/dashboard/date-range-filter";
import { SalesChart } from "@/components/dashboard/charts";

export const metadata: Metadata = { title: "Reportes" };

const pct = (v: number | null) => (v === null ? "—" : `${v.toLocaleString("es-PY", { maximumFractionDigits: 1 })}%`);

function Bar({ value, max, tone = "brand" }: { value: number; max: number; tone?: "brand" | "success" | "danger" }) {
  const w = max > 0 ? Math.max((value / max) * 100, value > 0 ? 2 : 0) : 0;
  const color = { brand: "bg-brand-600", success: "bg-success-600", danger: "bg-red-500" }[tone];
  return (
    <div className="h-1.5 w-full rounded-full bg-slate-100" aria-hidden>
      <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${w}%` }} />
    </div>
  );
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ rango?: string; desde?: string; hasta?: string }> }) {
  const ctx = await getOrgContext();
  if (!canManage(ctx.role)) redirect("/dashboard");
  const sp = await searchParams;
  const range = resolveRange(sp);
  const supabase = await createClient();

  const [{ data: allowsReports }, { data: allowsExports }] = await Promise.all([
    supabase.rpc("org_has_feature", { org: ctx.org.id, feature: "reports" }),
    supabase.rpc("org_has_feature", { org: ctx.org.id, feature: "exports" }),
  ]);

  const header = (
    <PageHeader
      title="Reportes"
      description="Resultados comerciales del período con datos reales de tu negocio."
      actions={allowsReports ? <DateRangeFilter value={range.key} desde={range.desde} hasta={range.hasta} /> : undefined}
    />
  );

  if (!allowsReports) {
    return (
      <>
        {header}
        <Alert tone="info" title="Tu plan no incluye reportes" className="max-w-2xl">
          Los reportes comerciales y la exportación a Excel están disponibles en los planes Profesional y Negocio. Tu plan actual: {ctx.plan?.name ?? "sin plan"}.
        </Alert>
      </>
    );
  }

  const [{ data: report, error }, { data: dash }] = await Promise.all([
    loadReport(supabase, ctx.org.id, range.from, range.to),
    supabase.rpc("dashboard_data", { p_org: ctx.org.id, p_from: range.from.toISOString(), p_to: range.to.toISOString() }),
  ]);

  if (!report) {
    return (
      <>
        {header}
        <Alert tone="error">No se pudo cargar el reporte. {error}</Alert>
      </>
    );
  }

  const s = report.summary;
  const rangeQs = new URLSearchParams({ rango: range.key, desde: range.desde, hasta: range.hasta }).toString();
  const maxSellerValue = Math.max(0, ...report.sellers.map((x) => x.won_value));
  const maxSource = Math.max(0, ...report.sources.map((x) => x.won_value));
  const maxReason = Math.max(0, ...report.lost_reasons.map((x) => x.count));
  const followTotal = s.tasks_done + s.tasks_pending;
  const hasActivity = s.inquiries + s.won_count + s.lost_count + s.new_customers + followTotal > 0;

  return (
    <>
      {header}

      <section aria-label="Indicadores" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <KpiCard label="Clientes nuevos" value={formatNumber(s.new_customers)} icon={UserPlus} />
        <KpiCard label="Clientes recurrentes" value={formatNumber(s.recurring_customers)} hint={`de ${formatNumber(s.buying_customers)} que compraron`} icon={Repeat} tone="success" />
        <KpiCard label="Consultas recibidas" value={formatNumber(s.inquiries)} hint={`${formatNumber(s.inbound_messages)} mensajes entrantes registrados`} icon={Inbox} />
        <KpiCard label="Ventas ganadas" value={formatGs(s.won_value)} hint={`${formatNumber(s.won_count)} ventas · ticket ${s.avg_ticket === null ? "—" : formatGs(s.avg_ticket)}`} icon={CircleDollarSign} tone="success" />
        <KpiCard label="Oportunidades perdidas" value={formatNumber(s.lost_count)} hint={formatGs(s.lost_value)} icon={TrendingDown} tone="danger" />
        <KpiCard label="Tasa de cierre" value={pct(s.close_rate)} hint="Ganadas sobre cerradas en el período" icon={Percent} />
        <KpiCard label="Conversión de consultas" value={pct(s.inquiry_conversion)} hint="Consultas del período ya ganadas" icon={Percent} />
        <KpiCard
          label="Seguimientos"
          value={`${formatNumber(s.tasks_done)} / ${formatNumber(followTotal)}`}
          hint={`${formatNumber(s.tasks_done_on_time)} a tiempo · ${formatNumber(s.tasks_overdue)} vencidos`}
          icon={CalendarCheck}
          tone={s.tasks_overdue > 0 ? "warning" : "brand"}
        />
      </section>

      {!hasActivity && (
        <div className="mt-6">
          <EmptyState icon={FileSpreadsheet} title="Sin movimiento en este período" description="Cuando registres clientes, oportunidades y seguimientos, vas a ver aquí los resultados." />
        </div>
      )}

      <section className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Ventas en el tiempo" description="Monto de ventas ganadas por período." />
          <CardBody>{dash ? <SalesChart data={dash as DashboardData} /> : <p className="text-sm text-slate-500">Sin datos.</p>}</CardBody>
        </Card>
        <Card>
          <CardHeader title="Rendimiento por vendedor" description="Ventas, pérdidas y seguimientos del período." />
          <CardBody className="overflow-x-auto px-0 pt-2">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="text-left text-xs text-slate-500">
                  <th className="px-5 py-2 font-medium">Vendedor</th>
                  <th className="px-2 py-2 text-right font-medium">Consultas</th>
                  <th className="px-2 py-2 text-right font-medium">Ganadas</th>
                  <th className="px-2 py-2 text-right font-medium">Perdidas</th>
                  <th className="px-2 py-2 text-right font-medium">Seguim.</th>
                  <th className="px-5 py-2 text-right font-medium">Vendido</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {report.sellers.map((x) => (
                  <tr key={x.user_id ?? "none"}>
                    <td className="px-5 py-2.5">
                      <p className="font-medium text-slate-900">{x.name}</p>
                      <div className="mt-1 w-32"><Bar value={x.won_value} max={maxSellerValue} tone="success" /></div>
                    </td>
                    <td className="tabular px-2 py-2.5 text-right">{formatNumber(x.leads_received)}</td>
                    <td className="tabular px-2 py-2.5 text-right">{formatNumber(x.won_count)}</td>
                    <td className="tabular px-2 py-2.5 text-right">{formatNumber(x.lost_count)}</td>
                    <td className="tabular px-2 py-2.5 text-right" title={`${x.tasks_done} realizados, ${x.tasks_pending} pendientes, ${x.tasks_overdue} vencidos`}>
                      {formatNumber(x.tasks_done)}/{formatNumber(x.tasks_done + x.tasks_pending)}
                      {x.tasks_overdue > 0 && <span className="ml-1 text-xs text-red-600">({x.tasks_overdue} venc.)</span>}
                    </td>
                    <td className="tabular px-5 py-2.5 text-right font-medium text-slate-900">{formatGs(x.won_value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Fuentes de clientes" description="De dónde llegan los clientes nuevos y las ventas." />
          <CardBody className="pt-2">
            {report.sources.length === 0 ? (
              <p className="text-sm text-slate-500">Sin clientes ni ventas en el período.</p>
            ) : (
              <ul className="space-y-3">
                {report.sources.map((x) => (
                  <li key={x.source}>
                    <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                      <span className="truncate text-slate-700">{x.source}</span>
                      <span className="tabular shrink-0 text-xs text-slate-500">
                        {formatNumber(x.new_customers)} nuevos · {formatNumber(x.won_count)} ventas · <span className="font-medium text-slate-900">{formatGs(x.won_value)}</span>
                      </span>
                    </div>
                    <Bar value={x.won_value} max={maxSource} />
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Motivos de pérdida" description="Por qué se perdieron oportunidades en el período." />
          <CardBody className="pt-2">
            {report.lost_reasons.length === 0 ? (
              <p className="text-sm text-slate-500">No se perdieron oportunidades en el período.</p>
            ) : (
              <ul className="space-y-3">
                {report.lost_reasons.map((x) => (
                  <li key={x.reason}>
                    <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                      <span className="truncate text-slate-700">{x.reason}</span>
                      <span className="tabular shrink-0 text-xs text-slate-500">
                        <span className="font-medium text-slate-900">{formatNumber(x.count)}</span> · {formatGs(x.value)}
                      </span>
                    </div>
                    <Bar value={x.count} max={maxReason} tone="danger" />
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </section>

      <Card className="mt-6">
        <CardHeader title="Exportar" description="Descargá tus datos para trabajarlos en Excel o compartirlos con tu contador." />
        <CardBody className="pt-3">
          {!allowsExports ? (
            <Alert tone="info">Tu plan no incluye exportaciones.</Alert>
          ) : (
            <ul className="divide-y divide-slate-100">
              {[{ id: "reporte", label: "Este reporte", usesRange: true }, ...EXPORT_KINDS].map((k) => (
                <li key={k.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{k.label}</p>
                    <p className="text-xs text-slate-500">{k.usesRange ? `Del ${range.desde.split("-").reverse().join("/")} al ${range.hasta.split("-").reverse().join("/")}` : "Todos los registros"}</p>
                  </div>
                  <div className="flex gap-2">
                    {(["xlsx", "csv"] as const).map((f) => (
                      <a
                        key={f}
                        href={`/api/exportar?tipo=${k.id}&formato=${f}&${rangeQs}`}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                      >
                        <Download className="h-4 w-4" aria-hidden /> {f === "xlsx" ? "Excel" : "CSV"}
                      </a>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
      <p className="mt-4 flex items-center gap-1.5 text-xs text-slate-400"><Users className="h-3.5 w-3.5" aria-hidden /> Solo propietarios y administradores ven los reportes.</p>
    </>
  );
}
