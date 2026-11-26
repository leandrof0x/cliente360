"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { CalendarClock, GripVertical, Plus } from "lucide-react";
import { moveLead } from "@/app/actions/leads";
import { LEAD_STATUSES } from "@/lib/constants";
import { cn, formatGs, formatGsCompact } from "@/lib/utils";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import type { LeadStatus } from "@/lib/types";

export interface KanbanLead {
  id: string;
  title: string;
  status: LeadStatus;
  position: number;
  estimated_value: number;
  next_follow_up_at: string | null;
  next_action: string | null;
  customer_name: string;
  assignee_initials: string | null;
}

const TZ = "America/Asuncion";

function followUp(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  const overdue = d.getTime() < Date.now();
  const label = d.toLocaleDateString("es-PY", { day: "2-digit", month: "short", timeZone: TZ });
  return { overdue, label };
}

/** Posición entre vecinos para mantener el orden sin reescribir toda la columna. */
function positionAt(list: KanbanLead[], index: number) {
  const prev = list[index - 1]?.position;
  const next = list[index]?.position;
  if (prev === undefined && next === undefined) return 1000;
  if (prev === undefined) return next! - 1000;
  if (next === undefined) return prev + 1000;
  return (prev + next) / 2;
}

export function KanbanBoard({ initial, readOnly, closedNote }: { initial: KanbanLead[]; readOnly: boolean; closedNote: string }) {
  const [leads, setLeads] = useState(initial);
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<{ status: LeadStatus; index: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lostPrompt, setLostPrompt] = useState<{ id: string; position: number } | null>(null);
  const [lostReason, setLostReason] = useState("");
  const [, start] = useTransition();

  // Mantener sincronizado si el servidor envía datos nuevos
  const [seed, setSeed] = useState(initial);
  if (seed !== initial) {
    setSeed(initial);
    setLeads(initial);
  }

  const columns = useMemo(
    () =>
      LEAD_STATUSES.map((s) => {
        const items = leads.filter((l) => l.status === s.id).sort((a, b) => a.position - b.position);
        return { ...s, items, total: items.reduce((acc, l) => acc + Number(l.estimated_value), 0) };
      }),
    [leads],
  );

  function commit(id: string, status: LeadStatus, position: number, lostReasonText?: string) {
    const before = leads;
    setLeads((ls) => ls.map((l) => (l.id === id ? { ...l, status, position } : l)));
    setError(null);
    start(async () => {
      const res = await moveLead({ leadId: id, status, position, lostReason: lostReasonText });
      if (!res.ok) {
        setLeads(before);
        setError(res.error);
      }
    });
  }

  function drop(status: LeadStatus, index: number) {
    if (!dragId) return;
    const target = columns.find((c) => c.id === status)!.items.filter((l) => l.id !== dragId);
    const position = positionAt(target, Math.min(index, target.length));
    const current = leads.find((l) => l.id === dragId);
    setDragId(null);
    setOver(null);
    if (!current || (current.status === status && current.position === position)) return;
    if (status === "perdido" && current.status !== "perdido") {
      setLostReason("");
      setLostPrompt({ id: current.id, position });
      return;
    }
    commit(current.id, status, position);
  }

  function moveTo(lead: KanbanLead, status: LeadStatus) {
    if (status === lead.status) return;
    const target = columns.find((c) => c.id === status)!.items;
    const position = positionAt(target, target.length);
    if (status === "perdido") {
      setLostReason("");
      setLostPrompt({ id: lead.id, position });
      return;
    }
    commit(lead.id, status, position);
  }

  return (
    <>
      {error && <Alert tone="error" className="mb-3">{error}</Alert>}
      <div className="-mx-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex min-w-max gap-3">
          {columns.map((col) => (
            <section
              key={col.id}
              aria-label={col.label}
              className={cn(
                "flex w-[272px] shrink-0 flex-col rounded-2xl border border-slate-200/70 bg-slate-100/70 transition-colors",
                over?.status === col.id && "border-brand-300 bg-brand-50/60",
              )}
              onDragOver={(e) => {
                if (!dragId) return;
                e.preventDefault();
                if (over?.status !== col.id) setOver({ status: col.id, index: col.items.length });
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null);
              }}
              onDrop={(e) => {
                e.preventDefault();
                drop(col.id, over?.status === col.id ? over.index : col.items.length);
              }}
            >
              <header className="flex items-center justify-between gap-2 px-3 pb-2 pt-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: col.color }} aria-hidden />
                  <h2 className="truncate text-sm font-semibold text-slate-800">{col.label}</h2>
                  <span className="rounded-full bg-white px-1.5 text-xs font-medium text-slate-500">{col.items.length}</span>
                </div>
                <span className="tabular whitespace-nowrap text-xs font-medium text-slate-500" title={formatGs(col.total)}>{col.total > 0 ? formatGsCompact(col.total) : ""}</span>
              </header>
              {(col.id === "ganado" || col.id === "perdido") && <p className="px-3 pb-1 text-[11px] text-slate-400">{closedNote}</p>}
              <ol className="flex min-h-24 flex-1 flex-col gap-2 px-2 pb-2">
                {col.items.map((l, i) => {
                  const fu = followUp(l.next_follow_up_at);
                  const open = l.status !== "ganado" && l.status !== "perdido";
                  return (
                    <li
                      key={l.id}
                      draggable={!readOnly}
                      onDragStart={(e) => {
                        setDragId(l.id);
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", l.id);
                      }}
                      onDragEnd={() => {
                        setDragId(null);
                        setOver(null);
                      }}
                      onDragOver={(e) => {
                        if (!dragId) return;
                        e.preventDefault();
                        e.stopPropagation();
                        const rect = e.currentTarget.getBoundingClientRect();
                        const idx = e.clientY < rect.top + rect.height / 2 ? i : i + 1;
                        if (over?.status !== col.id || over.index !== idx) setOver({ status: col.id, index: idx });
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        drop(col.id, over?.status === col.id ? over.index : i);
                      }}
                      className={cn(
                        "group relative rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition",
                        !readOnly && "cursor-grab active:cursor-grabbing",
                        dragId === l.id && "opacity-40",
                        over?.status === col.id && over.index === i && dragId !== l.id && "before:absolute before:-top-1.5 before:left-2 before:right-2 before:h-0.5 before:rounded before:bg-brand-500",
                      )}
                    >
                      <div className="flex items-start gap-1">
                        <Link href={`/pipeline/${l.id}`} className="min-w-0 flex-1" draggable={false}>
                          <p className="truncate text-xs font-medium text-slate-500">{l.customer_name}</p>
                          <p className="mt-0.5 line-clamp-2 text-sm font-medium text-slate-900 group-hover:text-brand-700">{l.title}</p>
                        </Link>
                        {!readOnly && <GripVertical className="mt-0.5 hidden h-4 w-4 shrink-0 text-slate-300 sm:block" aria-hidden />}
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className="tabular text-sm font-semibold text-slate-900">{formatGs(l.estimated_value)}</span>
                        {l.assignee_initials && (
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-[10px] font-semibold text-slate-600" title="Responsable">
                            {l.assignee_initials}
                          </span>
                        )}
                      </div>
                      {open && (fu || l.next_action) && (
                        <p className={cn("mt-2 flex items-center gap-1 text-xs", fu?.overdue ? "font-medium text-red-600" : "text-slate-500")}>
                          <CalendarClock className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          <span className="truncate">
                            {fu ? `${fu.overdue ? "Vencido " : ""}${fu.label}` : ""}
                            {fu && l.next_action ? " · " : ""}
                            {l.next_action}
                          </span>
                        </p>
                      )}
                      {!readOnly && (
                        <label className="mt-2 block sm:hidden">
                          <span className="sr-only">Mover a</span>
                          <select
                            value={l.status}
                            onChange={(e) => moveTo(l, e.target.value as LeadStatus)}
                            className="h-8 w-full rounded-lg border border-slate-200 bg-slate-50 px-2 text-xs text-slate-700"
                          >
                            {LEAD_STATUSES.map((s) => <option key={s.id} value={s.id}>Mover a: {s.label}</option>)}
                          </select>
                        </label>
                      )}
                    </li>
                  );
                })}
                {over?.status === col.id && over.index >= col.items.length && dragId && (
                  <li className="h-1 rounded bg-brand-500" aria-hidden />
                )}
                {col.id === "nueva" && !readOnly && (
                  <li>
                    <Link href="/pipeline/nueva" className="flex items-center justify-center gap-1 rounded-xl border border-dashed border-slate-300 py-2 text-xs font-medium text-slate-500 hover:border-brand-400 hover:text-brand-700">
                      <Plus className="h-3.5 w-3.5" /> Nueva consulta
                    </Link>
                  </li>
                )}
              </ol>
            </section>
          ))}
        </div>
      </div>

      <Dialog open={!!lostPrompt} onClose={() => setLostPrompt(null)} title="Marcar como perdida" description="Registrar el motivo ayuda a mejorar tus ventas (opcional).">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (lostPrompt) commit(lostPrompt.id, "perdido", lostPrompt.position, lostReason.trim() || undefined);
            setLostPrompt(null);
          }}
          className="space-y-4"
        >
          <Input value={lostReason} onChange={(e) => setLostReason(e.target.value)} maxLength={500} placeholder="Ej.: Eligió otro proveedor" aria-label="Motivo" autoFocus />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setLostPrompt(null)}>Cancelar</Button>
            <Button type="submit" variant="danger">Marcar como perdida</Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
