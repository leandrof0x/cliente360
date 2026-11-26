import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getMemberOptions } from "@/lib/members";
import { canManage, type OrgContext } from "@/lib/session";
import { LEAD_STATUS_LABEL } from "@/lib/constants";
import { INTERACTION_TYPE_LABELS } from "@/lib/crm";
import { formatGs } from "@/lib/utils";
import type { LeadStatus } from "@/lib/types";
import { clip, daysSince, pyDate, pyDateTime } from "./prompts";

/**
 * Todas las consultas usan la sesión de la persona (RLS): el asistente solo
 * puede ver lo que esa persona puede ver en CLIENTE360. No se envían teléfonos
 * ni correos al proveedor de IA porque no hacen falta para estas tareas.
 */
type Supabase = Awaited<ReturnType<typeof createClient>>;

const statusLabel = (s: string) => LEAD_STATUS_LABEL[s as LeadStatus] ?? s;
const isOpen = (s: string) => s !== "ganado" && s !== "perdido";

async function names(orgId: string) {
  const members = await getMemberOptions(orgId);
  const map = new Map(members.map((m) => [m.id, m.name]));
  return (id: string | null | undefined) => (id ? (map.get(id) ?? "Ex miembro") : "Sin asignar");
}

function interactionRow(i: { type: string; direction: string; content: string; occurred_at: string }) {
  return {
    fecha: pyDateTime(i.occurred_at),
    tipo: INTERACTION_TYPE_LABELS[i.type as keyof typeof INTERACTION_TYPE_LABELS] ?? i.type,
    direccion: i.direction,
    contenido: clip(i.content, 600),
  };
}

function taskRow(t: { title: string; due_at: string | null; priority: string; status: string }, who?: string) {
  const overdue = t.status === "pendiente" && t.due_at && new Date(t.due_at) < new Date();
  return { tarea: t.title, vence: pyDateTime(t.due_at), prioridad: t.priority, estado: overdue ? "vencida" : t.status, responsable: who };
}

export async function customerData(supabase: Supabase, ctx: OrgContext, customerId: string) {
  const { data: c } = await supabase
    .from("customer_overview")
    .select("id, full_name, company, customer_type, source, status, tags, notes, registered_at, last_contact_at, assigned_to, won_count, won_value, open_leads, is_recurring")
    .eq("id", customerId)
    .eq("organization_id", ctx.org.id)
    .maybeSingle();
  if (!c) return null;
  const who = await names(ctx.org.id);
  const [{ data: leads }, { data: interactions }, { data: tasks }] = await Promise.all([
    supabase.from("leads").select("title, product_service, estimated_value, status, next_action, next_follow_up_at, won_at, lost_at, lost_reason, created_at, assigned_to").eq("customer_id", customerId).order("created_at", { ascending: false }).limit(15),
    supabase.from("interactions").select("type, direction, content, occurred_at").eq("customer_id", customerId).order("occurred_at", { ascending: false }).limit(15),
    supabase.from("tasks").select("title, due_at, priority, status, assigned_to").eq("customer_id", customerId).eq("status", "pendiente").order("due_at", { ascending: true, nullsFirst: false }).limit(10),
  ]);
  return {
    negocio: ctx.org.name,
    cliente: {
      nombre: c.full_name,
      empresa: c.company,
      tipo: c.customer_type,
      fuente: c.source,
      estado: c.status,
      etiquetas: c.tags,
      notas: clip(c.notes, 1200),
      registrado: pyDate(c.registered_at),
      ultimo_contacto: pyDateTime(c.last_contact_at) ?? "sin contacto registrado",
      dias_sin_contacto: daysSince(c.last_contact_at),
      responsable: who(c.assigned_to),
      compras_ganadas: c.won_count,
      monto_comprado: formatGs(c.won_value),
      cliente_recurrente: c.is_recurring,
    },
    lista_oportunidades: (leads ?? []).map((l) => ({
      titulo: l.title,
      producto: l.product_service,
      valor: formatGs(l.estimated_value),
      estado: statusLabel(l.status),
      proxima_accion: l.next_action,
      proximo_seguimiento: pyDateTime(l.next_follow_up_at),
      ganada: pyDate(l.won_at),
      perdida: pyDate(l.lost_at),
      motivo_perdida: l.lost_reason,
      creada: pyDate(l.created_at),
      responsable: who(l.assigned_to),
    })),
    lista_interacciones_recientes: (interactions ?? []).map(interactionRow),
    lista_tareas_pendientes: (tasks ?? []).map((t) => taskRow(t, who(t.assigned_to))),
  };
}

