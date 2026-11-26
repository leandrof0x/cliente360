import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getMemberOptions } from "@/lib/members";
import { LEAD_STATUS_LABEL, TASK_TYPE_LABELS } from "@/lib/constants";
import type { LeadStatus, TaskType } from "@/lib/types";
import { exportDate, exportDateTime, type ExportColumn } from "@/lib/export";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export interface ReportSummary {
  new_customers: number;
  buying_customers: number;
  recurring_customers: number;
  inquiries: number;
  inbound_messages: number;
  won_count: number;
  won_value: number;
  avg_ticket: number | null;
  lost_count: number;
  lost_value: number;
  close_rate: number | null;
  inquiry_conversion: number | null;
  tasks_done: number;
  tasks_done_on_time: number;
  tasks_pending: number;
  tasks_overdue: number;
}

export interface SellerRow {
  user_id: string | null;
  name: string;
  leads_received: number;
  won_count: number;
  won_value: number;
  lost_count: number;
  tasks_done: number;
  tasks_pending: number;
  tasks_overdue: number;
}

export interface ReportData {
  summary: ReportSummary;
  sellers: SellerRow[];
  sources: { source: string; new_customers: number; won_count: number; won_value: number }[];
  lost_reasons: { reason: string; count: number; value: number }[];
}

export async function loadReport(supabase: Supabase, orgId: string, from: Date, to: Date): Promise<{ data: ReportData | null; error: string | null }> {
  const [{ data, error }, members] = await Promise.all([
    supabase.rpc("report_data", { p_org: orgId, p_from: from.toISOString(), p_to: to.toISOString() }),
    getMemberOptions(orgId),
  ]);
  if (error || !data) return { data: null, error: error?.message ?? "Sin datos" };
  const names = new Map(members.map((m) => [m.id, m.name]));
  const raw = data as Omit<ReportData, "sellers"> & { sellers: Omit<SellerRow, "name">[] };
  return {
    data: {
      ...raw,
      sellers: raw.sellers.map((s) => ({ ...s, name: s.user_id ? (names.get(s.user_id) ?? "Ex miembro") : "Sin asignar" })),
    },
    error: null,
  };
}

/** Lee todas las filas paginando (PostgREST devuelve hasta 1000 por pedido). */
async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>, max = 20000): Promise<T[]> {
  const out: T[] = [];
  const page = 1000;
  for (let start = 0; start < max; start += page) {
    const { data, error } = await build(start, start + page - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < page) break;
  }
  return out;
}

export type ExportKind = "clientes" | "oportunidades" | "tareas";
export const EXPORT_KINDS: { id: ExportKind; label: string; usesRange: boolean }[] = [
  { id: "clientes", label: "Clientes", usesRange: false },
  { id: "oportunidades", label: "Oportunidades", usesRange: true },
  { id: "tareas", label: "Seguimientos y tareas", usesRange: true },
];

export interface Dataset {
  sheet: string;
  columns: ExportColumn<Record<string, unknown>>[];
  rows: Record<string, unknown>[];
}

const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));
const n = (v: unknown) => (typeof v === "number" ? v : v === null || v === undefined ? null : Number(v));

