"use client";

import { useActionState } from "react";
import { updateOrganization, updateProfile } from "@/app/actions/organization";
import { Field, Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { Alert } from "@/components/ui/alert";
import type { ActionResult } from "@/lib/types";

function Feedback({ state }: { state: ActionResult | null }) {
  if (!state) return null;
  return state.ok ? <Alert tone="success">{state.message}</Alert> : <Alert tone="error">{state.error}</Alert>;
}

export function OrganizationForm({
  org,
  disabled,
}: {
  org: { name: string; phone: string | null; email: string | null };
  disabled: boolean;
}) {
  const [state, action] = useActionState(updateOrganization, null);
  const fe = state && !state.ok ? state.fieldErrors : undefined;
  return (
    <form action={action} className="space-y-4">
      <Feedback state={state} />
      <Field label="Nombre del negocio" htmlFor="org-name" error={fe?.name?.[0]}>
        <Input id="org-name" name="name" defaultValue={org.name} required maxLength={120} disabled={disabled} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Teléfono" htmlFor="org-phone" error={fe?.phone?.[0]}>
          <Input id="org-phone" name="phone" type="tel" defaultValue={org.phone ?? ""} maxLength={30} disabled={disabled} />
        </Field>
        <Field label="Correo" htmlFor="org-email" error={fe?.email?.[0]}>
          <Input id="org-email" name="email" type="email" defaultValue={org.email ?? ""} disabled={disabled} />
        </Field>
      </div>
      {!disabled && <SubmitButton pendingText="Guardando...">Guardar cambios</SubmitButton>}
    </form>
  );
}

export function ProfileForm({ fullName }: { fullName: string | null }) {
  const [state, action] = useActionState(updateProfile, null);
  return (
    <form action={action} className="space-y-4">
      <Feedback state={state} />
      <Field label="Tu nombre" htmlFor="profile-name">
        <Input id="profile-name" name="fullName" defaultValue={fullName ?? ""} required maxLength={120} />
      </Field>
      <SubmitButton variant="secondary" pendingText="Guardando...">
        Actualizar perfil
      </SubmitButton>
    </form>
  );
}
