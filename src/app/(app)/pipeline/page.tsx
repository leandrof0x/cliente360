import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { getOrgContext } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { getMemberOptions } from "@/lib/members";
import { formatGs, initials } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { KanbanBoard, type KanbanLead } from "@/components/pipeline/kanban-board";

export const metadata: Metadata = { title: "Pipeline" };

const CLOSED_DAYS = 30;

export default async function PipelinePage({ searchParams }: { searchParams: Promise<{ responsable?: string }> }) {
  const { responsable } = await searchParams;
  const ctx = await getOrgContext();
  const supabase = await createClient();
  const since = new Date(Date.now() - CLOSED_DAYS * 86400000).toISOString();
  const members = await getMemberOptions(ctx.org.id);
  const onlyMine = responsable === "yo";

  let open = supabase
    .from("leads")
    .select("id, title, status, position, estimated_value, next_follow_up_at, next_action, assigned_to, customers(full_name)")
    .eq("organization_id", ctx.org.id)
    .not("status", "in", "(ganado,perdido)")
    .limit(1000);
  let closed = supabase
    .from("leads")
    .select("id, title, status, position, estimated_value, next_follow_up_at, next_action, assigned_to, customers(full_name)")
    .eq("organization_id", ctx.org.id)
    .in("status", ["ganado", "perdido"])
    .gte("updated_at", since)
    .limit(300);
  if (onlyMine) {
    open = open.eq("assigned_to", ctx.user.id);
    closed = closed.eq("assigned_to", ctx.user.id);
  }
  const [o, c] = await Promise.all([open, closed]);
  const nameById = new Map(members.map((m) => [m.id, m.name]));

  type Raw = { id: string; title: string; status: KanbanLead["status"]; position: number; estimated_value: number; next_follow_up_at: string | null; next_action: string | null; assigned_to: string | null; customers: { full_name: string } | null };
  const leads: KanbanLead[] = ([...(o.data ?? []), ...(c.data ?? [])] as unknown as Raw[]).map((l) => ({
    id: l.id,
    title: l.title,
    status: l.status,
    position: l.position,
    estimated_value: Number(l.estimated_value),
    next_follow_up_at: l.next_follow_up_at,
    next_action: l.next_action,
    customer_name: l.customers?.full_name ?? "Cliente",
    assignee_initials: l.assigned_to ? initials(nameById.get(l.assigned_to)) : null,
  }));
  const openLeads = leads.filter((l) => l.status !== "ganado" && l.status !== "perdido");
  const openValue = openLeads.reduce((a, l) => a + l.estimated_value, 0);

  return (
    <>
      <PageHeader
        title="Pipeline comercial"
        description={`${openLeads.length} oportunidades abiertas · ${formatGs(openValue)} en juego`}
        actions={
          <>
            <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 text-sm shadow-sm">
              <Link href="/pipeline" className={`rounded-md px-3 py-1.5 ${!onlyMine ? "bg-slate-900 text-white" : "text-slate-600"}`}>Todas</Link>
              <Link href="/pipeline?responsable=yo" className={`rounded-md px-3 py-1.5 ${onlyMine ? "bg-slate-900 text-white" : "text-slate-600"}`}>Mías</Link>
            </div>
            {ctx.writable && <ButtonLink href="/pipeline/nueva"><Plus className="h-4 w-4" /> Nueva oportunidad</ButtonLink>}
          </>
        }
      />
      {(o.error || c.error) && <Alert tone="error" className="mb-4">No se pudo cargar el pipeline.</Alert>}
      <p className="mb-3 hidden text-xs text-slate-500 sm:block">Arrastrá las tarjetas entre columnas para cambiar su estado. Cada cambio queda en el historial.</p>
      <KanbanBoard initial={leads} readOnly={!ctx.writable} closedNote={`Últimos ${CLOSED_DAYS} días`} />
    </>
  );
}
