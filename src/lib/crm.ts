import { z } from "zod";

export const CUSTOMER_SOURCES = [
  "WhatsApp",
  "Instagram",
  "Facebook",
  "TikTok",
  "Google",
  "Sitio web",
  "Referido",
  "Local / presencial",
  "Llamada",
  "Otro",
];
export const CUSTOMER_TYPES = ["Particular", "Empresa", "Revendedor", "Otro"];
export const CUSTOMER_STATUS_LABELS = { nuevo: "Nuevo", activo: "Activo", inactivo: "Inactivo" } as const;
export type CustomerStatus = keyof typeof CUSTOMER_STATUS_LABELS;

export const INTERACTION_TYPE_LABELS = {
  nota: "Nota",
  llamada: "Llamada",
  whatsapp: "WhatsApp",
  email: "Correo",
  reunion: "Reunión",
  visita: "Visita",
  otro: "Otro",
} as const;
export type InteractionType = keyof typeof INTERACTION_TYPE_LABELS;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres`)
    .optional()
    .transform((v) => (v ? v : null));

const phone = z
  .string()
  .trim()
  .max(30)
  .regex(/^[+\d\s()-]*$/, "Solo números, espacios, + y guiones")
  .optional()
  .transform((v) => (v ? v : null));

const uuidOrNull = z
  .string()
  .optional()
  .transform((v) => (v ? v : null))
  .pipe(z.string().uuid("Valor inválido").nullable());

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida");

export const customerSchema = z.object({
  full_name: z.string().trim().min(1, "Ingresá el nombre").max(160),
  phone,
  whatsapp: phone,
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254)
    .optional()
    .transform((v) => (v ? v : null))
    .pipe(z.string().email("Correo inválido").nullable()),
  company: optionalText(160),
  customer_type: optionalText(60),
  source: optionalText(60),
  registered_at: dateStr.optional(),
  status: z.enum(["nuevo", "activo", "inactivo"]).default("nuevo"),
  tags: z
    .string()
    .optional()
    .transform((v) =>
      [...new Set((v ?? "").split(",").map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 15),
    )
    .pipe(z.array(z.string().max(30, "Cada etiqueta: máximo 30 caracteres"))),
  notes: optionalText(5000),
  assigned_to: uuidOrNull,
});
export type CustomerInput = z.infer<typeof customerSchema>;

export const interactionSchema = z.object({
  customer_id: z.string().uuid(),
  lead_id: uuidOrNull,
  type: z.enum(["nota", "llamada", "whatsapp", "email", "reunion", "visita", "otro"]),
  direction: z.enum(["entrante", "saliente", "interna"]),
  content: z.string().trim().min(1, "Escribí el detalle").max(5000),
  occurred_at: z.string().optional(),
});

export const leadSchema = z.object({
  customer_id: z.string().uuid("Elegí un cliente"),
  title: z.string().trim().min(1, "Describí la oportunidad").max(200),
  description: optionalText(5000),
  product_service: optionalText(200),
  estimated_value: z.coerce
    .number({ message: "Valor inválido" })
    .min(0, "No puede ser negativo")
    .max(999_999_999_999, "Valor demasiado alto")
    .transform((v) => Math.round(v)),
  entered_at: dateStr.optional(),
  assigned_to: uuidOrNull,
  status: z.enum(["nueva", "contactado", "interesado", "seguimiento", "negociacion", "ganado", "perdido"]).default("nueva"),
  next_action: optionalText(200),
  next_follow_up_at: z
    .string()
    .optional()
    .transform((v) => (v ? v : null)),
  lost_reason: optionalText(500),
});

export const taskSchema = z.object({
  title: z.string().trim().min(1, "Escribí la tarea").max(200),
  description: optionalText(2000),
  type: z.enum(["seguimiento", "llamada", "tarea", "reunion", "administrativa"]).default("seguimiento"),
  priority: z.enum(["baja", "media", "alta"]).default("media"),
  due_at: z
    .string()
    .optional()
    .transform((v) => (v ? v : null)),
  customer_id: uuidOrNull,
  lead_id: uuidOrNull,
  assigned_to: uuidOrNull,
});

/** Convierte 'YYYY-MM-DDTHH:mm' (input datetime-local, hora de Paraguay) a ISO UTC. */
export function pyLocalToIso(value: string | null): string | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const d = new Date(`${value}:00-03:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** ISO UTC -> 'YYYY-MM-DDTHH:mm' en hora de Paraguay (para inputs datetime-local). */
export function isoToPyLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(new Date(iso).getTime() - 3 * 3600_000);
  return d.toISOString().slice(0, 16);
}

/** Limpia la búsqueda para usarla en filtros de PostgREST. */
export function sanitizeSearch(q: string | undefined): string {
  return (q ?? "").replace(/[%_,()*\\:."']/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

/** Número para wa.me: solo dígitos, con prefijo de Paraguay si es local. */
export function waNumber(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = raw.replace(/\D/g, "");
  if (/^0\d{8,9}$/.test(d)) d = "595" + d.slice(1);
  return d.length >= 8 ? d : null;
}

export function formFields(formData: FormData, keys: string[]): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const k of keys) {
    const v = formData.get(k);
    out[k] = typeof v === "string" ? v : undefined;
  }
  return out;
}
