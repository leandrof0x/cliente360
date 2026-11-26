import { Briefcase, CheckCircle2, MessageSquare, UserPlus, CalendarClock, ArrowRightLeft, Pencil, Trash2, Building2 } from "lucide-react";
import { LEAD_STATUS_LABEL } from "@/lib/constants";
import type { LeadStatus } from "@/lib/types";

export interface ActivityRow {
  id: number;
  entity_type: string;
  action: string;
  summary: string | null;
  metadata: Record<string, string>;
  created_at: string;
  actor_name: string | null;
}

const ENTITY: Record<string, string> = {
  customer: "cliente",
  lead: "oportunidad",
  task: "tarea",
  interaction: "interacción",
  appointment: "cita",
  organization: "empresa",
};

function describe(a: ActivityRow): { icon: React.ElementType; text: string } {
  const entity = ENTITY[a.entity_type] ?? a.entity_type;
  if (a.action === "status_changed" && a.metadata?.to)
    return { icon: ArrowRightLeft, text: `movió la oportunidad a «${LEAD_STATUS_LABEL[a.metadata.to as LeadStatus] ?? a.metadata.to}»` };
  if (a.action === "completed") return { icon: CheckCircle2, text: "completó la tarea" };
  if (a.entity_type === "interaction") return { icon: MessageSquare, text: "registró una interacción" };
  if (a.action === "created") {
    const icon = a.entity_type === "customer" ? UserPlus : a.entity_type === "lead" ? Briefcase : a.entity_type === "appointment" ? CalendarClock : a.entity_type === "organization" ? Building2 : CheckCircle2;
    return { icon, text: `creó ${entity === "tarea" || entity === "oportunidad" || entity === "cita" || entity === "empresa" || entity === "interacción" ? "la" : "el"} ${entity}` };
  }
  if (a.action === "deleted") return { icon: Trash2, text: `eliminó ${entity === "cliente" ? "el" : "la"} ${entity}` };
  return { icon: Pencil, text: `actualizó ${entity === "cliente" ? "el" : "la"} ${entity}` };
}

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "recién";
  if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
  if (diff < 7 * 86400) return `hace ${Math.floor(diff / 86400)} d`;
  return new Date(iso).toLocaleDateString("es-PY", { day: "2-digit", month: "short", timeZone: "America/Asuncion" });
}

export function ActivityFeed({ rows }: { rows: ActivityRow[] }) {
  return (
    <ul className="divide-y divide-slate-100">
      {rows.map((a) => {
        const { icon: Icon, text } = describe(a);
        return (
          <li key={a.id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-500">
              <Icon className="h-3.5 w-3.5" aria-hidden />
            </span>
            <div className="min-w-0 flex-1 text-sm">
              <p className="text-slate-700">
                <span className="font-medium text-slate-900">{a.actor_name ?? "Sistema"}</span> {text}
                {a.summary && a.entity_type !== "interaction" && (
                  <span className="text-slate-900"> «{a.summary}»</span>
                )}
              </p>
              <p className="text-xs text-slate-400">{timeAgo(a.created_at)}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
