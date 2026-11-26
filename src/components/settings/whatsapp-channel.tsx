"use client";

import { useActionState, useState, useTransition } from "react";
import { CheckCircle2, MessageCircle, ShieldCheck, ShieldOff, Unplug } from "lucide-react";
import { connectWhatsApp, disconnectWhatsApp, setWhatsAppAuthorization } from "@/app/actions/channels";
import { Field, Input } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ConfirmButton } from "@/components/ui/confirm-button";

export interface WhatsAppConnection {
  status: string;
  display_name: string | null;
  authorized_at: string | null;
}

export function WhatsAppChannel({
  connection,
  canManage,
  webhookUrl,
  serverReady,
}: {
  connection: WhatsAppConnection | null;
  canManage: boolean;
  webhookUrl: string;
  serverReady: { serviceRole: boolean; webhook: boolean };
}) {
  const [state, action] = useActionState(connectWhatsApp, null);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const connected = connection?.status === "conectado";

  return (
    <div className="space-y-4 text-sm">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-success-50 text-success-600">
          <MessageCircle className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-slate-900">WhatsApp Business (API oficial de Meta)</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {connected ? <Badge tone="success"><CheckCircle2 className="h-3 w-3" /> Conectado</Badge> : <Badge>No conectado</Badge>}
            {connected && (connection?.authorized_at ? <Badge tone="brand"><ShieldCheck className="h-3 w-3" /> Envíos autorizados</Badge> : <Badge tone="warning"><ShieldOff className="h-3 w-3" /> Envíos no autorizados</Badge>)}
          </div>
          {connection?.display_name && <p className="mt-1 text-xs text-slate-500">{connection.display_name}</p>}
        </div>
      </div>

      <p className="text-slate-600">
        Sin conectar la API igual podés usar WhatsApp: desde la ficha de cada cliente generás el mensaje con una plantilla y lo enviás desde tu propio WhatsApp.
        Conectar la API permite <b>recibir</b> los mensajes en el historial y crear consultas automáticamente.
      </p>

      {(!serverReady.serviceRole || !serverReady.webhook) && (
        <Alert tone="warning" title="Falta configuración del servidor">
          Para usar la API oficial, el administrador de CLIENTE360 debe configurar
          {!serverReady.serviceRole && " SUPABASE_SERVICE_ROLE_KEY"}
          {!serverReady.webhook && " WHATSAPP_VERIFY_TOKEN y WHATSAPP_APP_SECRET"}.
        </Alert>
      )}

      {canManage && connected && (
        <div className="rounded-xl border border-slate-200 p-4">
          <p className="font-medium text-slate-900">Envíos automáticos</p>
          <p className="mt-1 text-slate-600">
            {connection?.authorized_at
              ? `Autorizados desde el ${new Date(connection.authorized_at).toLocaleDateString("es-PY", { timeZone: "America/Asuncion" })}. Las automatizaciones pueden enviar mensajes por este número.`
              : "Ninguna automatización puede enviar mensajes hasta que lo autorices expresamente."}
          </p>
          {err && <Alert tone="error" className="mt-2">{err}</Alert>}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={connection?.authorized_at ? "secondary" : "primary"}
              loading={pending}
              onClick={() => start(async () => { const r = await setWhatsAppAuthorization(!connection?.authorized_at); setErr(r.ok ? null : r.error); })}
            >
              {connection?.authorized_at ? "Revocar autorización" : "Autorizo envíos automáticos por este número"}
            </Button>
            <ConfirmButton size="sm" variant="ghost" className="text-red-600" title="¿Desconectar WhatsApp?" description="Se dejarán de recibir mensajes y se desactivarán las automatizaciones de WhatsApp." confirmLabel="Desconectar" action={disconnectWhatsApp}>
              <Unplug className="h-4 w-4" /> Desconectar
            </ConfirmButton>
          </div>
        </div>
      )}

      {canManage && serverReady.serviceRole && (!connected || showForm) && (
        <form action={action} className="space-y-3 rounded-xl border border-slate-200 p-4">
          <p className="font-medium text-slate-900">{connected ? "Actualizar credenciales" : "Conectar número"}</p>
          <ol className="list-decimal space-y-1 pl-5 text-xs text-slate-600">
            <li>En developers.facebook.com creá una app de tipo <i>Business</i> y agregá el producto WhatsApp.</li>
            <li>Copiá el <b>Phone number ID</b> y generá un <b>token de acceso permanente</b> (usuario del sistema).</li>
            <li>En Webhooks configurá la URL <code className="rounded bg-slate-100 px-1">{webhookUrl}</code> con el token de verificación del servidor y suscribite a <i>messages</i>.</li>
          </ol>
          {state && (state.ok ? <Alert tone="success">{state.message}</Alert> : <Alert tone="error">{state.error}</Alert>)}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Phone number ID" htmlFor="wa-pnid">
              <Input id="wa-pnid" name="phone_number_id" inputMode="numeric" required />
            </Field>
            <Field label="WhatsApp Business Account ID (opcional)" htmlFor="wa-waba">
              <Input id="wa-waba" name="business_account_id" inputMode="numeric" />
            </Field>
          </div>
          <Field label="Token de acceso" htmlFor="wa-token" hint="Se guarda solo en el servidor (inaccesible desde el navegador) y no vuelve a mostrarse.">
            <Input id="wa-token" name="access_token" type="password" autoComplete="off" required />
          </Field>
          <SubmitButton size="sm" pendingText="Verificando con Meta...">Verificar y conectar</SubmitButton>
        </form>
      )}
      {canManage && connected && !showForm && serverReady.serviceRole && (
        <button onClick={() => setShowForm(true)} className="text-xs font-medium text-brand-700 hover:underline">Actualizar credenciales</button>
      )}
    </div>
  );
}
