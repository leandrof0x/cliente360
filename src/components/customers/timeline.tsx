"use client";

import { useTransition } from "react";
import { MessageSquare, Phone, MessageCircle, Mail, Users, MapPin, StickyNote, CircleDot, Trash2, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { deleteInteraction } from "@/app/actions/customers";
import { INTERACTION_TYPE_LABELS, type InteractionType } from "@/lib/crm";

export interface InteractionRow {
  id: string;
  type: InteractionType;
  direction: "entrante" | "saliente" | "interna";
  content: string;
  occurred_at: string;
  author_name: string | null;
  lead_title: string | null;
  can_delete: boolean;
}

const ICONS: Record<InteractionType, React.ElementType> = {
  nota: StickyNote,
  llamada: Phone,
  whatsapp: MessageCircle,
  email: Mail,
  reunion: Users,
  visita: MapPin,
  otro: CircleDot,
};

export function Timeline({ rows, customerId }: { rows: InteractionRow[]; customerId: string }) {
  const [pending, start] = useTransition();
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center py-8 text-center text-sm text-slate-500">
        <MessageSquare className="mb-2 h-5 w-5 text-slate-400" aria-hidden />
        Todavía no hay interacciones registradas.
      </div>
    );
  }
  return (
    <ol className="relative space-y-5 border-l border-slate-200 pl-6">
      {rows.map((r) => {
        const Icon = ICONS[r.type] ?? CircleDot;
        return (
          <li key={r.id} className="relative">
            <span className={`absolute -left-[37px] flex h-6 w-6 items-center justify-center rounded-full ring-4 ring-white ${r.type === "nota" ? "bg-amber-100 text-amber-700" : "bg-brand-100 text-brand-700"}`}>
              <Icon className="h-3 w-3" aria-hidden />
            </span>
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs text-slate-500">
                <span className="font-medium text-slate-800">{INTERACTION_TYPE_LABELS[r.type]}</span>
                {r.direction === "entrante" && <span className="ml-1 inline-flex items-center text-success-700"><ArrowDownLeft className="h-3 w-3" /> nos contactó</span>}
                {r.direction === "saliente" && <span className="ml-1 inline-flex items-center text-brand-700"><ArrowUpRight className="h-3 w-3" /> lo contactamos</span>}
                {" · "}
                {new Date(r.occurred_at).toLocaleString("es-PY", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Asuncion" })}
                {r.author_name && ` · ${r.author_name}`}
              </p>
              {r.can_delete && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    if (window.confirm("¿Eliminar este registro?")) start(async () => { await deleteInteraction(r.id, customerId); });
                  }}
                  className="rounded p-1 text-slate-300 hover:text-red-600"
                  aria-label="Eliminar registro"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{r.content}</p>
            {r.lead_title && <p className="mt-1 text-xs text-slate-500">Oportunidad: {r.lead_title}</p>}
          </li>
        );
      })}
    </ol>
  );
}
