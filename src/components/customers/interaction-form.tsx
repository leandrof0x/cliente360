"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { addInteraction } from "@/app/actions/customers";
import { Select, Textarea, Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { Alert } from "@/components/ui/alert";
import { INTERACTION_TYPE_LABELS } from "@/lib/crm";
import { cn } from "@/lib/utils";

export function InteractionForm({ customerId, leads }: { customerId: string; leads: { id: string; title: string }[] }) {
  const [state, action] = useActionState(addInteraction, null);
  const [type, setType] = useState("nota");
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      setType("nota");
    }
  }, [state]);

  const isNote = type === "nota";
  return (
    <form ref={formRef} action={action} className="space-y-3">
      <input type="hidden" name="customer_id" value={customerId} />
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Tipo de registro">
        {Object.entries(INTERACTION_TYPE_LABELS).map(([k, v]) => (
          <label
            key={k}
            className={cn(
              "cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              type === k ? "border-brand-600 bg-brand-600 text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300",
            )}
          >
            <input type="radio" name="type" value={k} checked={type === k} onChange={() => setType(k)} className="sr-only" />
            {v}
          </label>
        ))}
      </div>
      <Textarea
        name="content"
        required
        maxLength={5000}
        rows={3}
        placeholder={isNote ? "Escribí una nota interna sobre este cliente…" : "¿Qué se habló? Ej.: Pidió precio del modelo X, quedó en confirmar el viernes."}
        aria-label="Detalle"
      />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        {!isNote && (
          <>
            <Select name="direction" defaultValue="saliente" className="sm:w-40" aria-label="Dirección">
              <option value="saliente">Lo contactamos</option>
              <option value="entrante">Nos contactó</option>
            </Select>
            <Input name="occurred_at" type="datetime-local" className="sm:w-52" aria-label="Fecha y hora (opcional)" title="Dejar vacío para usar ahora" />
          </>
        )}
        {isNote && <input type="hidden" name="direction" value="interna" />}
        {leads.length > 0 && (
          <Select name="lead_id" defaultValue="" className="sm:w-52" aria-label="Oportunidad relacionada">
            <option value="">Sin oportunidad</option>
            {leads.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}
          </Select>
        )}
        <SubmitButton className="sm:ml-auto" pendingText="Guardando...">
          {isNote ? "Guardar nota" : "Registrar"}
        </SubmitButton>
      </div>
      {state && (state.ok ? <Alert tone="success">{state.message}</Alert> : <Alert tone="error">{state.error}</Alert>)}
    </form>
  );
}
