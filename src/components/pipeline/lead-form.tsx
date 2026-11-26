"use client";

import { useActionState, useState } from "react";
import { saveLead } from "@/app/actions/leads";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { ButtonLink } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { LEAD_STATUSES } from "@/lib/constants";
import type { MemberOption } from "@/lib/members";

export interface LeadFormValues {
  id?: string;
  customer_id?: string;
  title?: string;
  description?: string | null;
  product_service?: string | null;
  estimated_value?: number;
  entered_at?: string;
  assigned_to?: string | null;
  status?: string;
  next_action?: string | null;
  next_follow_up_local?: string;
  lost_reason?: string | null;
}

export function LeadForm({
  initial,
  customers,
  members,
  today,
  readOnly,
}: {
  initial: LeadFormValues;
  customers: { id: string; name: string }[];
  members: MemberOption[];
  today: string;
  readOnly?: boolean;
}) {
  const [state, action] = useActionState(saveLead.bind(null, initial.id ?? null), null);
  const [status, setStatus] = useState(initial.status ?? "nueva");
  const fe = state && !state.ok ? state.fieldErrors : undefined;
  const e = (k: string) => fe?.[k]?.[0];

  return (
    <form action={action} className="space-y-5" noValidate>
      {state && (state.ok ? <Alert tone="success">{state.message}</Alert> : <Alert tone="error">{state.error}</Alert>)}
      <fieldset disabled={readOnly} className="grid gap-4 sm:grid-cols-2">
        <Field label="Cliente *" htmlFor="customer_id" error={e("customer_id")} className="sm:col-span-2">
          <Select id="customer_id" name="customer_id" required defaultValue={initial.customer_id ?? ""}>
            <option value="" disabled>Elegí un cliente</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="¿Qué consulta o necesita? *" htmlFor="title" error={e("title")} className="sm:col-span-2">
          <Input id="title" name="title" required maxLength={200} defaultValue={initial.title ?? ""} placeholder="Ej.: Presupuesto para 3 equipos de aire acondicionado" />
        </Field>
        <Field label="Producto o servicio" htmlFor="product_service" error={e("product_service")}>
          <Input id="product_service" name="product_service" maxLength={200} defaultValue={initial.product_service ?? ""} />
        </Field>
        <Field label="Valor estimado (Gs.)" htmlFor="estimated_value" error={e("estimated_value")}>
          <Input id="estimated_value" name="estimated_value" type="number" inputMode="numeric" min={0} step={1000} defaultValue={initial.estimated_value ?? 0} />
        </Field>
        <Field label="Estado" htmlFor="status" error={e("status")}>
          <Select id="status" name="status" value={status} onChange={(ev) => setStatus(ev.target.value)}>
            {LEAD_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </Select>
        </Field>
        <Field label="Responsable" htmlFor="assigned_to" error={e("assigned_to")}>
          <Select id="assigned_to" name="assigned_to" defaultValue={initial.assigned_to ?? ""}>
            <option value="">Sin asignar</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </Select>
        </Field>
        {status === "perdido" && (
          <Field label="Motivo de la pérdida" htmlFor="lost_reason" error={e("lost_reason")} className="sm:col-span-2">
            <Input id="lost_reason" name="lost_reason" maxLength={500} defaultValue={initial.lost_reason ?? ""} placeholder="Ej.: Eligió otro proveedor por precio" />
          </Field>
        )}
        <Field label="Próxima acción" htmlFor="next_action" error={e("next_action")}>
          <Input id="next_action" name="next_action" maxLength={200} defaultValue={initial.next_action ?? ""} placeholder="Ej.: Enviar cotización" />
        </Field>
        <Field label="Fecha del próximo seguimiento" htmlFor="next_follow_up_at" error={e("next_follow_up_at")}>
          <Input id="next_follow_up_at" name="next_follow_up_at" type="datetime-local" defaultValue={initial.next_follow_up_local ?? ""} />
        </Field>
        <Field label="Fecha de ingreso" htmlFor="entered_at" error={e("entered_at")}>
          <Input id="entered_at" name="entered_at" type="date" max={today} defaultValue={initial.entered_at ?? today} />
        </Field>
        <Field label="Descripción" htmlFor="description" error={e("description")} className="sm:col-span-2">
          <Textarea id="description" name="description" rows={3} maxLength={5000} defaultValue={initial.description ?? ""} />
        </Field>
      </fieldset>
      {!readOnly && (
        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
          {!initial.id && <ButtonLink href="/pipeline" variant="secondary">Cancelar</ButtonLink>}
          <SubmitButton pendingText="Guardando...">{initial.id ? "Guardar cambios" : "Crear oportunidad"}</SubmitButton>
        </div>
      )}
    </form>
  );
}
