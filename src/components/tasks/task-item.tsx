"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Check, Loader2, Trash2 } from "lucide-react";
import { completeTask, deleteTask, reopenTask } from "@/app/actions/tasks";
import { Badge } from "@/components/ui/badge";
import { TASK_TYPE_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { TaskPriority, TaskStatus, TaskType } from "@/lib/types";

export interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  type: TaskType;
  priority: TaskPriority;
  status: TaskStatus;
  due_at: string | null;
  completed_at: string | null;
  customer?: { id: string; full_name: string } | null;
  assignee_name?: string | null;
}

const TZ = "America/Asuncion";
const dayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);

export function dueInfo(iso: string | null) {
  if (!iso) return { label: "Sin fecha", tone: "neutral" as const };
  const d = new Date(iso);
  const time = d.toLocaleTimeString("es-PY", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
  const today = dayKey(new Date());
  const tomorrow = dayKey(new Date(Date.now() + 86400000));
  const k = dayKey(d);
  if (d.getTime() < Date.now()) {
    const label = k === today ? `Hoy ${time}` : d.toLocaleDateString("es-PY", { day: "2-digit", month: "short", timeZone: TZ }) + ` ${time}`;
    return { label: `Vencida · ${label}`, tone: "danger" as const };
  }
  if (k === today) return { label: `Hoy ${time}`, tone: "warning" as const };
  if (k === tomorrow) return { label: `Mañana ${time}`, tone: "brand" as const };
  return { label: d.toLocaleDateString("es-PY", { weekday: "short", day: "2-digit", month: "short", timeZone: TZ }) + ` ${time}`, tone: "neutral" as const };
}

export function TaskItem({ task, readOnly, showCustomer = true }: { task: TaskRow; readOnly?: boolean; showCustomer?: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const done = task.status === "completada";
  const due = dueInfo(task.due_at);

  const run = (fn: (id: string) => Promise<{ ok: boolean; error?: string }>) =>
    start(async () => {
      const res = await fn(task.id);
      setError(res.ok ? null : (res.error ?? "Error"));
    });

  return (
    <li className={cn("flex items-start gap-3 px-4 py-3", pending && "opacity-60")}>
      <button
        type="button"
        disabled={readOnly || pending}
        onClick={() => run(done ? reopenTask : completeTask)}
        className={cn(
          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors disabled:cursor-not-allowed",
          done ? "border-success-600 bg-success-600 text-white" : "border-slate-300 hover:border-success-600",
        )}
        aria-label={done ? "Marcar como pendiente" : "Marcar como completada"}
        title={done ? "Reabrir" : "Completar"}
      >
        {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : done ? <Check className="h-3 w-3" /> : null}
      </button>
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm font-medium", done ? "text-slate-400 line-through" : "text-slate-900")}>{task.title}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
          <span>{TASK_TYPE_LABELS[task.type]}</span>
          {!done && <Badge tone={due.tone}>{due.label}</Badge>}
          {done && task.completed_at && (
            <span>Completada {new Date(task.completed_at).toLocaleDateString("es-PY", { day: "2-digit", month: "short", timeZone: TZ })}</span>
          )}
          {task.priority === "alta" && !done && <Badge tone="danger">Prioridad alta</Badge>}
          {showCustomer && task.customer && (
            <Link href={`/clientes/${task.customer.id}`} className="font-medium text-brand-700 hover:underline">
              {task.customer.full_name}
            </Link>
          )}
          {task.assignee_name && <span>· {task.assignee_name}</span>}
        </div>
        {task.description && <p className="mt-1 text-xs text-slate-600">{task.description}</p>}
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </div>
      {!readOnly && (
        <button
          type="button"
          onClick={() => {
            if (window.confirm("¿Eliminar esta tarea?")) run(deleteTask);
          }}
          className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
          aria-label="Eliminar tarea"
          title="Eliminar"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </li>
  );
}
