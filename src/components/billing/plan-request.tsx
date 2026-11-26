"use client";

import { useActionState, useState } from "react";
import { requestPlanChange } from "@/app/actions/billing";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { formatGs } from "@/lib/utils";

export function PlanRequestButton({ planId, planName, priceGs, disabled }: { planId: string; planName: string; priceGs: number; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(requestPlanChange, null);
  return (
    <>
      <Button type="button" size="sm" className="w-full" disabled={disabled} onClick={() => setOpen(true)}>
        Elegir {planName}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`Cambiar al plan ${planName}`} description={`${formatGs(priceGs)} por mes.`}>
        {state?.ok ? (
          <div className="space-y-4">
            <Alert tone="success">{state.message}</Alert>
            <div className="flex justify-end"><Button variant="secondary" onClick={() => setOpen(false)}>Cerrar</Button></div>
          </div>
        ) : (
          <form action={action} className="space-y-4">
            <input type="hidden" name="plan" value={planId} />
            <p className="text-sm text-slate-600">
              Enviamos tu solicitud al equipo de CLIENTE360. El cambio se activa cuando se confirma el pago. No se realiza ningún cobro automático.
            </p>
            <Field label="Mensaje (opcional)" htmlFor={`msg-${planId}`}>
              <Textarea id={`msg-${planId}`} name="message" rows={3} maxLength={1000} placeholder="Ej.: preferimos pagar por transferencia, 3 meses." />
            </Field>
            {state && !state.ok && <Alert tone="error">{state.error}</Alert>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button>
              <SubmitButton pendingText="Enviando...">Enviar solicitud</SubmitButton>
            </div>
          </form>
        )}
      </Dialog>
    </>
  );
}
