import type { Metadata } from "next";
import Link from "next/link";
import {
  AlarmClock,
  Briefcase,
  CircleDollarSign,
  Inbox,
  MessageCircleWarning,
  Percent,
  TrendingUp,
  UserPlus,
  Users,
  UserX,
  Activity,
  ListChecks,
} from "lucide-react";
import { getOrgContext } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { resolveRange } from "@/lib/date-range";
import { formatGs, formatNumber } from "@/lib/utils";
import { TASK_TYPE_LABELS } from "@/lib/constants";
import type { DashboardData, TaskPriority, TaskType } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { DateRangeFilter } from "@/components/dashboard/date-range-filter";
import { CustomersChart, DistributionChart, FunnelChart, SalesChart } from "@/components/dashboard/charts";
import { CompleteTaskButton } from "@/components/dashboard/complete-task-button";
import { ActivityFeed, type ActivityRow } from "@/components/dashboard/activity-feed";

export const metadata: Metadata = { title: "Dashboard" };

interface UrgentTask {
  id: string;
  title: string;
  type: TaskType;
  priority: TaskPriority;
  due_at: string;
  customers: { id: string; full_name: string } | null;
}

function endOfTodayPy() {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Asuncion" }).format(new Date());
  return new Date(`${today}T23:59:59.999-03:00`).toISOString();
}

