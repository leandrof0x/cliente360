import type { Metadata } from "next";
import { getOrgContext, canManage } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { SUBSCRIPTION_STATUS_LABELS } from "@/lib/constants";
import type { OrgRole } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { OrganizationForm, ProfileForm } from "@/components/settings/forms";
import { TeamManager } from "@/components/settings/team-manager";
import { ButtonLink } from "@/components/ui/button";
import { siteUrl } from "@/lib/site-url";
import { WhatsAppChannel, type WhatsAppConnection } from "@/components/settings/whatsapp-channel";
import { isServiceRoleConfigured, isWhatsAppWebhookConfigured } from "@/lib/server-env";
import { publicEnv } from "@/lib/env";

export const metadata: Metadata = { title: "Configuración" };

function fmtDate(iso: string | null) {
  return iso
    ? new Date(iso).toLocaleDateString("es-PY", { day: "2-digit", month: "long", year: "numeric", timeZone: "America/Asuncion" })
    : "—";
}


export default async function SettingsPage() {
  const ctx = await getOrgContext();
  const supabase = await createClient();
  const [{ data: members }, { data: invitations }, { count: customerCount }, { data: waConn }] = await Promise.all([
    supabase.from("organization_members").select("user_id, role, created_at").eq("organization_id", ctx.org.id),
    canManage(ctx.role)
      ? supabase.from("organization_invitations").select("id, email, role, token, expires_at").eq("organization_id", ctx.org.id).is("accepted_at", null).gt("expires_at", new Date().toISOString()).order("created_at")
      : Promise.resolve({ data: [] as { id: string; email: string; role: string; token: string; expires_at: string }[] }),
    supabase.from("customers").select("id", { count: "exact", head: true }).eq("organization_id", ctx.org.id),
    supabase.from("channel_connections").select("status, display_name, authorized_at").eq("organization_id", ctx.org.id).eq("channel", "whatsapp").maybeSingle(),
  ]);
  const ids = (members ?? []).map((m) => m.user_id);
  const { data: profiles } = ids.length
    ? await supabase.from("profiles").select("id, full_name, email").in("id", ids)
    : { data: [] };
  const profileById = new Map((profiles ?? []).map((p) => [p.id, p]));
  const sub = ctx.subscription;
  const base = await siteUrl();
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
              <TeamManager
                orgName={ctx.org.name}
                members={(members ?? []).map((m) => {
                  const p = profileById.get(m.user_id);
                  return { user_id: m.user_id, role: m.role as OrgRole, name: p?.full_name ?? p?.email ?? "Usuario", email: p?.email ?? null };
                })}
                invitations={(invitations ?? []).map((i) => ({ id: i.id, email: i.email, role: i.role as OrgRole, expires_at: i.expires_at, link: `${base}/invitacion/${i.token}` }))}
                currentUserId={ctx.user.id}
                currentRole={ctx.role}
                canEdit={ctx.writable}
                maxUsers={plan?.max_users ?? null}
              />
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

          {canManage(ctx.role) && (
            <ButtonLink href="/suscripcion" variant="secondary" className="w-full">Ver planes, pagos y cambiar de plan</ButtonLink>
          )}
        </div>
      </div>
    </>
  );
}
