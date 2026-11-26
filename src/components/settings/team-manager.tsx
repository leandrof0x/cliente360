"use client";

import { useActionState, useState, useTransition } from "react";
import { Check, Copy, LogOut, MessageCircle, Trash2, UserPlus } from "lucide-react";
import { changeMemberRole, inviteMember, leaveOrganization, removeMember, revokeInvitation } from "@/app/actions/team";
import { ROLE_LABELS } from "@/lib/constants";
import { initials } from "@/lib/utils";
import type { OrgRole } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/submit-button";
import { ConfirmButton } from "@/components/ui/confirm-button";

export interface TeamMember {
  user_id: string;
  role: OrgRole;
  name: string;
  email: string | null;
}

export interface PendingInvitation {
  id: string;
  email: string;
  role: OrgRole;
  expires_at: string;
  link: string;
}

const ROLE_HELP: Record<OrgRole, string> = {
  owner: "Control total, incluido el plan y la baja de la empresa.",
  admin: "Gestiona equipo, automatizaciones, reportes y exportaciones.",
  seller: "Trabaja clientes, oportunidades, tareas y mensajes.",
  collaborator: "Apoya con clientes y tareas; no elimina oportunidades.",
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      size="sm"
      variant="secondary"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* portapapeles bloqueado */
        }
      }}
    >
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? "Copiado" : "Copiar enlace"}
    </Button>
  );
}

function shareText(orgName: string, link: string) {
  return `Te invito a sumarte a ${orgName} en CLIENTE360. Creá tu cuenta o ingresá con este correo y aceptá la invitación: ${link}`;
}

