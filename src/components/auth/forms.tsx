"use client";

import Link from "next/link";
import { useActionState } from "react";
import { signIn, signUp, requestPasswordReset, updatePassword } from "@/app/actions/auth";
import { Field, Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { Alert } from "@/components/ui/alert";
import type { ActionResult } from "@/lib/types";

function err(state: ActionResult | null, field: string) {
  return state && !state.ok ? state.fieldErrors?.[field]?.[0] : undefined;
}

function Feedback({ state }: { state: ActionResult | null }) {
  if (!state) return null;
  if (!state.ok) return <Alert tone="error">{state.error}</Alert>;
  if (state.message) return <Alert tone="success">{state.message}</Alert>;
  return null;
}

export function SignInForm({ next, linkError }: { next?: string; linkError?: boolean }) {
  const [state, action] = useActionState(signIn, null);
  return (
    <form action={action} className="space-y-4" noValidate>
      {linkError && !state && <Alert tone="warning">El enlace no es válido o expiró. Intentá de nuevo.</Alert>}
      <Feedback state={state} />
      <input type="hidden" name="next" value={next ?? "/dashboard"} />
      <Field label="Correo electrónico" htmlFor="email" error={err(state, "email")}>
        <Input id="email" name="email" type="email" autoComplete="email" required placeholder="tu@negocio.com" />
      </Field>
      <Field label="Contraseña" htmlFor="password" error={err(state, "password")}>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </Field>
      <div className="flex justify-end">
        <Link href="/recuperar" className="text-sm font-medium text-brand-600 hover:text-brand-700">
          ¿Olvidaste tu contraseña?
        </Link>
      </div>
      <SubmitButton className="w-full" pendingText="Ingresando...">
        Ingresar
      </SubmitButton>
    </form>
  );
}

export function SignUpForm({ next }: { next?: string }) {
  const [state, action] = useActionState(signUp, null);
  if (state?.ok) return <Feedback state={state} />;
  return (
    <form action={action} className="space-y-4" noValidate>
      {next && <input type="hidden" name="next" value={next} />}
      <Feedback state={state} />
      <Field label="Tu nombre" htmlFor="fullName" error={err(state, "fullName")}>
        <Input id="fullName" name="fullName" autoComplete="name" required placeholder="Nombre y apellido" />
      </Field>
      <Field label="Correo electrónico" htmlFor="email" error={err(state, "email")}>
        <Input id="email" name="email" type="email" autoComplete="email" required placeholder="tu@negocio.com" />
      </Field>
      <Field label="Contraseña" htmlFor="password" error={err(state, "password")} hint="Mínimo 8 caracteres.">
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} />
      </Field>
      <SubmitButton className="w-full" pendingText="Creando cuenta...">
        Crear cuenta gratis
      </SubmitButton>
      <p className="text-center text-xs text-slate-500">Prueba gratuita de 14 días. No pedimos tarjeta.</p>
    </form>
  );
}

export function ResetRequestForm() {
  const [state, action] = useActionState(requestPasswordReset, null);
  return (
    <form action={action} className="space-y-4" noValidate>
      <Feedback state={state} />
      <Field label="Correo electrónico" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      <SubmitButton className="w-full" pendingText="Enviando...">
        Enviar enlace
      </SubmitButton>
    </form>
  );
}

export function UpdatePasswordForm() {
  const [state, action] = useActionState(updatePassword, null);
  return (
    <form action={action} className="space-y-4" noValidate>
      <Feedback state={state} />
      <Field label="Nueva contraseña" htmlFor="password" hint="Mínimo 8 caracteres.">
        <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={8} />
      </Field>
      <Field label="Repetir contraseña" htmlFor="confirm">
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required minLength={8} />
      </Field>
      <SubmitButton className="w-full" pendingText="Guardando...">
        Guardar contraseña
      </SubmitButton>
    </form>
  );
}
