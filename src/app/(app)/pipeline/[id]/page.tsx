import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Trash2, History } from "lucide-react";
import { getOrgContext } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { getMemberOptions } from "@/lib/members";
import { getCustomerOptions } from "@/lib/customers";
import { isoToPyLocal } from "@/lib/crm";
import { todayInPy } from "@/lib/date-range";
import { LEAD_STATUSES, LEAD_STATUS_LABEL } from "@/lib/constants";
import { formatGs } from "@/lib/utils";
import { deleteLead } from "@/app/actions/leads";
import type { LeadStatus } from "@/lib/types";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { WhatsAppComposeDialog } from "@/components/whatsapp/compose-dialog";
import { LeadForm } from "@/components/pipeline/lead-form";
import { TaskFormDialog } from "@/components/tasks/task-form";
import { TaskItem, type TaskRow } from "@/components/tasks/task-item";
import { AIPanel } from "@/components/ai/ai-panel";
import { aiAvailability } from "@/lib/ai/availability";

export const metadata: Metadata = { title: "Oportunidad" };
// CLIENTE AI puede tardar varios segundos en responder
export const maxDuration = 60;

export default async function LeadPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ creada?: string }> }) {
  const { id } = await params;
  const { creada } = await searchParams;
  const ctx = await getOrgContext();
  const supabase = await createClient();
  const { data: lead } = await supabase
    .from("leads")
    .select("*, customers(id, full_name, whatsapp, phone, company)")
    .eq("id", id)
    .eq("organization_id", ctx.org.id)
    .maybeSingle();
  if (!lead) notFound();

  const [{ data: history }, { data: tasks }, members, customers, { data: templates }] = await Promise.all([
    supabase.from("lead_status_changes").select("id, from_status, to_status, changed_by, changed_at").eq("lead_id", id).order("changed_at", { ascending: false }),
    supabase
      .from("tasks")
      .select("id, title, description, type, priority, status, due_at, completed_at, assigned_to")
      .eq("lead_id", id)
      .neq("status", "cancelada")
      .order("status", { ascending: false })
      .order("due_at", { ascending: true, nullsFirst: false }),
    getMemberOptions(ctx.org.id),
    getCustomerOptions(ctx.org.id),
    supabase.from("message_templates").select("id, name, body").eq("organization_id", ctx.org.id).eq("channel", "whatsapp").order("name"),
  ]);
  const memberName = new Map(members.map((m) => [m.id, m.name]));
  const customer = lead.customers as { id: string; full_name: string; whatsapp: string | null; phone: string | null; company: string | null } | null;
  const color = LEAD_STATUSES.find((s) => s.id === lead.status)?.color;
  const taskRows: TaskRow[] = (tasks ?? []).map((t) => ({ ...t, assignee_name: t.assigned_to ? (memberName.get(t.assigned_to) ?? null) : null }));

  return (
    <>
      {creada === "1" && <Alert tone="success" className="mb-4">Oportunidad creada. Ya aparece en el pipeline.</Alert>}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Link href="/pipeline" className="text-sm text-slate-500 hover:text-slate-800">← Pipeline</Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{lead.title}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: color }} />{LEAD_STATUS_LABEL[lead.status as LeadStatus]}</span>
            <span>·</span>
            <span className="tabular font-medium text-slate-900">{formatGs(lead.estimated_value)}</span>
            {customer && (<><span>·</span><Link href={`/clientes/${customer.id}`} className="font-medium text-brand-700 hover:underline">{customer.full_name}</Link></>)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {customer && (
            <WhatsAppComposeDialog
              customerId={customer.id}
              leadId={id}
              phone={customer.whatsapp ?? customer.phone}
              templates={templates ?? []}
              canLog={ctx.writable}
              vars={{
                nombre: customer.full_name,
                primer_nombre: customer.full_name.split(" ")[0],
                empresa_cliente: customer.company,
                negocio: ctx.org.name,
                vendedor: ctx.user.fullName,
                producto: lead.product_service ?? lead.title,
                valor: formatGs(lead.estimated_value),
              }}
            />
          )}
          {ctx.writable && ctx.role !== "collaborator" && (
            <ConfirmButton
              variant="ghost"
              className="text-red-600 hover:bg-red-50"
              title="¿Eliminar esta oportunidad?"
              description="Se eliminará junto con sus tareas e historial. Las interacciones del cliente se conservan."
              action={deleteLead.bind(null, id)}
              aria-label="Eliminar oportunidad"
            >
              <Trash2 className="h-4 w-4" />
            </ConfirmButton>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Detalles" />
          <CardBody>
            <LeadForm
              readOnly={!ctx.writable}
              customers={customers}
              members={members}
              today={todayInPy()}
              initial={{ ...lead, next_follow_up_local: isoToPyLocal(lead.next_follow_up_at) }}
            />
          </CardBody>
        </Card>
        <div className="space-y-6">
          {customer && (
            <AIPanel kind="lead" id={id} customerId={customer.id} phone={customer.whatsapp ?? customer.phone} canLog={ctx.writable} availability={aiAvailability(ctx)} />
          )}
          <Card>
            <CardHeader
              title="Tareas de esta oportunidad"
              action={ctx.writable && (
                <TaskFormDialog label="Nueva" members={members} defaults={{ customer_id: lead.customer_id, lead_id: id, assigned_to: lead.assigned_to ?? ctx.user.id, title: lead.next_action ?? "" , due_at: isoToPyLocal(lead.next_follow_up_at) }} buttonProps={{ size: "sm", variant: "secondary" }} />
              )}
            />
            <CardBody className="px-0 pb-2 pt-2">
              {taskRows.length === 0 ? (
                <p className="px-5 pb-3 text-sm text-slate-500">Sin tareas.</p>
              ) : (
                <ul className="divide-y divide-slate-100">{taskRows.map((t) => <TaskItem key={t.id} task={t} readOnly={!ctx.writable} showCustomer={false} />)}</ul>
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Historial de cambios" />
            <CardBody className="pt-3">
              <ol className="space-y-3">
                {(history ?? []).map((h) => (
                  <li key={h.id} className="flex gap-3 text-sm">
                    <History className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
                    <div>
                      <p className="text-slate-800">
                        {h.from_status ? <>De <b>{LEAD_STATUS_LABEL[h.from_status as LeadStatus]}</b> a <b>{LEAD_STATUS_LABEL[h.to_status as LeadStatus]}</b></> : <>Creada en <b>{LEAD_STATUS_LABEL[h.to_status as LeadStatus]}</b></>}
                      </p>
                      <p className="text-xs text-slate-500">
                        {new Date(h.changed_at).toLocaleString("es-PY", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Asuncion" })}
                        {h.changed_by && ` · ${memberName.get(h.changed_by) ?? "Usuario"}`}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
