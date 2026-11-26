import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil, Repeat, Trash2, Plus, Mail, Phone, Building2, Tag, Calendar, UserRound, Megaphone, Briefcase } from "lucide-react";
import { getOrgContext, canManage } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { getMemberOptions } from "@/lib/members";
import { CUSTOMER_STATUS_LABELS, type CustomerStatus } from "@/lib/crm";
import { LEAD_STATUSES, LEAD_STATUS_LABEL } from "@/lib/constants";
import { formatGs } from "@/lib/utils";
import { deleteCustomer } from "@/app/actions/customers";
import type { LeadStatus } from "@/lib/types";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { WhatsAppLink } from "@/components/ui/whatsapp-link";
import { InteractionForm } from "@/components/customers/interaction-form";
import { Timeline, type InteractionRow } from "@/components/customers/timeline";
import { TaskFormDialog } from "@/components/tasks/task-form";
import { TaskItem, type TaskRow } from "@/components/tasks/task-item";

export const metadata: Metadata = { title: "Cliente" };

const statusTone = { nuevo: "brand", activo: "success", inactivo: "neutral" } as const;

function Detail({ icon: Icon, label, children }: { icon: React.ElementType; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 py-2">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden />
      <div className="min-w-0">
        <p className="text-xs text-slate-500">{label}</p>
        <div className="break-words text-sm text-slate-900">{children}</div>
      </div>
    </div>
  );
}