export async function leadData(supabase: Supabase, ctx: OrgContext, leadId: string) {
  const { data: l } = await supabase
    .from("leads")
    .select("id, customer_id, title, description, product_service, estimated_value, status, next_action, next_follow_up_at, entered_at, created_at, updated_at, won_at, lost_at, lost_reason, assigned_to, customers(full_name, company, source, notes, last_contact_at)")
    .eq("id", leadId)
    .eq("organization_id", ctx.org.id)
    .maybeSingle();
  if (!l) return null;
  const who = await names(ctx.org.id);
  const cust = (Array.isArray(l.customers) ? l.customers[0] : l.customers) as
    | { full_name: string; company: string | null; source: string | null; notes: string | null; last_contact_at: string | null }
    | null;
  const [{ data: history }, { data: interactions }, { data: tasks }, { data: others }] = await Promise.all([
    supabase.from("lead_status_changes").select("from_status, to_status, changed_at").eq("lead_id", leadId).order("changed_at", { ascending: true }).limit(30),
    supabase.from("interactions").select("type, direction, content, occurred_at").eq("customer_id", l.customer_id).order("occurred_at", { ascending: false }).limit(15),
    supabase.from("tasks").select("title, due_at, priority, status, assigned_to").eq("lead_id", leadId).neq("status", "cancelada").order("due_at", { ascending: false, nullsFirst: false }).limit(10),
    supabase.from("leads").select("title, status, estimated_value").eq("customer_id", l.customer_id).neq("id", leadId).limit(10),
  ]);
  const lastChange = (history ?? []).at(-1)?.changed_at ?? l.created_at;
  return {
    negocio: ctx.org.name,
    oportunidad: {
      titulo: l.title,
      descripcion: clip(l.description, 1200),
      producto: l.product_service,
      valor: formatGs(l.estimated_value),
      estado: statusLabel(l.status),
      dias_en_esta_etapa: daysSince(lastChange),
      ingreso: pyDate(l.entered_at),
      proxima_accion: l.next_action,
      proximo_seguimiento: pyDateTime(l.next_follow_up_at) ?? "sin seguimiento programado",
      seguimiento_vencido: Boolean(isOpen(l.status) && l.next_follow_up_at && new Date(l.next_follow_up_at) < new Date()),
      ganada: pyDate(l.won_at),
      perdida: pyDate(l.lost_at),
      motivo_perdida: l.lost_reason,
      responsable: who(l.assigned_to),
    },
    cliente: cust && {
      nombre: cust.full_name,
      empresa: cust.company,
      fuente: cust.source,
      notas: clip(cust.notes, 800),
      ultimo_contacto: pyDateTime(cust.last_contact_at) ?? "sin contacto registrado",
    },
    lista_cambios_de_estado: (history ?? []).map((h) => ({
      fecha: pyDateTime(h.changed_at),
      de: h.from_status ? statusLabel(h.from_status) : "(alta)",
      a: statusLabel(h.to_status),
    })),
    lista_interacciones_recientes: (interactions ?? []).map(interactionRow),
    lista_tareas: (tasks ?? []).map((t) => taskRow(t, who(t.assigned_to))),
    otras_oportunidades_del_cliente: (others ?? []).map((o) => ({ titulo: o.title, estado: statusLabel(o.status), valor: formatGs(o.estimated_value) })),
  };
}

/**
 * Oportunidades abiertas sin seguimiento, con seguimiento vencido o quietas.
 * Vendedores y colaboradores ven solo las asignadas a ellos (y las sin asignar).
 */
export async function staleLeadsData(supabase: Supabase, ctx: OrgContext) {
  const who = await names(ctx.org.id);
  const staleBefore = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const nowIso = new Date().toISOString();
  let q = supabase
    .from("leads")
    .select("title, product_service, estimated_value, status, next_action, next_follow_up_at, updated_at, created_at, assigned_to, customers(full_name, last_contact_at)")
    .eq("organization_id", ctx.org.id)
    .not("status", "in", "(ganado,perdido)")
    .or(`next_follow_up_at.is.null,next_follow_up_at.lt.${nowIso},updated_at.lt.${staleBefore}`)
    .order("estimated_value", { ascending: false })
    .limit(40);
  const scoped = !canManage(ctx.role);
  if (scoped) q = q.or(`assigned_to.eq.${ctx.user.id},assigned_to.is.null`);
  const { data } = await q;
  return {
    negocio: ctx.org.name,
    alcance: scoped ? "Solo oportunidades asignadas a quien consulta o sin asignar" : "Todas las oportunidades de la empresa",
    criterio: "Abiertas y sin seguimiento programado, con el seguimiento vencido, o sin cambios hace 7 días o más",
    lista_oportunidades: (data ?? []).map((l) => {
      const c = (Array.isArray(l.customers) ? l.customers[0] : l.customers) as { full_name: string; last_contact_at: string | null } | null;
      return {
        oportunidad: l.title,
        cliente: c?.full_name,
        producto: l.product_service,
        valor: formatGs(l.estimated_value),
        estado: statusLabel(l.status),
        proxima_accion: l.next_action,
        seguimiento: l.next_follow_up_at ? `${pyDateTime(l.next_follow_up_at)}${new Date(l.next_follow_up_at) < new Date() ? " (vencido)" : ""}` : "sin programar",
        dias_sin_cambios: daysSince(l.updated_at),
        dias_desde_ultimo_contacto: daysSince(c?.last_contact_at),
        responsable: who(l.assigned_to),
      };
    }),
  };
}

function money(obj: Record<string, unknown>, keys: string[]) {
  const out = { ...obj };
  for (const k of keys) if (typeof out[k] === "number") out[k] = formatGs(out[k] as number);
  return out;
}