export async function loadDataset(supabase: Supabase, orgId: string, kind: ExportKind, from: Date, to: Date): Promise<Dataset> {
  const members = await getMemberOptions(orgId);
  const who = (id: unknown) => (id ? (members.find((m) => m.id === id)?.name ?? "Ex miembro") : "");
  const fromIso = from.toISOString();
  const toIso = to.toISOString();

  if (kind === "clientes") {
    const rows = await fetchAll<Record<string, unknown>>((a, b) =>
      supabase
        .from("customer_overview")
        .select("full_name, company, phone, whatsapp, email, customer_type, source, status, tags, registered_at, last_contact_at, assigned_to, won_count, won_value, open_leads, is_recurring, notes")
        .eq("organization_id", orgId)
        .order("full_name")
        .range(a, b),
    );
    return {
      sheet: "Clientes",
      rows,
      columns: [
        { header: "Nombre", value: (r) => s(r.full_name), width: 28 },
        { header: "Empresa", value: (r) => s(r.company), width: 22 },
        { header: "Teléfono", value: (r) => s(r.phone), width: 16 },
        { header: "WhatsApp", value: (r) => s(r.whatsapp), width: 16 },
        { header: "Email", value: (r) => s(r.email), width: 26 },
        { header: "Tipo", value: (r) => s(r.customer_type), width: 14 },
        { header: "Fuente", value: (r) => s(r.source), width: 16 },
        { header: "Estado", value: (r) => s(r.status), width: 10 },
        { header: "Etiquetas", value: (r) => (Array.isArray(r.tags) ? r.tags.join(", ") : ""), width: 20 },
        { header: "Fecha de registro", value: (r) => exportDate(r.registered_at as string), width: 14, kind: "date" },
        { header: "Último contacto", value: (r) => exportDateTime(r.last_contact_at as string), width: 17, kind: "date" },
        { header: "Responsable", value: (r) => who(r.assigned_to), width: 20 },
        { header: "Compras ganadas", value: (r) => n(r.won_count), width: 10, kind: "number" },
        { header: "Monto comprado (Gs.)", value: (r) => n(r.won_value), width: 16, kind: "money" },
        { header: "Oportunidades abiertas", value: (r) => n(r.open_leads), width: 10, kind: "number" },
        { header: "Recurrente", value: (r) => Boolean(r.is_recurring), width: 10 },
        { header: "Notas", value: (r) => s(r.notes), width: 40 },
      ],
    };
  }

  if (kind === "oportunidades") {
    const rows = await fetchAll<Record<string, unknown>>((a, b) =>
      supabase
        .from("leads")
        .select("title, product_service, estimated_value, status, entered_at, created_at, next_action, next_follow_up_at, won_at, lost_at, lost_reason, assigned_to, customers(full_name)")
        .eq("organization_id", orgId)
        .gte("created_at", fromIso)
        .lt("created_at", toIso)
        .order("created_at", { ascending: false })
        .range(a, b),
    );
    const cust = (r: Record<string, unknown>) => {
      const c = Array.isArray(r.customers) ? r.customers[0] : r.customers;
      return s((c as { full_name?: string } | null)?.full_name);
    };
    return {
      sheet: "Oportunidades",
      rows,
      columns: [
        { header: "Oportunidad", value: (r) => s(r.title), width: 30 },
        { header: "Cliente", value: cust, width: 26 },
        { header: "Producto o servicio", value: (r) => s(r.product_service), width: 22 },
        { header: "Valor estimado (Gs.)", value: (r) => n(r.estimated_value), width: 16, kind: "money" },
        { header: "Estado", value: (r) => LEAD_STATUS_LABEL[r.status as LeadStatus] ?? s(r.status), width: 20 },
        { header: "Responsable", value: (r) => who(r.assigned_to), width: 20 },
        { header: "Fecha de ingreso", value: (r) => exportDate(r.entered_at as string), width: 14, kind: "date" },
        { header: "Próxima acción", value: (r) => s(r.next_action), width: 28 },
        { header: "Próximo seguimiento", value: (r) => exportDateTime(r.next_follow_up_at as string), width: 17, kind: "date" },
        { header: "Ganada el", value: (r) => exportDate(r.won_at as string), width: 12, kind: "date" },
        { header: "Perdida el", value: (r) => exportDate(r.lost_at as string), width: 12, kind: "date" },
        { header: "Motivo de pérdida", value: (r) => s(r.lost_reason), width: 24 },
      ],
    };
  }

  const rows = await fetchAll<Record<string, unknown>>((a, b) =>
    supabase
      .from("tasks")
      .select("title, type, priority, status, due_at, completed_at, assigned_to, source, customers(full_name), leads(title)")
      .eq("organization_id", orgId)
      .neq("status", "cancelada")
      .or(`and(due_at.gte.${fromIso},due_at.lt.${toIso}),and(completed_at.gte.${fromIso},completed_at.lt.${toIso})`)
      .order("due_at", { ascending: true, nullsFirst: false })
      .range(a, b),
  );
  const rel = (v: unknown, key: string) => s(((Array.isArray(v) ? v[0] : v) as Record<string, unknown> | null)?.[key]);
  return {
    sheet: "Seguimientos",
    rows,
    columns: [
      { header: "Tarea", value: (r) => s(r.title), width: 32 },
      { header: "Tipo", value: (r) => TASK_TYPE_LABELS[r.type as TaskType] ?? s(r.type), width: 14 },
      { header: "Prioridad", value: (r) => s(r.priority), width: 10 },
      {
        header: "Estado",
        value: (r) => (r.status === "pendiente" && r.due_at && new Date(r.due_at as string) < new Date() ? "vencida" : s(r.status)),
        width: 12,
      },
      { header: "Vence", value: (r) => exportDateTime(r.due_at as string), width: 17, kind: "date" },
      { header: "Completada", value: (r) => exportDateTime(r.completed_at as string), width: 17, kind: "date" },
      {
        header: "A tiempo",
        value: (r) => (r.completed_at ? (!r.due_at || new Date(r.completed_at as string) <= new Date(r.due_at as string) ? "Sí" : "No") : ""),
        width: 9,
      },
      { header: "Cliente", value: (r) => rel(r.customers, "full_name"), width: 24 },
      { header: "Oportunidad", value: (r) => rel(r.leads, "title"), width: 26 },
      { header: "Responsable", value: (r) => who(r.assigned_to), width: 20 },
      { header: "Origen", value: (r) => ({ manual: "Manual", lead_follow_up: "Seguimiento de oportunidad", automation: "Automatización" })[s(r.source)] ?? s(r.source), width: 18 },
    ],
  };
}

