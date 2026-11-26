"use client";

import { useActionState, useTransition, useState } from "react";
import { recordPayment, resolvePlanRequest, setOrgStatus, suspendOrg, updatePlan, updatePlatformSettings, updateSubscription } from "@/app/actions/platform";
import { SUBSCRIPTION_STATUS_LABELS } from "@/lib/constants";
import type { ActionResult, SubscriptionStatus } from "@/lib/types";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

function Feedback({ state }: { state: ActionResult | null }) {
  if (!state) return null;
  return state.ok ? <Alert tone="success">{state.message ?? "Listo."}</Alert> : <Alert tone="error">{state.error}</Alert>;
}
const err = (s: ActionResult | null, k: string) => (s && !s.ok ? s.fieldErrors?.[k]?.[0] : undefined);
const toDateInput = (iso: string | null) => (iso ? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Asuncion" }).format(new Date(iso)) : "");

export function SubscriptionForm({
  orgId,
  plans,
  sub,
}: {
  orgId: string;
  plans: { id: string; name: string; price_gs: number }[];
  sub: { plan_id: string; status: SubscriptionStatus; trial_ends_at: string | null; current_period_end: string | null; price_gs: number | null; notes: string | null } | null;
}) {
  const [state, action] = useActionState(updateSubscription.bind(null, orgId), null);
  return (
    <form action={action} className="space-y-4">
      <Feedback state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Plan" htmlFor="sub-plan">
          <Select id="sub-plan" name="plan" defaultValue={sub?.plan_id ?? plans[0]?.id}>
            {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
        <Field label="Estado" htmlFor="sub-status">
          <Select id="sub-status" name="status" defaultValue={sub?.status ?? "trialing"}>
            {(Object.keys(SUBSCRIPTION_STATUS_LABELS) as SubscriptionStatus[]).map((s) => <option key={s} value={s}>{SUBSCRIPTION_STATUS_LABELS[s]}</option>)}
          </Select>
        </Field>
        <Field label="Fin de la prueba" htmlFor="sub-trial">
          <Input id="sub-trial" name="trial_ends_at" type="date" defaultValue={toDateInput(sub?.trial_ends_at ?? null)} />
        </Field>
        <Field label="Pagado hasta" htmlFor="sub-end" hint="Al registrar un pago se calcula solo.">
          <Input id="sub-end" name="period_end" type="date" defaultValue={toDateInput(sub?.current_period_end ?? null)} />
        </Field>
        <Field label="Precio mensual pactado (Gs.)" htmlFor="sub-price" error={err(state, "price_gs")}>
          <Input id="sub-price" name="price_gs" type="number" min={0} step={1000} defaultValue={sub?.price_gs ?? ""} />
        </Field>
        <Field label="Notas internas" htmlFor="sub-notes">
          <Input id="sub-notes" name="notes" maxLength={1000} defaultValue={sub?.notes ?? ""} />
        </Field>
      </div>
      <SubmitButton pendingText="Guardando...">Guardar suscripción</SubmitButton>
    </form>
  );
}

export function PaymentForm({ orgId, suggested }: { orgId: string; suggested: number | null }) {
  const [state, action] = useActionState(recordPayment.bind(null, orgId), null);
  return (
    <form action={action} className="space-y-4">
      <Feedback state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Monto recibido (Gs.)" htmlFor="pay-amount" error={err(state, "amount_gs")}>
          <Input id="pay-amount" name="amount_gs" type="number" min={1} step={1000} required defaultValue={suggested ?? ""} />
        </Field>
        <Field label="Meses que cubre" htmlFor="pay-months" error={err(state, "months")}>
          <Input id="pay-months" name="months" type="number" min={1} max={24} required defaultValue={1} />
        </Field>
        <Field label="Medio de pago" htmlFor="pay-method" error={err(state, "method")}>
          <Select id="pay-method" name="method" defaultValue="Transferencia bancaria">
            <option>Transferencia bancaria</option>
            <option>Efectivo</option>
            <option>Giro</option>
            <option>Billetera electrónica</option>
            <option>Pasarela de pago</option>
          </Select>
        </Field>
        <Field label="Comprobante o referencia" htmlFor="pay-ref">
          <Input id="pay-ref" name="reference" maxLength={120} placeholder="N.º de operación" />
        </Field>
      </div>
      <Field label="Notas" htmlFor="pay-notes">
        <Input id="pay-notes" name="notes" maxLength={1000} />
      </Field>
      <p className="text-xs text-slate-500">Registrá solo pagos efectivamente recibidos. Activa la suscripción y extiende el período desde el vencimiento vigente.</p>
      <SubmitButton variant="success" pendingText="Registrando...">Registrar pago</SubmitButton>
    </form>
  );
}

export function OrgStatusControl({ orgId, status, reason }: { orgId: string; status: "active" | "suspended"; reason: string | null }) {
  const [state, action] = useActionState(suspendOrg.bind(null, orgId), null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (status === "suspended") {
    return (
      <div className="space-y-3">
        <Alert tone="error" title="Cuenta suspendida">{reason}</Alert>
        {error && <Alert tone="error">{error}</Alert>}
        <Button
          variant="success"
          loading={pending}
          onClick={() => start(async () => {
            const r = await setOrgStatus(orgId, "active");
            if (!r.ok) setError(r.error);
          })}
        >
          Reactivar cuenta
        </Button>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-3">
      <Feedback state={state} />
      <Field label="Motivo de la suspensión (lo ve la empresa)" htmlFor="susp-reason">
        <Input id="susp-reason" name="reason" maxLength={300} required placeholder="Ej.: falta de pago" />
      </Field>
      <p className="text-xs text-slate-500">La empresa conserva sus datos en modo solo lectura.</p>
      <SubmitButton variant="danger" pendingText="Suspendiendo...">Suspender cuenta</SubmitButton>
    </form>
  );
}

export function RequestActions({ id, orgId }: { id: string; orgId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const run = (approve: boolean) =>
    start(async () => {
      const r = await resolvePlanRequest(id, approve, orgId);
      if (!r.ok) setError(r.error);
    });
  return (
    <div className="space-y-2">
      {error && <Alert tone="error">{error}</Alert>}
      <div className="flex gap-2">
        <Button size="sm" variant="success" disabled={pending} onClick={() => run(true)}>Aprobar cambio</Button>
        <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(false)}>Rechazar</Button>
      </div>
    </div>
  );
}

export function PlanForm({
  plan,
}: {
  plan: { id: string; name: string; description: string | null; price_gs: number; max_users: number; max_customers: number | null; ai_monthly_requests: number; is_active: boolean };
}) {
  const [state, action] = useActionState(updatePlan.bind(null, plan.id), null);
  const id = (k: string) => `${plan.id}-${k}`;
  return (
    <form action={action} className="space-y-4">
      <Feedback state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre" htmlFor={id("name")} error={err(state, "name")}>
          <Input id={id("name")} name="name" required maxLength={60} defaultValue={plan.name} />
        </Field>
        <Field label="Precio mensual (Gs.)" htmlFor={id("price")} error={err(state, "price_gs")}>
          <Input id={id("price")} name="price_gs" type="number" min={0} step={1000} required defaultValue={plan.price_gs} />
        </Field>
        <Field label="Máximo de usuarios" htmlFor={id("users")} error={err(state, "max_users")}>
          <Input id={id("users")} name="max_users" type="number" min={1} required defaultValue={plan.max_users} />
        </Field>
        <Field label="Máximo de clientes" htmlFor={id("cust")} hint="Vacío = ilimitado" error={err(state, "max_customers")}>
          <Input id={id("cust")} name="max_customers" type="number" min={1} defaultValue={plan.max_customers ?? ""} />
        </Field>
        <Field label="Consultas de CLIENTE AI por mes" htmlFor={id("ai")} error={err(state, "ai_monthly_requests")}>
          <Input id={id("ai")} name="ai_monthly_requests" type="number" min={0} required defaultValue={plan.ai_monthly_requests} />
        </Field>
        <Field label="Descripción" htmlFor={id("desc")}>
          <Input id={id("desc")} name="description" maxLength={300} defaultValue={plan.description ?? ""} />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" name="is_active" defaultChecked={plan.is_active} className="h-4 w-4 rounded border-slate-300" /> Visible para contratar
      </label>
      <SubmitButton pendingText="Guardando...">Guardar plan</SubmitButton>
    </form>
  );
}

export function SettingsForm({
  values,
  plans,
}: {
  values: { trial_days: number; trial_plan: string; payment_instructions: string; support_contact: string };
  plans: { id: string; name: string }[];
}) {
  const [state, action] = useActionState(updatePlatformSettings, null);
  return (
    <form action={action} className="space-y-4">
      <Feedback state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Días de prueba gratis" htmlFor="set-days" error={err(state, "trial_days")}>
          <Input id="set-days" name="trial_days" type="number" min={0} max={90} required defaultValue={values.trial_days} />
        </Field>
        <Field label="Plan durante la prueba" htmlFor="set-plan">
          <Select id="set-plan" name="trial_plan" defaultValue={values.trial_plan}>
            {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Instrucciones de pago (las ven las empresas en Plan y pagos)" htmlFor="set-pay" hint="Ej.: banco, titular, RUC, número de cuenta y a dónde enviar el comprobante.">
        <Textarea id="set-pay" name="payment_instructions" rows={5} maxLength={2000} defaultValue={values.payment_instructions} />
      </Field>
      <Field label="Contacto de soporte" htmlFor="set-support" hint="WhatsApp o correo visible para las empresas.">
        <Input id="set-support" name="support_contact" maxLength={200} defaultValue={values.support_contact} />
      </Field>
      <SubmitButton pendingText="Guardando...">Guardar ajustes</SubmitButton>
    </form>
  );
}
