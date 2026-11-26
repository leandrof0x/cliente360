import type { Metadata } from "next";
import Link from "next/link";
import { AlarmClock, CalendarCheck, CheckCircle2, ListTodo, UserX, CalendarDays } from "lucide-react";
import { getOrgContext } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { getMemberOptions } from "@/lib/members";
import { getCustomerOptions } from "@/lib/customers";
import { todayInPy, addDays } from "@/lib/date-range";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { WhatsAppLink } from "@/components/ui/whatsapp-link";
import { TaskFormDialog } from "@/components/tasks/task-form";
import { TaskItem, type TaskRow } from "@/components/tasks/task-item";

export const metadata: Metadata = { title: "Seguimientos" };

type View = "vencidas" | "hoy" | "proximas" | "sin-fecha" | "completadas" | "sin-contacto";
const VIEWS: { id: View; label: string; icon: React.ElementType }[] = [
  { id: "vencidas", label: "Vencidas", icon: AlarmClock },
  { id: "hoy", label: "Hoy", icon: CalendarCheck },
  { id: "proximas", label: "Próximas", icon: CalendarDays },
  { id: "sin-fecha", label: "Sin fecha", icon: ListTodo },
  { id: "completadas", label: "Completadas", icon: CheckCircle2 },
  { id: "sin-contacto", label: "Sin contacto", icon: UserX },
];
const NO_CONTACT_OPTIONS = [3, 7, 15, 30];

function pyMidnight(dateStr: string) {
  return new Date(`${dateStr}T00:00:00-03:00`).toISOString();
}