function formatDue(iso: string) {
  const d = new Date(iso);
  const overdue = d.getTime() < Date.now();
  const sameDay =
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Asuncion" }).format(d) ===
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Asuncion" }).format(new Date());
  const time = d.toLocaleTimeString("es-PY", { hour: "2-digit", minute: "2-digit", timeZone: "America/Asuncion" });
  const date = d.toLocaleDateString("es-PY", { day: "2-digit", month: "short", timeZone: "America/Asuncion" });
  return { overdue, label: sameDay ? `Hoy ${time}` : `${date} ${time}` };
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ rango?: string; desde?: string; hasta?: string }>;
}) {
  const ctx = await getOrgContext();
  const range = resolveRange(await searchParams);
  const supabase = await createClient();

  const [dash, urgent, unanswered, activity] = await Promise.all([
    supabase.rpc("dashboard_data", {
      p_org: ctx.org.id,
      p_from: range.from.toISOString(),
      p_to: range.to.toISOString(),
    }),
    supabase
      .from("tasks")
      .select("id, title, type, priority, due_at, customers(id, full_name)")
      .eq("organization_id", ctx.org.id)
      .eq("status", "pendiente")
      .not("due_at", "is", null)
      .lte("due_at", endOfTodayPy())
      .order("due_at", { ascending: true })
      .limit(8),
    supabase
      .from("leads")
      .select("id, title, created_at, customers(full_name)")
      .eq("organization_id", ctx.org.id)
      .eq("status", "nueva")
      .order("created_at", { ascending: true })
      .limit(5),
    supabase
      .from("activity_logs")
      .select("id, actor_id, entity_type, action, summary, metadata, created_at")
      .eq("organization_id", ctx.org.id)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  if (dash.error || !dash.data) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <Alert tone="error" title="No pudimos cargar los indicadores">
          Intentá recargar la página. Si el problema continúa, verificá la conexión con la base de datos.
        </Alert>
      </>
    );
  }

  const data = dash.data as DashboardData;
  const k = data.kpis;
  const urgentTasks = (urgent.data ?? []) as unknown as UrgentTask[];
  const unansweredLeads = (unanswered.data ?? []) as unknown as {
    id: string;
    title: string;
    created_at: string;
    customers: { full_name: string } | null;
  }[];

  // Nombres de quienes generaron la actividad (perfiles visibles por RLS)
  const actorIds = [...new Set((activity.data ?? []).map((a) => a.actor_id).filter(Boolean))] as string[];
  const { data: actors } = actorIds.length
    ? await supabase.from("profiles").select("id, full_name, email").in("id", actorIds)
    : { data: [] as { id: string; full_name: string | null; email: string | null }[] };
  const actorName = new Map((actors ?? []).map((p) => [p.id, p.full_name ?? p.email]));
  const activityRows: ActivityRow[] = (activity.data ?? []).map((a) => ({
    ...a,
    metadata: (a.metadata ?? {}) as Record<string, string>,
    actor_name: a.actor_id ? (actorName.get(a.actor_id) ?? null) : null,
  }));

  // Los seguimientos de oportunidades ya generan tareas automáticas: no se cuentan dos veces.
  const urgentCount = k.overdue_tasks + k.today_tasks + k.unanswered_leads;
  const isEmpty = k.total_customers === 0 && k.open_leads === 0 && k.pending_tasks === 0;
  const firstName = ctx.user.fullName?.split(" ")[0];

  return (
    <>
      <PageHeader
        title={firstName ? `Hola, ${firstName}` : "Dashboard"}
        description={`Resumen comercial de ${ctx.org.name}`}
        actions={<DateRangeFilter value={range.key} desde={range.desde} hasta={range.hasta} />}
      />

      {isEmpty && (
        <Alert tone="info" title="Tu panel está listo" className="mb-6">
          Los indicadores se calculan con los clientes, oportunidades y tareas que registres. Todavía no hay datos
          cargados en {ctx.org.name}.{" "}
          {ctx.writable && (
            <Link href="/clientes/nuevo" className="font-semibold underline">
              Registrá tu primer cliente
            </Link>
          )}
        </Alert>
      )}

      {/* Prioridades del día: lo urgente primero */}
      <section aria-labelledby="urgente" className="mb-6">
        <Card className={urgentCount > 0 ? "border-amber-200 ring-1 ring-amber-100" : undefined}>
          <CardHeader
            title="Para atender hoy"
            description={
              urgentCount > 0
                ? "Tareas vencidas o de hoy y consultas que todavía no respondiste."
                : "No tenés pendientes urgentes. ¡Buen trabajo!"
            }
            action={
              <div className="flex flex-wrap items-center justify-end gap-1.5">
                {k.overdue_tasks > 0 && <Badge tone="danger">{k.overdue_tasks} vencidas</Badge>}
                {k.today_tasks > 0 && <Badge tone="warning">{k.today_tasks} para hoy</Badge>}
                {k.unanswered_leads > 0 && <Badge tone="brand">{k.unanswered_leads} sin responder</Badge>}
                <Link href="/seguimientos" className="ml-1 text-sm font-medium text-brand-700 hover:underline">
                  Ver todo
                </Link>
              </div>
            }
          />
          <h2 id="urgente" className="sr-only">
            Para atender hoy
          </h2>
          {urgentCount > 0 && (
            <CardBody className="grid gap-6 lg:grid-cols-2">
              <div>
                <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <ListChecks className="h-3.5 w-3.5" aria-hidden /> Tareas y seguimientos
                </p>
                {urgentTasks.length === 0 ? (
                  <p className="text-sm text-slate-500">Sin tareas vencidas ni para hoy.</p>
                ) : (
                  <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">
                    {urgentTasks.map((t) => {
                      const due = formatDue(t.due_at);
                      return (
                        <li key={t.id} className="flex items-center gap-3 px-3 py-2.5">
                          <span className={`h-2 w-2 shrink-0 rounded-full ${due.overdue ? "bg-red-500" : "bg-amber-400"}`} aria-hidden />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-slate-900">{t.title}</p>
                            <p className="truncate text-xs text-slate-500">
                              {TASK_TYPE_LABELS[t.type]}
                              {t.customers && (
                                <>
                                  {" · "}
                                  <Link href={`/clientes/${t.customers.id}`} className="text-brand-700 hover:underline">
                                    {t.customers.full_name}
                                  </Link>
                                </>
                              )}{" "}
                              ·{" "}
                              <span className={due.overdue ? "font-medium text-red-600" : ""}>
                                {due.overdue ? "Vencida · " : ""}
                                {due.label}
                              </span>
                            </p>
                          </div>
                          {t.priority === "alta" && <Badge tone="danger">Alta</Badge>}
                          <CompleteTaskButton taskId={t.id} disabled={!ctx.writable} />
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
              <div>
                <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <MessageCircleWarning className="h-3.5 w-3.5" aria-hidden /> Consultas sin responder
                </p>
                {unansweredLeads.length === 0 ? (
                  <p className="text-sm text-slate-500">Todas las consultas fueron contactadas.</p>
                ) : (
                  <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">
                    {unansweredLeads.map((l) => {
                      const hours = Math.floor((Date.now() - new Date(l.created_at).getTime()) / 3600000);
                      return (
                        <li key={l.id} className="flex items-center gap-3 px-3 py-2.5">
                          <Link href={`/pipeline/${l.id}`} className="min-w-0 flex-1 hover:text-brand-700">
                            <p className="truncate text-sm font-medium text-slate-900">{l.customers?.full_name ?? "Cliente"}</p>
                            <p className="truncate text-xs text-slate-500">{l.title}</p>
                          </Link>
                          <span className={`text-xs font-medium ${hours >= 24 ? "text-red-600" : "text-slate-500"}`}>
                            {hours < 1 ? "hace minutos" : hours < 48 ? `hace ${hours} h` : `hace ${Math.floor(hours / 24)} días`}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </CardBody>
          )}
        </Card>
      </section>

      {/* Indicadores */}
      <section aria-label="Indicadores" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <KpiCard label="Clientes totales" value={formatNumber(k.total_customers)} icon={Users} />
        <KpiCard label="Clientes nuevos" value={formatNumber(k.new_customers)} hint="En el período" icon={UserPlus} tone="success" />
        <KpiCard label="Consultas recibidas" value={formatNumber(k.leads_received)} hint="En el período" icon={Inbox} />
        <KpiCard label="Oportunidades abiertas" value={formatNumber(k.open_leads)} hint={formatGs(k.open_value)} icon={Briefcase} />
        <KpiCard label="Ventas concretadas" value={formatNumber(k.won_count)} hint={formatGs(k.won_value)} icon={CircleDollarSign} tone="success" />
        <KpiCard
          label="Tasa de conversión"
          value={k.conversion_rate === null ? "—" : `${k.conversion_rate.toLocaleString("es-PY")}%`}
          hint={k.conversion_rate === null ? "Sin consultas en el período" : "Consultas del período ganadas"}
          icon={Percent}
          tone="success"
        />
        <KpiCard
          label="Seguimientos pendientes"
          value={formatNumber(k.pending_tasks)}
          hint={k.overdue_tasks > 0 ? `${k.overdue_tasks} vencidos` : "Ninguno vencido"}
          icon={AlarmClock}
          tone={k.overdue_tasks > 0 ? "danger" : "neutral"}
        />
        <KpiCard
          label="Clientes sin respuesta"
          value={formatNumber(k.no_contact_customers)}
          hint={`Con oportunidad abierta y +${k.no_contact_days} días sin contacto`}
          icon={UserX}
          tone={k.no_contact_customers > 0 ? "warning" : "neutral"}
        />
      </section>

      {/* Gráficos */}
      <section aria-label="Gráficos" className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Evolución de clientes" description="Clientes totales acumulados" />
          <CardBody>
            <CustomersChart data={data} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Ventas por período" description="Valor de las ventas concretadas" />
          <CardBody>
            {k.won_count === 0 ? (
              <EmptyState icon={TrendingUp} title="Sin ventas en este período" description="Cuando marques oportunidades como «Venta concretada» aparecerán acá." />
            ) : (
              <SalesChart data={data} />
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Conversión de oportunidades" description="Consultas del período que llegaron a cada etapa" />
          <CardBody>
            {k.leads_received === 0 ? (
              <EmptyState icon={Percent} title="Sin consultas en este período" />
            ) : (
              <FunnelChart data={data} />
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Oportunidades por estado" description="Consultas del período según su estado actual" />
          <CardBody>
            {k.leads_received === 0 ? (
              <EmptyState icon={Briefcase} title="Sin oportunidades en este período" />
            ) : (
              <DistributionChart data={data} />
            )}
          </CardBody>
        </Card>
      </section>

      <section aria-label="Actividad" className="mt-6">
        <Card>
          <CardHeader title="Actividad comercial reciente" />
          <CardBody>
            {activityRows.length === 0 ? (
              <EmptyState icon={Activity} title="Todavía no hay actividad" />
            ) : (
              <ActivityFeed rows={activityRows} />
            )}
          </CardBody>
        </Card>
      </section>
    </>
  );
}