/** Hojas del reporte comercial para Excel/CSV. */
export function reportDatasets(r: ReportData): Dataset[] {
  const pct = (v: number | null) => (v === null ? "Sin datos" : `${String(v).replace(".", ",")}%`);
  const sm = r.summary;
  const summaryRows: Record<string, unknown>[] = [
    ["Clientes nuevos", sm.new_customers],
    ["Clientes que compraron", sm.buying_customers],
    ["Clientes recurrentes", sm.recurring_customers],
    ["Consultas recibidas (oportunidades)", sm.inquiries],
    ["Mensajes entrantes registrados", sm.inbound_messages],
    ["Ventas ganadas", sm.won_count],
    ["Monto vendido (Gs.)", sm.won_value],
    ["Ticket promedio (Gs.)", sm.avg_ticket ?? "Sin datos"],
    ["Oportunidades perdidas", sm.lost_count],
    ["Monto perdido (Gs.)", sm.lost_value],
    ["Tasa de cierre (ganadas / cerradas)", pct(sm.close_rate)],
    ["Conversión de consultas del período", pct(sm.inquiry_conversion)],
    ["Seguimientos realizados", sm.tasks_done],
    ["Seguimientos realizados a tiempo", sm.tasks_done_on_time],
    ["Seguimientos pendientes", sm.tasks_pending],
    ["Seguimientos vencidos", sm.tasks_overdue],
  ].map(([k, v]) => ({ k, v }));
  return [
    {
      sheet: "Resumen",
      rows: summaryRows,
      columns: [
        { header: "Indicador", value: (x) => s(x.k), width: 38 },
        { header: "Valor", value: (x) => x.v as string | number, width: 18, kind: "number" },
      ],
    },
    {
      sheet: "Vendedores",
      rows: r.sellers as unknown as Record<string, unknown>[],
      columns: [
        { header: "Vendedor", value: (x) => s(x.name), width: 26 },
        { header: "Consultas asignadas", value: (x) => n(x.leads_received), width: 12, kind: "number" },
        { header: "Ventas ganadas", value: (x) => n(x.won_count), width: 12, kind: "number" },
        { header: "Monto vendido (Gs.)", value: (x) => n(x.won_value), width: 16, kind: "money" },
        { header: "Perdidas", value: (x) => n(x.lost_count), width: 10, kind: "number" },
        { header: "Seguimientos realizados", value: (x) => n(x.tasks_done), width: 12, kind: "number" },
        { header: "Seguimientos pendientes", value: (x) => n(x.tasks_pending), width: 12, kind: "number" },
        { header: "Vencidos", value: (x) => n(x.tasks_overdue), width: 10, kind: "number" },
      ],
    },
    {
      sheet: "Fuentes",
      rows: r.sources as unknown as Record<string, unknown>[],
      columns: [
        { header: "Fuente", value: (x) => s(x.source), width: 22 },
        { header: "Clientes nuevos", value: (x) => n(x.new_customers), width: 12, kind: "number" },
        { header: "Ventas ganadas", value: (x) => n(x.won_count), width: 12, kind: "number" },
        { header: "Monto vendido (Gs.)", value: (x) => n(x.won_value), width: 16, kind: "money" },
      ],
    },
    {
      sheet: "Motivos de pérdida",
      rows: r.lost_reasons as unknown as Record<string, unknown>[],
      columns: [
        { header: "Motivo", value: (x) => s(x.reason), width: 30 },
        { header: "Oportunidades", value: (x) => n(x.count), width: 12, kind: "number" },
        { header: "Monto (Gs.)", value: (x) => n(x.value), width: 16, kind: "money" },
      ],
    },
  ];
}
