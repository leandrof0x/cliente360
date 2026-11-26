export type OrgRole = "owner" | "admin" | "seller" | "collaborator";
export type SubscriptionStatus = "trialing" | "active" | "past_due" | "suspended" | "canceled";
export type LeadStatus =
  | "nueva"
  | "contactado"
  | "interesado"
  | "seguimiento"
  | "negociacion"
  | "ganado"
  | "perdido";
export type TaskType = "seguimiento" | "llamada" | "tarea" | "reunion" | "administrativa";
export type TaskStatus = "pendiente" | "completada" | "cancelada";
export type TaskPriority = "baja" | "media" | "alta";

export interface Plan {
  id: string;
  name: string;
  description: string | null;
  price_gs: number;
  max_users: number;
  max_customers: number | null;
  ai_monthly_requests: number;
  features: Record<string, boolean | string>;
  is_active: boolean;
  sort_order: number;
}

export interface Organization {
  id: string;
  name: string;
  slug: string;
  phone: string | null;
  email: string | null;
  country: string;
  currency: string;
  timezone: string;
  status: "active" | "suspended";
  suspended_reason: string | null;
  created_at: string;
}

export interface Subscription {
  id: string;
  organization_id: string;
  plan_id: string;
  status: SubscriptionStatus;
  trial_ends_at: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  price_gs: number | null;
}

export interface Membership {
  organization_id: string;
  role: OrgRole;
  organizations: Organization;
}

export interface DashboardKpis {
  total_customers: number;
  new_customers: number;
  leads_received: number;
  open_leads: number;
  open_value: number;
  won_count: number;
  won_value: number;
  lost_count: number;
  conversion_rate: number | null;
  unanswered_leads: number;
  pending_tasks: number;
  overdue_tasks: number;
  today_tasks: number;
  overdue_lead_followups: number;
  no_contact_customers: number;
  no_contact_days: number;
}

export interface DashboardSeriesPoint {
  bucket: string;
  new_customers: number;
  total_customers: number;
  leads: number;
  won_count: number;
  won_value: number;
}

export interface DashboardData {
  range: { from: string; to: string; bucket: "day" | "week" | "month"; timezone: string };
  kpis: DashboardKpis;
  series: DashboardSeriesPoint[];
  funnel: { status: LeadStatus; count: number }[];
  distribution: { status: LeadStatus; count: number; value: number }[];
}

export type ActionResult<T = undefined> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };
