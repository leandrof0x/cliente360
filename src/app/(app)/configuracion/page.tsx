import type { Metadata } from "next";
import { Check } from "lucide-react";
import { getOrgContext, canManage } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { ROLE_LABELS, SUBSCRIPTION_STATUS_LABELS } from "@/lib/constants";
import { formatGs, initials } from "@/lib/utils";
import type { OrgRole, Plan } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { OrganizationForm, ProfileForm } from "@/components/settings/forms";
import { WhatsAppChannel, type WhatsAppConnection } from "@/components/settings/whatsapp-channel";
import { isServiceRoleConfigured, isWhatsAppWebhookConfigured } from "@/lib/server-env";
import { publicEnv } from "@/lib/env";

export const metadata: Metadata = { title: "Configuración" };

function fmtDate(iso: string | null) {
  return iso
    ? new Date(iso).toLocaleDateString("es-PY", { day: "2-digit", month: "long", year: "numeric", timeZone: "America/Asuncion" })
    : "—";
}

const FEATURE_LABELS: Record<string, string> = {
  crm: "CRM de clientes",
  pipeline: "Pipeline comercial",
  followups: "Seguimientos",
  dashboard: "Dashboard",
  templates: "Plantillas de mensajes",
  agenda: "Agenda",
  reports: "Reportes comerciales",
  exports: "Exportar a Excel/CSV",
  automations: "Automatizaciones",
  ai: "CLIENTE AI",
  team: "Gestión de equipo",
};

export default async function SettingsPage() {
  const ctx = await getOrgContext();
  const supabase = await createClient();
  const [{ data: members }, { data: plans }, { count: customerCount }, { data: waConn }] = await Promise.all([
    supabase.from("organization_members").select("user_id, role, created_at").eq("organization_id", ctx.org.id),
    supabase.from("plans").select("*").eq("is_active", true).order("sort_order"),
    supabase.from("customers").select("id", { count: "exact", head: true }).eq("organization_id", ctx.org.id),
    supabase.from("channel_connections").select("status, display_name, authorized_at").eq("organization_id", ctx.org.id).eq("channel", "whatsapp").maybeSingle(),
  ]);
  const ids = (members ?? []).map((m) => m.user_id);
  const { data: profiles } = ids.length
    ? await supabase.from("profiles").select("id, full_name, email").in("id", ids)
    : { data: [] };
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
  const sub = ctx.subscription;
  const plan = ctx.plan;

  return (
    <>
      <PageHeader title="Configuración" description="Datos del negocio, equipo y plan." />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader
              title="Datos del negocio"
              description={canManage(ctx.role) ? undefined : "Solo propietarios y administradores pueden editarlos."}
            />
            <CardBody>
              <OrganizationForm org={ctx.org} disabled={!canManage(ctx.role) || !ctx.writable} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Equipo" description={`${members?.length ?? 0} de ${plan?.max_users ?? "—"} usuarios del plan`} />
            <CardBody className="pt-3">
              <ul className="divide-y divide-slate-100">
                {(members ?? []).map((m) => {
                  const p = profileById.get(m.user_id);
                  return (
                    <li key={m.user_id} className="flex items-center gap-3 py-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-600">
                        {initials(p?.full_name ?? p?.email)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900">
                          {p?.full_name ?? p?.email ?? "Usuario"} {m.user_id === ctx.user.id && <span className="text-slate-400">(vos)</span>}
                        </p>
                        <p className="truncate text-xs text-slate-500">{p?.email}</p>
                      </div>
                      <Badge tone={m.role === "owner" ? "brand" : "neutral"}>{ROLE_LABELS[m.role as OrgRole]}</Badge>
                    </li>
                  );
                })}
              </ul>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Canales de mensajería" description="Nunca se envían mensajes automáticos sin un canal conectado y autorizado." />
            <CardBody>
              <WhatsAppChannel
                connection={waConn as WhatsAppConnection | null}
                canManage={canManage(ctx.role) && ctx.writable}
                webhookUrl={`${publicEnv.siteUrl.replace(/\/$/, "")}/api/webhooks/whatsapp`}
                serverReady={{ serviceRole: isServiceRoleConfigured(), webhook: isWhatsAppWebhookConfigured() }}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Tu perfil" description={ctx.user.email ?? undefined} />
            <CardBody>
              <ProfileForm fullName={ctx.user.fullName} />
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Suscripción" />
            <CardBody className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Plan</span>
                <span className="font-semibold text-slate-900">{plan?.name ?? "—"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Estado</span>
                <Badge tone={ctx.writable ? (sub?.status === "active" ? "success" : "brand") : "danger"}>
                  {sub ? SUBSCRIPTION_STATUS_LABELS[sub.status] : "Sin suscripción"}
                  {!ctx.writable && " · solo lectura"}
                </Badge>
              </div>
              {sub?.status === "trialing" && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Prueba hasta</span>
                  <span className="text-slate-900">{fmtDate(sub.trial_ends_at)}</span>
                </div>
              )}
              {sub?.current_period_end && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Vence</span>
                  <span className="text-slate-900">{fmtDate(sub.current_period_end)}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Clientes</span>
                <span className="tabular text-slate-900">
                  {customerCount ?? 0}
                  {plan?.max_customers ? ` / ${plan.max_customers}` : " (ilimitados)"}
                </span>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Planes" description="Precios mensuales en guaraníes." />
            <CardBody className="space-y-3">
              {((plans ?? []) as Plan[]).map((p) => (
                <div key={p.id} className={`rounded-xl border p-4 ${p.id === plan?.id ? "border-brand-500 bg-brand-50/50" : "border-slate-200"}`}>
                  <div className="flex items-baseline justify-between">
                    <p className="font-semibold text-slate-900">{p.name}</p>
                    <p className="tabular text-sm font-semibold text-slate-900">{formatGs(p.price_gs)}</p>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {p.max_users === 1 ? "1 usuario" : `Hasta ${p.max_users} usuarios`} ·{" "}
                    {p.max_customers ? `hasta ${p.max_customers} clientes` : "clientes ilimitados"}
                  </p>
                  <ul className="mt-2 grid grid-cols-1 gap-1">
                    {Object.entries(p.features)
                      .filter(([, v]) => v && v !== "false")
                      .map(([key]) => (
                        <li key={key} className="flex items-center gap-1.5 text-xs text-slate-600">
                          <Check className="h-3 w-3 text-success-600" aria-hidden /> {FEATURE_LABELS[key] ?? key}
                        </li>
                      ))}
                  </ul>
                  {p.id === plan?.id && <p className="mt-2 text-xs font-medium text-brand-700">Tu plan actual</p>}
                </div>
              ))}
              <p className="text-xs text-slate-500">
                El pago en línea todavía no está habilitado. Para contratar o cambiar de plan, comunicate con el equipo de
                CLIENTE360 y lo activamos manualmente.
              </p>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
