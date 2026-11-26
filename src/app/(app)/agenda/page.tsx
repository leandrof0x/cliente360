import type { Metadata } from "next";
import { getOrgContext } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { getMemberOptions } from "@/lib/members";
import { getCustomerOptions } from "@/lib/customers";
import { todayInPy } from "@/lib/date-range";
import { pyDayStartIso, visibleRange, type CalendarView } from "@/lib/calendar";
import { PageHeader } from "@/components/ui/page-header";
import { Alert } from "@/components/ui/alert";
import { AgendaCalendar, type CalendarEvent } from "@/components/agenda/calendar";

export const metadata: Metadata = { title: "Agenda" };

export default async function AgendaPage({ searchParams }: { searchParams: Promise<{ vista?: string; fecha?: string }> }) {
  const sp = await searchParams;
  const ctx = await getOrgContext();
  const today = todayInPy();
  const view: CalendarView = sp.vista === "dia" || sp.vista === "mes" ? sp.vista : "semana";
  const date = sp.fecha && /^\d{4}-\d{2}-\d{2}$/.test(sp.fecha) && !Number.isNaN(Date.parse(sp.fecha)) ? sp.fecha : today;
  const range = visibleRange(view, date);
  const fromIso = pyDayStartIso(range.from);
  const toIso = pyDayStartIso(range.to);

  const supabase = await createClient();
  const [appts, tasks, members, customers] = await Promise.all([
    supabase
      .from("appointments")
      .select("id, title, type, status, starts_at, ends_at, location, notes, customer_id, assigned_to, customers(full_name)")
      .eq("organization_id", ctx.org.id)
      .lt("starts_at", toIso)
      .gte("ends_at", fromIso)
      .order("starts_at")
      .limit(1000),
    supabase
      .from("tasks")
      .select("id, title, type, status, due_at, customer_id, assigned_to, customers(full_name)")
      .eq("organization_id", ctx.org.id)
      .neq("status", "cancelada")
      .gte("due_at", fromIso)
      .lt("due_at", toIso)
      .limit(1000),
    getMemberOptions(ctx.org.id),
    getCustomerOptions(ctx.org.id),
  ]);

  type Rel = { customers: { full_name: string } | null };
  const events: CalendarEvent[] = [
    ...((appts.data ?? []) as unknown as (Rel & { id: string; title: string; type: string; status: string; starts_at: string; ends_at: string; location: string | null; notes: string | null; customer_id: string | null; assigned_to: string | null })[]).map((a) => ({
      id: a.id,
      kind: "appointment" as const,
      title: a.title,
      start: a.starts_at,
      end: a.ends_at,
      type: a.type,
      status: a.status,
      location: a.location,
      notes: a.notes,
      customer_id: a.customer_id,
      customer_name: a.customers?.full_name ?? null,
      assigned_to: a.assigned_to,
    })),
    ...((tasks.data ?? []) as unknown as (Rel & { id: string; title: string; type: string; status: string; due_at: string; customer_id: string | null; assigned_to: string | null })[]).map((t) => ({
      id: t.id,
      kind: "task" as const,
      title: t.title,
      start: t.due_at,
      end: null,
      type: t.type,
      status: t.status,
      customer_id: t.customer_id,
      customer_name: t.customers?.full_name ?? null,
      assigned_to: t.assigned_to,
    })),
  ];

  return (
    <>
      <PageHeader title="Agenda" description="Reuniones, reservas, llamadas y seguimientos en un solo calendario." />
      {(appts.error || tasks.error) && <Alert tone="error" className="mb-4">No se pudo cargar la agenda.</Alert>}
      <AgendaCalendar
        view={view}
        date={date}
        today={today}
        days={range.days}
        events={events}
        members={members}
        customers={customers}
        readOnly={!ctx.writable}
        userId={ctx.user.id}
      />
    </>
  );
}