export default async function FollowUpsPage({ searchParams }: { searchParams: Promise<{ vista?: string; responsable?: string; dias?: string }> }) {
  const sp = await searchParams;
  const ctx = await getOrgContext();
  const supabase = await createClient();
  const view: View = (VIEWS.some((v) => v.id === sp.vista) ? sp.vista : "vencidas") as View;
  const onlyMine = sp.responsable === "yo";
  const days = NO_CONTACT_OPTIONS.includes(Number(sp.dias)) ? Number(sp.dias) : 7;
  const now = new Date().toISOString();
  const today = todayInPy();
  const startTomorrow = pyMidnight(addDays(today, 1));

  const [members, customers] = await Promise.all([getMemberOptions(ctx.org.id), getCustomerOptions(ctx.org.id)]);
  const memberName = new Map(members.map((m) => [m.id, m.name]));

  const base = () => {
    let q = supabase.from("tasks").select("id", { count: "exact", head: true }).eq("organization_id", ctx.org.id).eq("status", "pendiente");
    if (onlyMine) q = q.eq("assigned_to", ctx.user.id);
    return q;
  };
  const [cOver, cToday, cNext, cNone] = await Promise.all([
    base().lt("due_at", now),
    base().gte("due_at", now).lt("due_at", startTomorrow),
    base().gte("due_at", startTomorrow),
    base().is("due_at", null),
  ]);
  const counts: Partial<Record<View, number>> = { vencidas: cOver.count ?? 0, hoy: cToday.count ?? 0, proximas: cNext.count ?? 0, "sin-fecha": cNone.count ?? 0 };

  let tasks: TaskRow[] = [];
  let noContact: { id: string; full_name: string; whatsapp: string | null; phone: string | null; last_contact_at: string | null; created_at: string; open_leads: number }[] = [];

  if (view === "sin-contacto") {
    const cutoff = new Date(Date.now() - days * 86400000).toISOString();
    let q = supabase
      .from("customer_overview")
      .select("id, full_name, whatsapp, phone, last_contact_at, created_at, open_leads")
      .eq("organization_id", ctx.org.id)
      .neq("status", "inactivo")
      .or(`last_contact_at.lt."${cutoff}",and(last_contact_at.is.null,created_at.lt."${cutoff}")`)
      .order("open_leads", { ascending: false })
      .order("last_contact_at", { ascending: true, nullsFirst: true })
      .limit(100);
    if (onlyMine) q = q.eq("assigned_to", ctx.user.id);
    noContact = (await q).data ?? [];
  } else {
    let q = supabase
      .from("tasks")
      .select("id, title, description, type, priority, status, due_at, completed_at, assigned_to, customers(id, full_name)")
      .eq("organization_id", ctx.org.id);
    if (onlyMine) q = q.eq("assigned_to", ctx.user.id);
    if (view === "completadas") q = q.eq("status", "completada").order("completed_at", { ascending: false }).limit(50);
    else {
      q = q.eq("status", "pendiente");
      if (view === "vencidas") q = q.lt("due_at", now).order("due_at", { ascending: true });
      if (view === "hoy") q = q.gte("due_at", now).lt("due_at", startTomorrow).order("due_at", { ascending: true });
      if (view === "proximas") q = q.gte("due_at", startTomorrow).order("due_at", { ascending: true }).limit(100);
      if (view === "sin-fecha") q = q.is("due_at", null).order("created_at", { ascending: false });
    }
    const { data } = await q;
    tasks = ((data ?? []) as unknown as (TaskRow & { assigned_to: string | null; customers: { id: string; full_name: string } | null })[]).map((t) => ({
      ...t,
      customer: t.customers,
      assignee_name: t.assigned_to ? (memberName.get(t.assigned_to) ?? null) : null,
    }));
  }

  const href = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { vista: view, responsable: onlyMine ? "yo" : undefined, dias: view === "sin-contacto" ? String(days) : undefined, ...patch };
    Object.entries(merged).forEach(([k, v]) => v && p.set(k, v));
    return `/seguimientos?${p.toString()}`;
  };

  return (
    <>
      <PageHeader
        title="Seguimientos y tareas"
        description="Lo que tenés que hacer para no perder ninguna venta."
        actions={
          <>
            <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 text-sm shadow-sm">
              <Link href={href({ responsable: undefined })} className={`rounded-md px-3 py-1.5 ${!onlyMine ? "bg-slate-900 text-white" : "text-slate-600"}`}>Todas</Link>
              <Link href={href({ responsable: "yo" })} className={`rounded-md px-3 py-1.5 ${onlyMine ? "bg-slate-900 text-white" : "text-slate-600"}`}>Mías</Link>
            </div>
            {ctx.writable && <TaskFormDialog members={members} customers={customers} defaults={{ assigned_to: ctx.user.id }} />}
          </>
        }
      />

      <nav className="-mx-4 mb-4 overflow-x-auto px-4 sm:mx-0 sm:px-0" aria-label="Vistas">
        <ul className="flex min-w-max gap-1 border-b border-slate-200">
          {VIEWS.map((v) => {
            const active = v.id === view;
            const count = counts[v.id];
            return (
              <li key={v.id}>
                <Link
                  href={href({ vista: v.id, dias: v.id === "sin-contacto" ? String(days) : undefined })}
                  aria-current={active ? "page" : undefined}
                  className={cn("-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium", active ? "border-brand-600 text-brand-700" : "border-transparent text-slate-500 hover:text-slate-800")}
                >
                  <v.icon className="h-4 w-4" aria-hidden />
                  {v.label}
                  {count !== undefined && count > 0 && (
                    <Badge tone={v.id === "vencidas" ? "danger" : v.id === "hoy" ? "warning" : "neutral"}>{count}</Badge>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {view === "sin-contacto" ? (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-slate-600">
            Clientes sin contacto hace más de
            {NO_CONTACT_OPTIONS.map((d) => (
              <Link key={d} href={href({ dias: String(d) })} className={cn("rounded-full border px-3 py-1 text-xs font-medium", d === days ? "border-brand-600 bg-brand-600 text-white" : "border-slate-200 bg-white hover:border-slate-300")}>
                {d} días
              </Link>
            ))}
          </div>
          <Card>
            {noContact.length === 0 ? (
              <EmptyState icon={UserX} title="Todos tus clientes tuvieron contacto reciente" />
            ) : (
              <ul className="divide-y divide-slate-100">
                {noContact.map((c) => {
                  const ref = c.last_contact_at ?? c.created_at;
                  const d = Math.floor((Date.now() - new Date(ref).getTime()) / 86400000);
                  return (
                    <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                      <Link href={`/clientes/${c.id}`} className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900">{c.full_name}</p>
                        <p className="text-xs text-slate-500">
                          {c.last_contact_at ? `Último contacto hace ${d} días` : `Registrado hace ${d} días, nunca contactado`}
                          {c.open_leads > 0 && <span className="font-medium text-amber-700"> · {c.open_leads} oportunidad{c.open_leads > 1 ? "es" : ""} abierta{c.open_leads > 1 ? "s" : ""}</span>}
                        </p>
                      </Link>
                      <WhatsAppLink number={c.whatsapp ?? c.phone} label="WhatsApp" className="rounded-lg px-2 py-1 hover:bg-success-50" />
                      {ctx.writable && (
                        <TaskFormDialog
                          label="Programar"
                          title={`Seguimiento para ${c.full_name}`}
                          members={members}
                          defaults={{ customer_id: c.id, assigned_to: ctx.user.id, title: `Contactar a ${c.full_name}`, type: "seguimiento" }}
                          buttonProps={{ size: "sm", variant: "secondary" }}
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </>
      ) : (
        <Card>
          {tasks.length === 0 ? (
            <EmptyState
              icon={view === "completadas" ? CheckCircle2 : CalendarCheck}
              title={
                view === "vencidas" ? "No tenés tareas vencidas" : view === "hoy" ? "Nada más para hoy" : view === "completadas" ? "Todavía no completaste tareas" : "No hay tareas en esta vista"
              }
              description={view === "vencidas" ? "¡Vas al día con tus seguimientos!" : undefined}
            />
          ) : (
            <ul className="divide-y divide-slate-100">{tasks.map((t) => <TaskItem key={t.id} task={t} readOnly={!ctx.writable} />)}</ul>
          )}
        </Card>
      )}
    </>
  );
}
