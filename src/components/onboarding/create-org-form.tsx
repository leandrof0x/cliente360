"use client";

import { useActionState } from "react";
import { createOrganization } from "@/app/actions/organization";
import { Field, Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { Alert } from "@/components/ui/alert";

export function CreateOrgForm() {
  const [state, action] = useActionState(createOrganization, null);
  const fe = state && !state.ok ? state.fieldErrors : undefined;
  return (
    <form action={action} className="space-y-4" noValidate>
      {state && !state.ok && <Alert tone="error">{state.error}</Alert>}
      <Field label="Nombre del negocio" htmlFor="name" error={fe?.name?.[0]}>
        <Input id="name" name="name" required maxLength={120} placeholder="Ej.: Ferretería San José" autoFocus />
      </Field>
      <Field label="Teléfono del negocio (opcional)" htmlFor="phone" error={fe?.phone?.[0]}>
        <Input id="phone" name="phone" type="tel" maxLength={30} placeholder="0981 123 456" />
      </Field>
      <SubmitButton className="w-full" pendingText="Creando tu espacio...">
        Empezar
      </SubmitButton>
    </form>
  );
}
