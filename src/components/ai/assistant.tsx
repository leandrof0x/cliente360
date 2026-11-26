"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { BarChart3, Send, Sparkles, Target, TimerReset, Trash2 } from "lucide-react";
import { runClienteAI, type AIResponse } from "@/app/actions/ai";
import { AI_ACTIONS, type AIActionId } from "@/lib/ai/prompts";
import { Button } from "@/components/ui/button";
import { Select, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { AIOutput } from "./ai-output";

interface Turn {
  role: "user" | "assistant";
  content: string;
  truncated?: boolean;
  error?: boolean;
}

const QUICK: { id: AIActionId; icon: React.ElementType; managersOnly?: boolean; withRange?: boolean }[] = [
  { id: "stale_leads", icon: TimerReset },
  { id: "commercial_report", icon: BarChart3, managersOnly: true, withRange: true },
  { id: "conversion_tips", icon: Target, managersOnly: true, withRange: true },
];

const RANGES = [
  { id: "7d", label: "Últimos 7 días" },
  { id: "30d", label: "Últimos 30 días" },
  { id: "90d", label: "Últimos 90 días" },
  { id: "mes", label: "Este mes" },
  { id: "anio", label: "Este año" },
];

const EXAMPLES = [
  "¿Qué clientes tienen oportunidades grandes sin seguimiento?",
  "¿Qué tareas vencidas debería atender primero hoy?",
  "¿Cuántas ventas cerramos en los últimos 30 días y por cuánto?",
];

export function Assistant({ isManager, initialUsed, limit }: { isManager: boolean; initialUsed: number; limit: number }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState("");
  const [range, setRange] = useState("30d");
  const [quick, setQuick] = useState<{ id: AIActionId; res: AIResponse } | null>(null);
  const [running, setRunning] = useState<AIActionId | null>(null);
  const [used, setUsed] = useState(initialUsed);
  const [pending, start] = useTransition();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => endRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), [turns.length]);

  function track(r: AIResponse) {
    if (r.ok) setUsed(r.used);
  }

  function runQuick(id: AIActionId) {
    setRunning(id);
    setQuick(null);
    start(async () => {
      const res = await runClienteAI({ action: id, range });
      track(res);
      setQuick({ id, res });
      setRunning(null);
    });
  }

  function ask(text: string) {
    const q = text.trim();
    if (!q || pending) return;
    const history = turns.filter((t) => !t.error).map((t) => ({ role: t.role, content: t.content }));
    setTurns((t) => [...t, { role: "user", content: q }]);
    setQuestion("");
    setRunning("chat");
    start(async () => {
      const res = await runClienteAI({ action: "chat", question: q, history });
      track(res);
      setTurns((t) => [...t, res.ok ? { role: "assistant", content: res.text, truncated: res.truncated } : { role: "assistant", content: res.error, error: true }]);
      setRunning(null);
    });
  }

  const remaining = Math.max(limit - used, 0);

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="space-y-6 lg:col-span-2">
        <Card>
          <CardHeader title="Acciones rápidas" description="Análisis con los datos actuales de tu negocio." />
          <CardBody className="space-y-3 pt-3">
            {isManager && (
              <div className="flex items-center gap-2">
                <label htmlFor="ai-range" className="text-xs text-slate-500">Período de reportes</label>
                <Select id="ai-range" value={range} onChange={(e) => setRange(e.target.value)} className="h-8 w-auto text-xs">
                  {RANGES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                </Select>
              </div>
            )}
            <ul className="space-y-2">
              {QUICK.filter((q) => isManager || !q.managersOnly).map((q) => (
                <li key={q.id}>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => runQuick(q.id)}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-xl border p-3 text-left transition hover:border-brand-300 hover:bg-brand-50/40 disabled:opacity-60",
                      quick?.id === q.id || running === q.id ? "border-brand-300 bg-brand-50/40" : "border-slate-200",
                    )}
                  >
                    <q.icon className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-hidden />
                    <span>
                      <span className="block text-sm font-medium text-slate-900">{AI_ACTIONS[q.id].label}</span>
                      <span className="block text-xs text-slate-500">{AI_ACTIONS[q.id].description}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="text-xs text-slate-500">
              Para resúmenes de clientes, análisis de oportunidades y borradores de mensajes, abrí la ficha del cliente o de la oportunidad.
            </p>
            <p className="text-xs text-slate-400">Consultas disponibles este mes: {remaining} de {limit}</p>
          </CardBody>
        </Card>
        {(running && running !== "chat") || quick ? (
          <Card>
            <CardHeader title={AI_ACTIONS[(running && running !== "chat" ? running : quick?.id) as AIActionId].label} />
            <CardBody className="pt-3">
              {running && running !== "chat" ? (
                <p className="text-sm text-slate-500">Analizando los datos…</p>
              ) : quick && !quick.res.ok ? (
                <Alert tone="error">{quick.res.error}</Alert>
              ) : quick && quick.res.ok ? (
                <AIOutput key={quick.res.text} text={quick.res.text} truncated={quick.res.truncated} />
              ) : null}
            </CardBody>
          </Card>
        ) : null}
      </div>

      <Card className="flex min-h-[520px] flex-col lg:col-span-3">
        <CardHeader
          title="Consultale a CLIENTE AI"
          description="Responde solo con la información registrada en CLIENTE360."
          action={turns.length > 0 && (
            <Button type="button" size="sm" variant="ghost" onClick={() => setTurns([])} disabled={pending}>
              <Trash2 className="h-4 w-4" /> Limpiar
            </Button>
          )}
        />
        <CardBody className="flex flex-1 flex-col gap-4 pt-3">
          <div className="flex-1 space-y-4" aria-live="polite">
            {turns.length === 0 && (
              <div className="rounded-xl border border-dashed border-slate-200 p-4">
                <p className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-700"><Sparkles className="h-4 w-4 text-brand-600" /> Probá con:</p>
                <ul className="space-y-2">
                  {EXAMPLES.map((e) => (
                    <li key={e}>
                      <button type="button" onClick={() => ask(e)} disabled={pending} className="text-left text-sm text-brand-700 hover:underline disabled:opacity-60">
                        {e}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {turns.map((t, i) =>
              t.role === "user" ? (
                <div key={i} className="ml-auto max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-brand-600 px-4 py-2.5 text-sm text-white">{t.content}</div>
              ) : t.error ? (
                <Alert key={i} tone="error">{t.content}</Alert>
              ) : (
                <div key={i} className="max-w-[95%]"><AIOutput text={t.content} truncated={t.truncated} /></div>
              ),
            )}
            {running === "chat" && <p className="text-sm text-slate-500">CLIENTE AI está revisando tus datos…</p>}
            <div ref={endRef} />
          </div>
          <form
            className="flex items-end gap-2 border-t border-slate-100 pt-4"
            onSubmit={(e) => {
              e.preventDefault();
              ask(question);
            }}
          >
            <Textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  ask(question);
                }
              }}
              rows={2}
              maxLength={2000}
              placeholder="Escribí tu pregunta sobre clientes, ventas o seguimientos…"
              aria-label="Pregunta"
              className="min-h-[44px] flex-1 resize-none"
            />
            <Button type="submit" disabled={!question.trim() || pending} loading={running === "chat"} aria-label="Enviar pregunta">
              {running !== "chat" && <Send className="h-4 w-4" />}
            </Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
