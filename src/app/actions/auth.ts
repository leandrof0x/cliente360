"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { publicEnv } from "@/lib/env";
import { emailSchema, fieldErrors, passwordSchema, safeNext, signInSchema, signUpSchema } from "@/lib/validation";
import type { ActionResult } from "@/lib/types";

async function siteUrl() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : publicEnv.siteUrl;
}

function authErrorMessage(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login")) return "Correo o contraseña incorrectos.";
  if (m.includes("email not confirmed")) return "Confirmá tu correo antes de ingresar. Revisá tu bandeja de entrada.";
  if (m.includes("already registered") || m.includes("already been registered")) return "Ya existe una cuenta con ese correo.";
  if (m.includes("rate limit") || m.includes("too many")) return "Demasiados intentos. Esperá unos minutos e intentá de nuevo.";
  if (m.includes("weak") || m.includes("password")) return "La contraseña no cumple los requisitos de seguridad.";
  return "No se pudo completar la operación. Intentá de nuevo.";
}

export async function signIn(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = signInSchema.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { ok: false, error: "Revisá los datos ingresados.", fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { ok: false, error: authErrorMessage(error.message) };

  redirect(safeNext(formData.get("next")));
}

export async function signUp(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = signUpSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { ok: false, error: "Revisá los datos ingresados.", fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName },
      emailRedirectTo: `${await siteUrl()}/auth/callback?next=${encodeURIComponent(safeNext(formData.get("next"), "/onboarding"))}`,
    },
  });
  if (error) return { ok: false, error: authErrorMessage(error.message) };

  // Si la confirmación por correo está desactivada, ya hay sesión.
  if (data.session) redirect(safeNext(formData.get("next"), "/onboarding"));
  return {
    ok: true,
    message: `Te enviamos un correo a ${parsed.data.email}. Abrí el enlace para confirmar tu cuenta.`,
  };
}

export async function requestPasswordReset(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) return { ok: false, error: "Ingresá un correo válido." };
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${await siteUrl()}/auth/callback?next=/actualizar-clave`,
  });
  // Mismo mensaje exista o no la cuenta (evita enumerar usuarios)
  return { ok: true, message: "Si el correo está registrado, vas a recibir un enlace para crear una nueva contraseña." };
}

export async function updatePassword(_: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const parsed = passwordSchema.safeParse(formData.get("password"));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Contraseña inválida" };
  if (formData.get("password") !== formData.get("confirm")) return { ok: false, error: "Las contraseñas no coinciden." };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data });
  if (error) return { ok: false, error: authErrorMessage(error.message) };
  redirect("/dashboard");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/ingresar");
}
