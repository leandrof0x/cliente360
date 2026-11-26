import type { LeadStatus, OrgRole, SubscriptionStatus, TaskPriority, TaskType } from "./types";

export const APP_NAME = "CLIENTE360";
export const ORG_COOKIE = "c360_org";

export const ROLE_LABELS: Record<OrgRole, string> = {
  owner: "Propietario",
  admin: "Administrador",
  seller: "Vendedor",
  collaborator: "Colaborador",
};

export const LEAD_STATUSES: { id: LeadStatus; label: string; color: string }[] = [
  { id: "nueva", label: "Nueva consulta", color: "#64748b" },
  { id: "contactado", label: "Contactado", color: "#0ea5e9" },
  { id: "interesado", label: "Interesado", color: "#6366f1" },
  { id: "seguimiento", label: "Seguimiento pendiente", color: "#f59e0b" },
  { id: "negociacion", label: "Negociación", color: "#2563eb" },
  { id: "ganado", label: "Venta concretada", color: "#16a34a" },
  { id: "perdido", label: "Perdido", color: "#dc2626" },
];

export const LEAD_STATUS_LABEL = Object.fromEntries(LEAD_STATUSES.map((s) => [s.id, s.label])) as Record<
  LeadStatus,
  string
>;

export const SUBSCRIPTION_STATUS_LABELS: Record<SubscriptionStatus, string> = {
  trialing: "Período de prueba",
  active: "Activa",
  past_due: "Pago pendiente",
  suspended: "Suspendida",
  canceled: "Cancelada",
};

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  seguimiento: "Seguimiento",
  llamada: "Llamada",
  tarea: "Tarea",
  reunion: "Reunión",
  administrativa: "Administrativa",
};

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  baja: "Baja",
  media: "Media",
  alta: "Alta",
};