export default async function CustomerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ creado?: string }>;
}) {
  const { id } = await params;
  const { creado } = await searchParams;
  const ctx = await getOrgContext();
  const supabase = await createClient();

  const { data: customer } = await supabase
    .from("customer_overview")
    .select("*")
    .eq("id", id)
    .eq("organization_id", ctx.org.id)
    .maybeSingle();
  if (!customer) notFound();

  const [{ data: leads }, { data: interactions }, { data: tasks }, members] = await Promise.all([
    supabase
      .from("leads")
      .select("id, title, status, estimated_value, next_follow_up_at, product_service")
      .eq("customer_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("interactions")
      .select("id, type, direction, content, occurred_at, created_by, lead_id")
      .eq("customer_id", id)
      .order("occurred_at", { ascending: false })
      .limit(100),
    supabase
      .from("tasks")
      .select("id, title, description, type, priority, status, due_at, completed_at, assigned_to")
      .eq("customer_id", id)
      .neq("status", "cancelada")
      .order("status", { ascending: false })
      .order("due_at", { ascending: true, nullsFirst: false })
      .limit(30),
    getMemberOptions(ctx.org.id),
  ]);

  const memberName = new Map(members.map((m) => [m.id, m.name]));
  const leadTitle = new Map((leads ?? []).map((l) => [l.id, l.title as string]));
  const manager = canManage(ctx.role);
  const timeline: InteractionRow[] = (interactions ?? []).map((i) => ({
    id: i.id,
    type: i.type,
    direction: i.direction,
    content: i.content,
    occurred_at: i.occurred_at,
    author_name: i.created_by ? (memberName.get(i.created_by) ?? null) : null,
    lead_title: i.lead_id ? (leadTitle.get(i.lead_id) ?? null) : null,
    can_delete: ctx.writable && (manager || i.created_by === ctx.user.id),
  }));
  const taskRows: TaskRow[] = (tasks ?? []).map((t) => ({
    ...t,
    assignee_name: t.assigned_to ? (memberName.get(t.assigned_to) ?? null) : null,
  }));
  const openLeads = (leads ?? []).filter((l) => l.status !== "ganado" && l.status !== "perdido");
  const wa = customer.whatsapp ?? customer.phone;
  const status = customer.status as CustomerStatus;

  return (
    <>
      {creado === "1" && <Alert tone="success" className="mb-4">Cliente creado. Ahora podés registrar una oportunidad o programar un seguimiento.</Alert>}

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Link href="/clientes" className="text-sm text-slate-500 hover:text-slate-800">← Clientes</Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{customer.full_name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge tone={statusTone[status]}>{CUSTOMER_STATUS_LABELS[status]}</Badge>
            {customer.is_recurring && <Badge tone="success"><Repeat className="h-3 w-3" /> Cliente recurrente</Badge>}
            {customer.won_count > 0 && <Badge tone="neutral">{customer.won_count} compra{customer.won_count > 1 ? "s" : ""} · {formatGs(customer.won_value)}</Badge>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {wa && <WhatsAppLink number={wa} label="WhatsApp" className="h-10 rounded-lg border border-success-100 bg-success-50 px-4 hover:bg-success-100" />}
          {ctx.writable && (
            <ButtonLink href={`/clientes/${id}/editar`} variant="secondary"><Pencil className="h-4 w-4" /> Editar</ButtonLink>
          )}
          {manager && ctx.writable && (
            <ConfirmButton
              variant="ghost"
              className="text-red-600 hover:bg-red-50 hover:text-red-700"
              title="¿Eliminar este cliente?"
              description="Se eliminarán también sus oportunidades, tareas e interacciones. Esta acción no se puede deshacer."
              action={deleteCustomer.bind(null, id)}
              aria-label="Eliminar cliente"
            >
              <Trash2 className="h-4 w-4" />
            </ConfirmButton>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {ctx.writable && (
            <Card>
              <CardHeader title="Registrar interacción o nota" description="Llamadas, mensajes, reuniones y notas quedan en el historial." />
              <CardBody>
                <InteractionForm customerId={id} leads={openLeads.map((l) => ({ id: l.id, title: l.title }))} />
              </CardBody>
            </Card>
          )}
          <Card>
            <CardHeader title="Historial" description={`${timeline.length} registro${timeline.length === 1 ? "" : "s"}`} />
            <CardBody>
              <Timeline rows={timeline} customerId={id} />
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Oportunidades"
              action={ctx.writable && (
                <ButtonLink href={`/pipeline/nueva?cliente=${id}`} size="sm" variant="secondary"><Plus className="h-4 w-4" /> Nueva</ButtonLink>
              )}
            />
            <CardBody className="pt-3">
              {(leads ?? []).length === 0 ? (
                <p className="text-sm text-slate-500">Sin oportunidades registradas.</p>
              ) : (
                <ul className="space-y-2">
                  {(leads ?? []).map((l) => {
                    const color = LEAD_STATUSES.find((s) => s.id === l.status)?.color;
                    return (
                      <li key={l.id}>
                        <Link href={`/pipeline/${l.id}`} className="block rounded-xl border border-slate-200 p-3 hover:border-brand-300 hover:bg-brand-50/30">
                          <p className="truncate text-sm font-medium text-slate-900">{l.title}</p>
                          <div className="mt-1 flex items-center justify-between text-xs">
                            <span className="inline-flex items-center gap-1.5 text-slate-600">
                              <span className="h-2 w-2 rounded-full" style={{ background: color }} aria-hidden />
                              {LEAD_STATUS_LABEL[l.status as LeadStatus]}
                            </span>
                            <span className="tabular font-medium text-slate-900">{formatGs(l.estimated_value)}</span>
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Seguimientos y tareas"
              action={ctx.writable && (
                <TaskFormDialog label="Nueva" members={members} defaults={{ customer_id: id, assigned_to: ctx.user.id }} buttonProps={{ size: "sm", variant: "secondary" }} />
              )}
            />
            <CardBody className="px-0 pb-2 pt-2">
              {taskRows.length === 0 ? (
                <p className="px-5 pb-3 text-sm text-slate-500">Sin tareas. Programá un seguimiento para no olvidarte.</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {taskRows.map((t) => <TaskItem key={t.id} task={t} readOnly={!ctx.writable} showCustomer={false} />)}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Datos del cliente" />
            <CardBody className="divide-y divide-slate-100 pt-2">
              {customer.whatsapp && <Detail icon={Phone} label="WhatsApp">{customer.whatsapp}</Detail>}
              {customer.phone && <Detail icon={Phone} label="Teléfono"><a href={`tel:${customer.phone}`} className="hover:text-brand-700">{customer.phone}</a></Detail>}
              {customer.email && <Detail icon={Mail} label="Correo"><a href={`mailto:${customer.email}`} className="hover:text-brand-700">{customer.email}</a></Detail>}
              {customer.company && <Detail icon={Building2} label="Empresa">{customer.company}</Detail>}
              {customer.customer_type && <Detail icon={Briefcase} label="Tipo">{customer.customer_type}</Detail>}
              {customer.source && <Detail icon={Megaphone} label="Fuente">{customer.source}</Detail>}
              <Detail icon={Calendar} label="Fecha de registro">
                {new Date(`${customer.registered_at}T12:00:00Z`).toLocaleDateString("es-PY", { day: "2-digit", month: "long", year: "numeric", timeZone: "UTC" })}
              </Detail>
              <Detail icon={UserRound} label="Responsable">{customer.assigned_to ? (memberName.get(customer.assigned_to) ?? "—") : "Sin asignar"}</Detail>
              {customer.tags?.length > 0 && (
                <Detail icon={Tag} label="Etiquetas">
                  <div className="mt-1 flex flex-wrap gap-1">
                    {(customer.tags as string[]).map((t) => (
                      <Link key={t} href={`/clientes?etiqueta=${encodeURIComponent(t)}`}><Badge>{t}</Badge></Link>
                    ))}
                  </div>
                </Detail>
              )}
              {customer.notes && (
                <div className="py-2">
                  <p className="text-xs text-slate-500">Observaciones</p>
                  <p className="mt-0.5 whitespace-pre-wrap text-sm text-slate-800">{customer.notes}</p>
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
