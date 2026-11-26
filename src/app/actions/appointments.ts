"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getOrgContext } from "@/lib/session";
import { formFields, pyLocalToIso } from "@/lib/crm";
import { fieldErrors } from "@/lib/validation";
import { friendlyDbError } from "@/lib/utils";
import type { ActionResult } from "@/lib/types";

const nullableUuid = z.string().optional().transform((v) => (v ? v : null)).pipe(z.string().uuid().nullable());

const schema = z
  .object({
    title: z.string().trim().min(1, "Poné un título").max(200),
    type: z.enum(["reunion", "reserva", "llamada", "seguimiento", "otro"]),
    status: z.enum(["programada", "realizada", "cancelada", "no_asistio"]).default("programada"),
    starts_at: z.string().min(1, "Indicá el inicio"),
    ends_at: z.string().min(1, "Indicá el fin"),
    location: z.string().trim().max(200).optional().transform((v) => v || null),
    notes: z.string().trim().max(2000).optional().transform((v) => v || null),
    customer_id: nullableUuid,
    assigned_to: nullableUuid,
  })
  .transform((v, ctx) => {
    const s = pyLocalToIso(v.starts_at);
    const e = pyLocalToIso(v.ends_at);
    if (!s) ctx.addIssue({ code: "custom", path: ["starts_at"], message: "Fecha inválida" });
    if (!e) ctx.addIssue({ code: "custom", path: ["ends_at"], message: "Fecha inválida" });
    if (s && e && e < s) ctx.addIssue({ code: "custom", path: ["ends_at"], message: "El fin debe ser posterior al inicio" });
    return { ...v, starts_at: s!, ends_at: e! };
  });

export async function saveAppointment(id: string | null, _: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const ctx = await getOrgContext();
  if (!ctx.writable) return { ok: false, error: "Tu cuenta está en modo solo lectura." };
  const parsed = schema.safeParse(
    formFields(formData, ["title", "type", "status", "starts_at", "ends_at", "location", "notes", "customer_id", "assigned_to"]),
  );
  if (!parsed.success) return { ok: false, error: "Revisá los campos.", fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("appointments").update(parsed.data).eq("id", id).eq("organization_id", ctx.org.id)
    : await supabase.from("appointments").insert({ ...parsed.data, organization_id: ctx.org.id });
  if (error) return { ok: false, error: friendlyDbError(error) };

  // Una reunión o llamada realizada queda en el historial del cliente
  if (id && parsed.data.status === "realizada" && parsed.data.customer_id) {
    const { data: already } = await supabase
      .from("interactions")
      .select("id")
      .eq("organization_id", ctx.org.id)
      .eq("channel_message_id", `appointment:${id}`)
      .maybeSingle();
    if (!already) {
      await supabase.from("interactions").insert({
        organization_id: ctx.org.id,
        customer_id: parsed.data.customer_id,
        type: parsed.data.type === "llamada" ? "llamada" : "reunion",
        direction: "saliente",
        content: `${parsed.data.title}${parsed.data.notes ? ` — ${parsed.data.notes}` : ""}`.slice(0, 5000),
        occurred_at: parsed.data.starts_at,
        channel_message_id: `appointment:${id}`,
      });
    }
  }
  revalidatePath("/agenda");
  if (parsed.data.customer_id) revalidatePath(`/clientes/${parsed.data.customer_id}`);
  return { ok: true, message: id ? "Cita actualizada." : "Cita agendada." };
}

export async function deleteAppointment(id: string): Promise<ActionResult> {
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Cita inválida." };
  const ctx = await getOrgContext();
  const supabase = await createClient();
  const { data, error } = await supabase.from("appointments").delete().eq("id", id).eq("organization_id", ctx.org.id).select("id");
  if (error) return { ok: false, error: friendlyDbError(error) };
  if (!data?.length) return { ok: false, error: "No tenés permiso para eliminar esta cita." };
  revalidatePath("/agenda");
  return { ok: true };
}
