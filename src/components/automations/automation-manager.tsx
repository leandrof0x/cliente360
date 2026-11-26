"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Play, Plus, Trash2, Workflow, Zap } from "lucide-react";
import { deleteAutomation, runScheduledNow, saveAutomation, toggleAutomation } from "@/app/actions/automations";
import { LEAD_STATUSES, LEAD_STATUS_LABEL } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmButton } from "@/components/ui/confirm-button";
import type { LeadStatus } from "@/lib/types";

export interface AutomationRow {
  id: string;
  name: string;
  trigger_type: "lead_created" | "lead_status_changed" | "no_contact_days";
  trigger_config: { status?: LeadStatus; days?: number; only_open_leads?: boolean };
  action_type: "create_task" | "webhook_n8n" | "send_whatsapp";
  action_config: { title?: string; due_in_hours?: number; priority?: string; url?: string; message?: string };
  is_active: boolean;
  last_run_at: string | null;
  run_count: number;
}

function describe(a: AutomationRow) {
  const when =
    a.trigger_type === "lead_created"
      ? "Cuando entra una nueva consulta"
      : a.trigger_type === "lead_status_changed"
        ? `Cuando una oportunidad pasa a «${LEAD_STATUS_LABEL[a.trigger_config.status as LeadStatus] ?? "?"}»`
        : `Cuando un cliente lleva ${a.trigger_config.days} días sin contacto${a.trigger_config.only_open_leads ? " (con oportunidad abierta)" : ""}`;
  const then =
    a.action_type === "create_task"
      ? `crear la tarea «${a.action_config.title}» para dentro de ${a.action_config.due_in_hours ?? 24} h`
      : a.action_type === "webhook_n8n"
        ? "enviar los datos a n8n (webhook)"
        : "enviar un WhatsApp automático";
  return { when, then };
}

function AutomationForm({ initial, whatsappReady, onDone }: { initial?: AutomationRow; whatsappReady: boolean; onDone: () => void }) {
  const [state, action] = useActionState(saveAutomation.bind(null, initial?.id ?? null), null);
  const [trigger, setTrigger] = useState<AutomationRow["trigger_type"]>(initial?.trigger_type ?? "lead_created");
  const [act, setAct] = useState<AutomationRow["action_type"]>(initial?.action_type ?? "create_task");
  const fe = state && !state.ok ? state.fieldErrors : undefined;
  const e = (k: string) => fe?.[k]?.[0];
  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);

  return (
    <form action={action} className="space-y-4">
      {state && !state.ok && <Alert tone="error">{state.error}</Alert>}
      <Field label="Nombre *" htmlFor="au-name" error={e("name")}>
        <Input id="au-name" name="name" required maxLength={120} defaultValue={initial?.name} placeholder="Ej.: Contactar nuevas consultas en 2 horas" />
      </Field>

      <fieldset className="space-y-3 rounded-xl border border-slate-200 p-4">
        <legend className="px-1 text-sm font-semibold text-slate-900">Cuando…</legend>
        <Select name="trigger_type" value={trigger} onChange={(ev) => setTrigger(ev.target.value as AutomationRow["trigger_type"])} aria-label="Disparador">
          <option value="lead_created">Entra una nueva consulta / oportunidad</option>
          <option value="lead_status_changed">Una oportunidad cambia de estado</option>
          <option value="no_contact_days">Un cliente lleva días sin contacto (se revisa a diario)</option>
        </Select>
        {trigger === "lead_status_changed" && (
          <Field label="Nuevo estado" htmlFor="au-status" error={e("trigger_status")}>
            <Select id="au-status" name="trigger_status" defaultValue={initial?.trigger_config.status ?? "ganado"}>
              {LEAD_STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </Select>
          </Field>
        )}
        {trigger === "no_contact_days" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Días sin contacto" htmlFor="au-days" error={e("trigger_days")}>
              <Input id="au-days" name="trigger_days" type="number" min={1} max={365} defaultValue={initial?.trigger_config.days ?? 7} />
            </Field>
            <label className="flex items-center gap-2 self-end pb-2 text-sm text-slate-700">
              <input type="checkbox" name="only_open_leads" defaultChecked={initial?.trigger_config.only_open_leads ?? true} className="accent-brand-600" />
              Solo clientes con oportunidad abierta
            </label>
          </div>
        )}
      </fieldset>

      <fieldset className="space-y-3 rounded-xl border border-slate-200 p-4">
        <legend className="px-1 text-sm font-semibold text-slate-900">Entonces…</legend>
        <Select name="action_type" value={act} onChange={(ev) => setAct(ev.target.value as AutomationRow["action_type"])} aria-label="Acción">
          <option value="create_task">Crear una tarea de seguimiento</option>
          <option value="webhook_n8n">Enviar los datos a n8n (webhook)</option>
          <option value="send_whatsapp" disabled={!whatsappReady}>Enviar WhatsApp automático {whatsappReady ? "" : "(requiere canal conectado y autorizado)"}</option>
        </Select>
        {act === "create_task" && (
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Título de la tarea" htmlFor="au-title" error={e("task_title")} className="sm:col-span-3" hint="Podés usar {cliente} y {oportunidad}.">
              <Input id="au-title" name="task_title" maxLength={200} defaultValue={initial?.action_config.title ?? "Contactar a {cliente}"} />
            </Field>
            <Field label="Vence en (horas)" htmlFor="au-hours">
              <Input id="au-hours" name="task_due_hours" type="number" min={0} max={1440} defaultValue={initial?.action_config.due_in_hours ?? 2} />
            </Field>
            <Field label="Prioridad" htmlFor="au-prio">
              <Select id="au-prio" name="task_priority" defaultValue={initial?.action_config.priority ?? "alta"}>
                <option value="baja">Baja</option>
                <option value="media">Media</option>
                <option value="alta">Alta</option>
              </Select>
            </Field>
          </div>
        )}
        {act === "webhook_n8n" && (
          <Field label="URL del webhook de n8n" htmlFor="au-url" error={e("webhook_url")} hint="Se envía un POST con el evento, la oportunidad y el cliente en JSON.">
            <Input id="au-url" name="webhook_url" type="url" placeholder="https://tu-n8n.com/webhook/..." defaultValue={initial?.action_config.url ?? ""} />
          </Field>
        )}
        {act === "send_whatsapp" && (
          <Field label="Mensaje" htmlFor="au-msg" error={e("message")} hint="Podés usar {nombre} y {primer_nombre}. Fuera de la ventana de 24 h Meta exige plantillas aprobadas.">
            <Textarea id="au-msg" name="message" rows={3} maxLength={1000} defaultValue={initial?.action_config.message ?? ""} />
          </Field>
        )}
      </fieldset>

      <label className="flex items-center gap-2 text-sm text-slate-700">
        <input type="checkbox" name="is_active" defaultChecked={initial?.is_active ?? true} className="accent-brand-600" />
        Activa
      </label>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onDone}>Cancelar</Button>
        <SubmitButton pendingText="Guardando...">Guardar</SubmitButton>
      </div>
    </form>
  );
}

