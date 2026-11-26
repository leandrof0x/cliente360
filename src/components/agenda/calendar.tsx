"use client";

import Link from "next/link";
import { useActionState, useEffect, useState, useTransition } from "react";
import { ChevronLeft, ChevronRight, Plus, Trash2, CheckSquare } from "lucide-react";
import { deleteAppointment, saveAppointment } from "@/app/actions/appointments";
import { dayKeyPy, formatTitle, shiftDate, timePy, type CalendarView } from "@/lib/calendar";
import { isoToPyLocal } from "@/lib/crm";
import { cn } from "@/lib/utils";
import { Button, buttonClasses } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { Alert } from "@/components/ui/alert";
import type { MemberOption } from "@/lib/members";

export interface CalendarEvent {
  id: string;
  kind: "appointment" | "task";
  title: string;
  start: string;
  end: string | null;
  type: string;
  status: string;
  location?: string | null;
  notes?: string | null;
  customer_id?: string | null;
  customer_name?: string | null;
  assigned_to?: string | null;
}

export const APPOINTMENT_TYPES: Record<string, { label: string; cls: string }> = {
  reunion: { label: "Reunión", cls: "bg-brand-50 text-brand-800 border-brand-200" },
  reserva: { label: "Reserva", cls: "bg-violet-50 text-violet-800 border-violet-200" },
  llamada: { label: "Llamada", cls: "bg-sky-50 text-sky-800 border-sky-200" },
  seguimiento: { label: "Seguimiento", cls: "bg-amber-50 text-amber-800 border-amber-200" },
  otro: { label: "Otro", cls: "bg-slate-50 text-slate-700 border-slate-200" },
};
const TASK_CLS = "bg-white text-slate-700 border-dashed border-slate-300";
const STATUS_LABELS: Record<string, string> = { programada: "Programada", realizada: "Realizada", cancelada: "Cancelada", no_asistio: "No asistió" };

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function EventChip({ ev, onOpen, compact }: { ev: CalendarEvent; onOpen: (ev: CalendarEvent) => void; compact?: boolean }) {
  const cls = ev.kind === "task" ? TASK_CLS : (APPOINTMENT_TYPES[ev.type]?.cls ?? APPOINTMENT_TYPES.otro.cls);
  const muted = ev.status === "cancelada" || ev.status === "completada";
  const inner = (
    <>
      {ev.kind === "task" && <CheckSquare className="mr-1 inline h-3 w-3 align-[-2px]" aria-hidden />}
      <span className="tabular font-medium">{timePy(ev.start)}</span> {ev.title}
      {!compact && ev.customer_name && <span className="block truncate opacity-75">{ev.customer_name}</span>}
    </>
  );
  const className = cn("block w-full truncate rounded-md border px-1.5 py-0.5 text-left text-xs", cls, muted && "line-through opacity-50");
  if (ev.kind === "task") {
    return (
      <Link href={ev.customer_id ? `/clientes/${ev.customer_id}` : "/seguimientos"} className={className} title={ev.title}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={() => onOpen(ev)} className={className} title={ev.title}>
      {inner}
    </button>
  );
}

function AppointmentForm({
  initial,
  members,
  customers,
  onDone,
}: {
  initial: Partial<CalendarEvent> & { startLocal: string; endLocal: string };
  members: MemberOption[];
  customers: { id: string; name: string }[];
  onDone: () => void;
}) {
  const [state, action] = useActionState(saveAppointment.bind(null, initial.id ?? null), null);
  const [pending, start] = useTransition();
  const [delErr, setDelErr] = useState<string | null>(null);
  const fe = state && !state.ok ? state.fieldErrors : undefined;
  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);

  return (
    <form action={action} className="space-y-4">
      {state && !state.ok && <Alert tone="error">{state.error}</Alert>}
      {delErr && <Alert tone="error">{delErr}</Alert>}
      <Field label="Título *" htmlFor="ap-title" error={fe?.title?.[0]}>
        <Input id="ap-title" name="title" required maxLength={200} defaultValue={initial.title ?? ""} autoFocus />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tipo" htmlFor="ap-type">
          <Select id="ap-type" name="type" defaultValue={initial.type ?? "reunion"}>
            {Object.entries(APPOINTMENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
        </Field>
        <Field label="Estado" htmlFor="ap-status">
          <Select id="ap-status" name="status" defaultValue={initial.status ?? "programada"}>
            {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
        <Field label="Inicio *" htmlFor="ap-start" error={fe?.starts_at?.[0]}>
          <Input id="ap-start" name="starts_at" type="datetime-local" required defaultValue={initial.startLocal} />
        </Field>
        <Field label="Fin *" htmlFor="ap-end" error={fe?.ends_at?.[0]}>
          <Input id="ap-end" name="ends_at" type="datetime-local" required defaultValue={initial.endLocal} />
        </Field>
        <Field label="Cliente" htmlFor="ap-customer">
          <Select id="ap-customer" name="customer_id" defaultValue={initial.customer_id ?? ""}>
            <option value="">Sin cliente</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Responsable" htmlFor="ap-assignee">
          <Select id="ap-assignee" name="assigned_to" defaultValue={initial.assigned_to ?? ""}>
            <option value="">Sin asignar</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Lugar o enlace" htmlFor="ap-loc">
        <Input id="ap-loc" name="location" maxLength={200} defaultValue={initial.location ?? ""} />
      </Field>
      <Field label="Notas" htmlFor="ap-notes">
        <Textarea id="ap-notes" name="notes" rows={2} maxLength={2000} defaultValue={initial.notes ?? ""} />
      </Field>
      <div className="flex items-center justify-between gap-2">
        {initial.id ? (
          <Button
            type="button"
            variant="ghost"
            className="text-red-600 hover:bg-red-50"
            loading={pending}
            onClick={() => {
              if (!window.confirm("¿Eliminar esta cita?")) return;
              start(async () => {
                const r = await deleteAppointment(initial.id!);
                if (r.ok) onDone();
                else setDelErr(r.error);
              });
            }}
          >
            <Trash2 className="h-4 w-4" /> Eliminar
          </Button>
        ) : <span />}
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={onDone}>Cancelar</Button>
          <SubmitButton pendingText="Guardando...">Guardar</SubmitButton>
        </div>
      </div>
    </form>
  );
}

export function AgendaCalendar({
  view,
  date,
  today,
  days,
  events,
  members,
  customers,
  readOnly,
  userId,
}: {
  view: CalendarView;
  date: string;
  today: string;
  days: string[];
  events: CalendarEvent[];
  members: MemberOption[];
  customers: { id: string; name: string }[];
  readOnly: boolean;
  userId: string;
}) {
  const [editing, setEditing] = useState<(Partial<CalendarEvent> & { startLocal: string; endLocal: string }) | null>(null);
  const byDay = new Map<string, CalendarEvent[]>();
  for (const ev of events) {
    const k = dayKeyPy(ev.start);
    byDay.set(k, [...(byDay.get(k) ?? []), ev]);
  }
  byDay.forEach((list) => list.sort((a, b) => a.start.localeCompare(b.start)));
  const href = (v: CalendarView, d: string) => `/agenda?vista=${v}&fecha=${d}`;

  const newAt = (day: string) =>
    !readOnly && setEditing({ startLocal: `${day}T09:00`, endLocal: `${day}T10:00`, assigned_to: userId, type: "reunion" });
  const open = (ev: CalendarEvent) =>
    setEditing({ ...ev, startLocal: isoToPyLocal(ev.start), endLocal: isoToPyLocal(ev.end ?? ev.start) });

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Link href={href(view, shiftDate(view, date, -1))} className={buttonClasses("secondary", "icon")} aria-label="Anterior"><ChevronLeft className="h-4 w-4" /></Link>
          <Link href={href(view, today)} className={buttonClasses("secondary", "md")}>Hoy</Link>
          <Link href={href(view, shiftDate(view, date, 1))} className={buttonClasses("secondary", "icon")} aria-label="Siguiente"><ChevronRight className="h-4 w-4" /></Link>
          <h2 className="ml-2 text-lg font-semibold text-slate-900">{formatTitle(view, date)}</h2>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 text-sm shadow-sm">
            {(["dia", "semana", "mes"] as CalendarView[]).map((v) => (
              <Link key={v} href={href(v, date)} className={cn("rounded-md px-3 py-1.5", v === view ? "bg-slate-900 text-white" : "text-slate-600")}>
                {v === "dia" ? "Día" : v === "semana" ? "Semana" : "Mes"}
              </Link>
            ))}
          </div>
          {!readOnly && <Button onClick={() => newAt(view === "mes" ? today : date)}><Plus className="h-4 w-4" /> Nueva cita</Button>}
        </div>
      </div>

      {view === "mes" && (
        <div className="overflow-hidden rounded-[var(--radius-card)] border border-slate-200 bg-white shadow-[var(--shadow-card)]">
          <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-center text-xs font-medium text-slate-500">
            {WEEKDAYS.map((d) => <div key={d} className="py-2">{d}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {days.map((d) => {
              const list = byDay.get(d) ?? [];
              const inMonth = d.slice(0, 7) === date.slice(0, 7);
              return (
                <div key={d} className={cn("min-h-20 border-b border-r border-slate-100 p-1 sm:min-h-28 sm:p-1.5", !inMonth && "bg-slate-50/60")}>
                  <div className="mb-1 flex items-center justify-between">
                    <Link href={href("dia", d)} className={cn("flex h-6 w-6 items-center justify-center rounded-full text-xs", d === today ? "bg-brand-600 font-semibold text-white" : inMonth ? "text-slate-700 hover:bg-slate-100" : "text-slate-400")}>
                      {Number(d.slice(8))}
                    </Link>
                    {!readOnly && (
                      <button onClick={() => newAt(d)} className="hidden h-5 w-5 items-center justify-center rounded text-slate-300 hover:bg-slate-100 hover:text-slate-600 sm:flex" aria-label={`Nueva cita el ${d}`}>
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="hidden space-y-1 sm:block">
                    {list.slice(0, 3).map((ev) => <EventChip key={ev.kind + ev.id} ev={ev} onOpen={open} compact />)}
                    {list.length > 3 && <Link href={href("dia", d)} className="block px-1 text-xs font-medium text-slate-500 hover:text-slate-800">+{list.length - 3} más</Link>}
                  </div>
                  {list.length > 0 && (
                    <Link href={href("dia", d)} className="flex justify-center sm:hidden" aria-label={`${list.length} eventos`}>
                      <span className="rounded-full bg-brand-600 px-1.5 text-[10px] font-semibold text-white">{list.length}</span>
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {view !== "mes" && (
        <div className={cn("grid gap-3", view === "semana" && "md:grid-cols-7")}>
          {days.map((d) => {
            const list = byDay.get(d) ?? [];
            const label = new Date(`${d}T12:00:00Z`).toLocaleDateString("es-PY", { weekday: view === "semana" ? "short" : "long", day: "numeric", month: "short", timeZone: "UTC" });
            return (
              <section key={d} className={cn("rounded-[var(--radius-card)] border bg-white p-3 shadow-[var(--shadow-card)]", d === today ? "border-brand-300" : "border-slate-200")}>
                <header className="mb-2 flex items-center justify-between">
                  <h3 className={cn("text-sm font-semibold first-letter:uppercase", d === today ? "text-brand-700" : "text-slate-800")}>{label}</h3>
                  {!readOnly && (
                    <button onClick={() => newAt(d)} className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Nueva cita">
                      <Plus className="h-4 w-4" />
                    </button>
                  )}
                </header>
                {list.length === 0 ? (
                  <p className="py-2 text-xs text-slate-400">Libre</p>
                ) : (
                  <div className="space-y-1.5">
                    {list.map((ev) => <EventChip key={ev.kind + ev.id} ev={ev} onOpen={open} compact={view === "semana"} />)}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-3 text-xs text-slate-500">
        {Object.entries(APPOINTMENT_TYPES).map(([k, v]) => (
          <span key={k} className="inline-flex items-center gap-1.5"><span className={cn("h-3 w-3 rounded border", v.cls)} /> {v.label}</span>
        ))}
        <span className="inline-flex items-center gap-1.5"><span className={cn("h-3 w-3 rounded border", TASK_CLS)} /> Tarea / seguimiento</span>
      </div>

      <Dialog open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? "Editar cita" : "Nueva cita"} className="max-w-xl">
        {editing && <AppointmentForm key={editing.id ?? editing.startLocal} initial={editing} members={members} customers={customers} onDone={() => setEditing(null)} />}
      </Dialog>
    </>
  );
}
