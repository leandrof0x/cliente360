"use client";

import { useActionState, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { saveTask } from "@/app/actions/tasks";
import { Dialog } from "@/components/ui/dialog";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { Alert } from "@/components/ui/alert";
import { TASK_PRIORITY_LABELS, TASK_TYPE_LABELS } from "@/lib/constants";
import type { MemberOption } from "@/lib/members";

export interface TaskFormDefaults {
  title?: string;
  type?: string;
  priority?: string;
  due_at?: string; // datetime-local en hora de Paraguay
  customer_id?: string | null;
  lead_id?: string | null;
  assigned_to?: string | null;
  description?: string | null;
}

function TaskFormBody({
  taskId,
  defaults,
  members,
  customers,
  onDone,
}: {
  taskId?: string;
  defaults: TaskFormDefaults;
  members: MemberOption[];
  customers?: { id: string; name: string }[];
  onDone: () => void;
}) {
  const [state, action] = useActionState(saveTask.bind(null, taskId ?? null), null);
  const fe = state && !state.ok ? state.fieldErrors : undefined;
  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);

  return (
    <form action={action} className="space-y-4" noValidate>
      {state && !state.ok && <Alert tone="error">{state.error}</Alert>}
      <Field label="¿Qué hay que hacer? *" htmlFor="task-title" error={fe?.title?.[0]}>
        <Input id="task-title" name="title" required maxLength={200} defaultValue={defaults.title ?? ""} placeholder="Ej.: Llamar para confirmar el presupuesto" autoFocus />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tipo" htmlFor="task-type">
          <Select id="task-type" name="type" defaultValue={defaults.type ?? "seguimiento"}>
            {Object.entries(TASK_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
        <Field label="Prioridad" htmlFor="task-priority">
          <Select id="task-priority" name="priority" defaultValue={defaults.priority ?? "media"}>
            {Object.entries(TASK_PRIORITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
        <Field label="Fecha y hora" htmlFor="task-due" error={fe?.due_at?.[0]}>
          <Input id="task-due" name="due_at" type="datetime-local" defaultValue={defaults.due_at ?? ""} />
        </Field>
        <Field label="Responsable" htmlFor="task-assignee">
          <Select id="task-assignee" name="assigned_to" defaultValue={defaults.assigned_to ?? ""}>
            <option value="">Sin asignar</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </Select>
        </Field>
        {customers && (
          <Field label="Cliente" htmlFor="task-customer" className="sm:col-span-2">
            <Select id="task-customer" name="customer_id" defaultValue={defaults.customer_id ?? ""}>
              <option value="">Sin cliente</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
        )}
      </div>
      {!customers && <input type="hidden" name="customer_id" value={defaults.customer_id ?? ""} />}
      <input type="hidden" name="lead_id" value={defaults.lead_id ?? ""} />
      <Field label="Detalle (opcional)" htmlFor="task-desc">
        <Textarea id="task-desc" name="description" rows={2} maxLength={2000} defaultValue={defaults.description ?? ""} />
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onDone}>Cancelar</Button>
        <SubmitButton pendingText="Guardando...">{taskId ? "Guardar" : "Crear tarea"}</SubmitButton>
      </div>
    </form>
  );
}

export function TaskFormDialog({
  label = "Nueva tarea",
  title = "Programar tarea o seguimiento",
  taskId,
  defaults = {},
  members,
  customers,
  buttonProps,
  icon = true,
}: {
  label?: string;
  title?: string;
  taskId?: string;
  defaults?: TaskFormDefaults;
  members: MemberOption[];
  customers?: { id: string; name: string }[];
  buttonProps?: ButtonProps;
  icon?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(0);
  return (
    <>
      <Button type="button" {...buttonProps} onClick={() => { setKey((k) => k + 1); setOpen(true); }}>
        {icon && <Plus className="h-4 w-4" aria-hidden />} {label}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={title}>
        <TaskFormBody key={key} taskId={taskId} defaults={defaults} members={members} customers={customers} onDone={() => setOpen(false)} />
      </Dialog>
    </>
  );
}