export function AutomationManager({
  automations,
  runs,
  canEdit,
  planAllows,
  whatsappReady,
}: {
  automations: AutomationRow[];
  runs: { id: number; automation_name: string; status: string; detail: string | null; created_at: string }[];
  canEdit: boolean;
  planAllows: boolean;
  whatsappReady: boolean;
}) {
  const [editing, setEditing] = useState<AutomationRow | "new" | null>(null);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const hasScheduled = automations.some((a) => a.trigger_type === "no_contact_days" && a.is_active);

  if (!planAllows) {
    return (
      <Card>
        <EmptyState icon={Zap} title="Las automatizaciones están incluidas desde el plan Profesional" description="Creá tareas automáticamente ante cada nueva consulta, cambios de estado o clientes sin contacto, y conectá tus flujos de n8n." />
      </Card>
    );
  }

  return (
    <>
      {canEdit && (
        <div className="mb-4 flex flex-wrap justify-end gap-2">
          {hasScheduled && (
            <Button variant="secondary" loading={pending} onClick={() => start(async () => { const r = await runScheduledNow(); setMsg({ ok: r.ok, text: r.ok ? (r.message ?? "Listo") : r.error }); })}>
              <Play className="h-4 w-4" /> Revisar clientes sin contacto ahora
            </Button>
          )}
          <Button onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> Nueva automatización</Button>
        </div>
      )}
      {msg && <Alert tone={msg.ok ? "success" : "error"} className="mb-4">{msg.text}</Alert>}

      {automations.length === 0 ? (
        <Card>
          <EmptyState icon={Workflow} title="Todavía no hay automatizaciones" description="Ejemplo: cuando entra una nueva consulta, crear una tarea «Contactar a {cliente}» que venza en 2 horas." />
        </Card>
      ) : (
        <div className="space-y-3">
          {automations.map((a) => {
            const d = describe(a);
            return (
              <Card key={a.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-slate-900">{a.name}</p>
                    {a.is_active ? <Badge tone="success">Activa</Badge> : <Badge>Pausada</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{d.when}, {d.then}.</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {a.run_count} ejecuciones{a.last_run_at && ` · última ${new Date(a.last_run_at).toLocaleString("es-PY", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Asuncion" })}`}
                  </p>
                </div>
                {canEdit && (
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="secondary" loading={pending} onClick={() => start(async () => { const r = await toggleAutomation(a.id, !a.is_active); if (!r.ok) setMsg({ ok: false, text: r.error }); })}>
                      {a.is_active ? "Pausar" : "Activar"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(a)}>Editar</Button>
                    <ConfirmButton size="icon" variant="ghost" className="text-slate-400 hover:text-red-600" title="¿Eliminar automatización?" description={`«${a.name}» dejará de ejecutarse.`} action={() => deleteAutomation(a.id)} aria-label="Eliminar">
                      <Trash2 className="h-4 w-4" />
                    </ConfirmButton>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {runs.length > 0 && (
        <Card className="mt-6">
          <div className="px-5 pt-5"><h2 className="text-[15px] font-semibold text-slate-900">Últimas ejecuciones</h2></div>
          <ul className="divide-y divide-slate-100 p-2">
            {runs.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                <Badge tone={r.status === "ok" ? "success" : r.status === "error" ? "danger" : "warning"}>{r.status === "ok" ? "OK" : r.status === "error" ? "Error" : "Omitida"}</Badge>
                <span className="font-medium text-slate-800">{r.automation_name}</span>
                <span className="min-w-0 flex-1 truncate text-slate-500">{r.detail}</span>
                <span className="text-xs text-slate-400">{new Date(r.created_at).toLocaleString("es-PY", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Asuncion" })}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "Nueva automatización" : "Editar automatización"} className="max-w-2xl">
        {editing !== null && <AutomationForm initial={editing === "new" ? undefined : editing} whatsappReady={whatsappReady} onDone={() => setEditing(null)} />}
      </Dialog>
    </>
  );
}