/** Datos del reporte comercial (requiere rol de gestión; la base lo vuelve a verificar). */
export async function reportData(supabase: Supabase, ctx: OrgContext, from: Date, to: Date, label: string) {
  const who = await names(ctx.org.id);
  const [{ data: report, error }, { data: dash }] = await Promise.all([
    supabase.rpc("report_data", { p_org: ctx.org.id, p_from: from.toISOString(), p_to: to.toISOString() }),
    supabase.rpc("dashboard_data", { p_org: ctx.org.id, p_from: from.toISOString(), p_to: to.toISOString(), p_no_contact_days: 15 }),
  ]);
  const r = report as null | {
    summary: Record<string, unknown>;
    sellers: Record<string, unknown>[];
    sources: Record<string, unknown>[];
    lost_reasons: Record<string, unknown>[];
  };
  const d = dash as null | { kpis: Record<string, unknown>; funnel: { status: string; count: number }[] };
  return {
    negocio: ctx.org.name,
    periodo: label,
    reportes_del_plan: error ? "no disponibles en el plan actual: solo hay indicadores generales" : "disponibles",
    resumen: r ? money(r.summary, ["won_value", "avg_ticket", "lost_value"]) : undefined,
    indicadores_generales: d ? money(d.kpis, ["open_value", "won_value"]) : undefined,
    lista_embudo_actual: (d?.funnel ?? []).map((f) => ({ etapa: statusLabel(f.status), oportunidades: f.count })),
    lista_rendimiento_por_vendedor: (r?.sellers ?? []).map((s) => ({ ...money(s, ["won_value"]), user_id: undefined, vendedor: who(s.user_id as string | null) })),
    lista_fuentes: (r?.sources ?? []).map((s) => money(s, ["won_value"])),
    lista_motivos_de_perdida: (r?.lost_reasons ?? []).map((s) => money(s, ["value"])),
  };
}

/** Panorama general para la consulta libre. */
export async function overviewData(supabase: Supabase, ctx: OrgContext) {
  const who = await names(ctx.org.id);
  const to = new Date();
  const from = new Date(to.getTime() - 30 * 86_400_000);
  const scoped = !canManage(ctx.role);
  let leadsQ = supabase
    .from("leads")
    .select("title, estimated_value, status, next_follow_up_at, assigned_to, customers(full_name)")
    .eq("organization_id", ctx.org.id)
    .not("status", "in", "(ganado,perdido)")
    .order("estimated_value", { ascending: false })
    .limit(20);
  let tasksQ = supabase
    .from("tasks")
    .select("title, due_at, priority, status, assigned_to")
    .eq("organization_id", ctx.org.id)
    .eq("status", "pendiente")
    .order("due_at", { ascending: true, nullsFirst: false })
    .limit(20);
  if (scoped) {
    leadsQ = leadsQ.or(`assigned_to.eq.${ctx.user.id},assigned_to.is.null`);
    tasksQ = tasksQ.or(`assigned_to.eq.${ctx.user.id},assigned_to.is.null`);
  }
  const [{ data: dash }, { data: leads }, { data: tasks }, { data: recent }] = await Promise.all([
    supabase.rpc("dashboard_data", { p_org: ctx.org.id, p_from: from.toISOString(), p_to: to.toISOString(), p_no_contact_days: 15 }),
    leadsQ,
    tasksQ,
    supabase.from("leads").select("title, estimated_value, status, won_at, lost_at, lost_reason, customers(full_name)").eq("organization_id", ctx.org.id).in("status", ["ganado", "perdido"]).order("updated_at", { ascending: false }).limit(10),
  ]);
  const d = dash as null | { kpis: Record<string, unknown>; funnel: { status: string; count: number }[] };
  const custName = (c: unknown) => ((Array.isArray(c) ? c[0] : c) as { full_name?: string } | null)?.full_name;
  return {
    negocio: ctx.org.name,
    alcance_listas: scoped ? "Oportunidades y tareas asignadas a quien consulta o sin asignar" : "Toda la empresa",
    indicadores_ultimos_30_dias: d ? money(d.kpis, ["open_value", "won_value"]) : undefined,
    lista_embudo_actual: (d?.funnel ?? []).map((f) => ({ etapa: statusLabel(f.status), oportunidades: f.count })),
    lista_oportunidades_abiertas_mayor_valor: (leads ?? []).map((l) => ({
      oportunidad: l.title,
      cliente: custName(l.customers),
      valor: formatGs(l.estimated_value),
      estado: statusLabel(l.status),
      seguimiento: pyDateTime(l.next_follow_up_at) ?? "sin programar",
      responsable: who(l.assigned_to),
    })),
    lista_tareas_pendientes: (tasks ?? []).map((t) => taskRow(t, who(t.assigned_to))),
    lista_cierres_recientes: (recent ?? []).map((l) => ({
      oportunidad: l.title,
      cliente: custName(l.customers),
      valor: formatGs(l.estimated_value),
      resultado: statusLabel(l.status),
      fecha: pyDate(l.won_at ?? l.lost_at),
      motivo_perdida: l.lost_reason,
    })),
  };
}