export function TeamManager({
  orgName,
  members,
  invitations,
  currentUserId,
  currentRole,
  canEdit,
  maxUsers,
}: {
  orgName: string;
  members: TeamMember[];
  invitations: PendingInvitation[];
  currentUserId: string;
  currentRole: OrgRole;
  canEdit: boolean;
  maxUsers: number | null;
}) {
  const [state, action] = useActionState(inviteMember, null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isManager = currentRole === "owner" || currentRole === "admin";
  const used = members.length + invitations.length;
  const full = maxUsers !== null && used >= maxUsers;
  const fe = state && !state.ok ? state.fieldErrors : undefined;

  return (
    <div className="space-y-5">
      {error && <Alert tone="error">{error}</Alert>}
      <ul className="divide-y divide-slate-100">
        {members.map((m) => {
          const self = m.user_id === currentUserId;
          const editable = canEdit && isManager && !self && (m.role !== "owner" || currentRole === "owner");
          return (
            <li key={m.user_id} className="flex flex-wrap items-center gap-3 py-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-600">
                {initials(m.name)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-900">
                  {m.name} {self && <span className="text-slate-400">(vos)</span>}
                </p>
                <p className="truncate text-xs text-slate-500">{m.email}</p>
              </div>
              {editable ? (
                <div className="flex items-center gap-1">
                  <Select
                    aria-label={`Rol de ${m.name}`}
                    value={m.role}
                    disabled={pending}
                    className="h-8 w-auto text-xs"
                    onChange={(e) => {
                      const role = e.target.value as OrgRole;
                      setError(null);
                      start(async () => {
                        const r = await changeMemberRole(m.user_id, role);
                        if (!r.ok) setError(r.error);
                      });
                    }}
                  >
                    {(currentRole === "owner" ? (["owner", "admin", "seller", "collaborator"] as OrgRole[]) : (["admin", "seller", "collaborator"] as OrgRole[])).map((r) => (
                      <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                    ))}
                  </Select>
                  <ConfirmButton
                    variant="ghost"
                    size="icon"
                    className="text-slate-400 hover:text-red-600"
                    aria-label={`Quitar a ${m.name}`}
                    title={`¿Quitar a ${m.name} del equipo?`}
                    description="Pierde el acceso a esta empresa. Sus clientes, oportunidades y tareas quedan en la empresa."
                    confirmLabel="Quitar"
                    action={() => removeMember(m.user_id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </ConfirmButton>
                </div>
              ) : (
                <Badge tone={m.role === "owner" ? "brand" : "neutral"}>{ROLE_LABELS[m.role]}</Badge>
              )}
            </li>
          );
        })}
      </ul>

      {isManager && invitations.length > 0 && (
        <div>
          <p className="mb-2 text-sm font-medium text-slate-900">Invitaciones pendientes</p>
          <ul className="space-y-2">
            {invitations.map((i) => (
              <li key={i.id} className="flex flex-col gap-2 rounded-xl border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm text-slate-900">{i.email}</p>
                  <p className="text-xs text-slate-500">
                    {ROLE_LABELS[i.role]} · vence el {new Date(i.expires_at).toLocaleDateString("es-PY", { day: "2-digit", month: "short", timeZone: "America/Asuncion" })}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <CopyButton text={i.link} />
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(shareText(orgName, i.link))}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-success-700 shadow-sm hover:bg-slate-50"
                  >
                    <MessageCircle className="h-4 w-4" /> WhatsApp
                  </a>
                  {canEdit && (
                    <ConfirmButton
                      size="sm"
                      variant="ghost"
                      title="¿Anular la invitación?"
                      description="El enlace deja de funcionar."
                      confirmLabel="Anular"
                      action={() => revokeInvitation(i.id)}
                    >
                      Anular
                    </ConfirmButton>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {isManager && canEdit && (
        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
          <p className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-900">
            <UserPlus className="h-4 w-4 text-brand-600" /> Invitar a una persona
          </p>
          {full ? (
            <Alert tone="info">
              Usaste los {maxUsers} lugares de tu plan (incluye invitaciones pendientes). Para sumar más personas, cambiá de plan.
            </Alert>
          ) : (
            <form action={action} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
                <Field label="Correo" htmlFor="invite-email" error={fe?.email?.[0]}>
                  <Input id="invite-email" name="email" type="email" required maxLength={200} placeholder="persona@negocio.com" />
                </Field>
                <Field label="Rol" htmlFor="invite-role">
                  <Select id="invite-role" name="role" defaultValue="seller">
                    {(["admin", "seller", "collaborator"] as OrgRole[]).map((r) => (
                      <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                    ))}
                  </Select>
                </Field>
              </div>
              <ul className="space-y-0.5 text-xs text-slate-500">
                {(["admin", "seller", "collaborator"] as OrgRole[]).map((r) => (
                  <li key={r}><span className="font-medium text-slate-600">{ROLE_LABELS[r]}:</span> {ROLE_HELP[r]}</li>
                ))}
              </ul>
              {state && !state.ok && <Alert tone="error">{state.error}</Alert>}
              {state?.ok && state.data && (
                <Alert tone="success">
                  {state.message}
                  <span className="mt-2 block break-all rounded-lg bg-white/70 px-2 py-1 font-mono text-xs text-slate-700">{state.data.link}</span>
                </Alert>
              )}
              <SubmitButton pendingText="Creando...">Crear invitación</SubmitButton>
              <p className="text-xs text-slate-500">
                CLIENTE360 no envía correos de invitación: copiá el enlace y compartilo por WhatsApp o correo. Vence en 7 días.
              </p>
            </form>
          )}
        </div>
      )}

      <div className="border-t border-slate-100 pt-4">
        <ConfirmButton
          variant="ghost"
          size="sm"
          className="text-slate-500 hover:text-red-600"
          title="¿Salir de esta empresa?"
          description="Vas a perder el acceso a sus datos. Si sos el único propietario, primero nombrá a otro propietario."
          confirmLabel="Salir"
          action={leaveOrganization}
        >
          <LogOut className="h-4 w-4" /> Salir de esta empresa
        </ConfirmButton>
      </div>
    </div>
  );
}
