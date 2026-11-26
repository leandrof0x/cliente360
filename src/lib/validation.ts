import { z } from "zod";

export const emailSchema = z.string().trim().toLowerCase().email("Ingresá un correo válido").max(254);
export const passwordSchema = z
  .string()
  .min(8, "La contraseña debe tener al menos 8 caracteres")
  .max(72, "La contraseña es demasiado larga");

export const signInSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Ingresá tu contraseña"),
});

export const signUpSchema = z.object({
  fullName: z.string().trim().min(2, "Ingresá tu nombre").max(120),
  email: emailSchema,
  password: passwordSchema,
});

export const organizationSchema = z.object({
  name: z.string().trim().min(2, "El nombre debe tener al menos 2 caracteres").max(120),
  phone: z
    .string()
    .trim()
    .max(30)
    .regex(/^[+\d\s()-]*$/, "Teléfono inválido")
    .optional()
    .or(z.literal("")),
});

export const organizationUpdateSchema = organizationSchema.extend({
  email: emailSchema.optional().or(z.literal("")),
});

/** Evita redirecciones abiertas: solo rutas internas. */
export function safeNext(next: unknown, fallback = "/dashboard"): string {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}

export function fieldErrors(error: z.ZodError) {
  return z.flattenError(error).fieldErrors as Record<string, string[] | undefined>;
}
