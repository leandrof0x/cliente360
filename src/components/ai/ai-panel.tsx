"use client";

import { useState, useTransition } from "react";
import { Sparkles } from "lucide-react";
import { runClienteAI, type AIResponse } from "@/app/actions/ai";
import { AI_ACTIONS, type AIActionId, type AITone } from "@/lib/ai/prompts";
import { Button } from "@/components/ui/button";
import { Select, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { AIOutput } from "./ai-output";

export interface AIAvailability {
  /** El plan incluye IA y hay proveedor configurado. */
  ready: boolean;
  /** Motivo a mostrar cuando no está disponible. */
  reason?: string;
}

/** Panel de CLIENTE AI en la ficha del cliente o de la oportunidad. */
export function AIPanel({
  kind,
  id,
  customerId,
  phone,
  canLog,
  availability,
}: {
  kind: "customer" | "lead";
  id: string;
  customerId: string;
  phone: string | null;
  canLog: boolean;
  availability: AIAvailability;
}) {
  const actions: AIActionId[] = kind === "customer" ? ["customer_summary", "draft_reply"] : ["lead_analysis", "follow_up_message"];
  const [action, setAction] = useState<AIActionId | null>(null);
  const [incoming, setIncoming] = useState("");
  const [tone, setTone] = useState<AITone>("cercano");
  const [res, setRes] = useState<AIResponse | null>(null);
  const [pending, start] = useTransition();

  function run(a: AIActionId) {
    setAction(a);
    setRes(null);
    start(async () => {
      const r = await runClienteAI({
        action: a,
        ...(kind === "customer" ? { customerId: id } : { leadId: id }),
        tone,
        incoming: a === "draft_reply" && incoming.trim() ? incoming : undefined,
      });
      setRes(r);
    });
  }

  return (
    <Card>
      <CardHeader title="CLIENTE AI" description="Sugerencias con los datos reales de esta ficha." />
      <CardBody className="space-y-3 pt-3">
        {!availability.ready ? (
          <Alert tone="info">{availability.reason}</Alert>
        ) : (
          <>
            {kind === "customer" && (
              <Textarea
                value={incoming}
                onChange={(e) => setIncoming(e.target.value)}
                rows={2}
                maxLength={3000}
                placeholder="Opcional: pegá el último mensaje del cliente para responderlo"
                aria-label="Mensaje del cliente"
              />
            )}
            <div className="flex items-center gap-2">
              <label htmlFor={`tone-${id}`} className="text-xs text-slate-500">Tono de los mensajes</label>
              <Select id={`tone-${id}`} value={tone} onChange={(e) => setTone(e.target.value as AITone)} className="h-8 w-auto text-xs">
                <option value="cercano">Cercano (vos)</option>
                <option value="formal">Formal (usted)</option>
              </Select>
            </div>
            <div className="flex flex-wrap gap-2">
              {actions.map((a) => (
                <Button key={a} type="button" size="sm" variant={a === action ? "primary" : "secondary"} loading={pending && a === action} disabled={pending} onClick={() => run(a)}>
                  <Sparkles className="h-4 w-4" /> {AI_ACTIONS[a].label}
                </Button>
              ))}
            </div>
            {pending && <p className="text-sm text-slate-500">Analizando los datos…</p>}
            {res && !res.ok && <Alert tone="error">{res.error}</Alert>}
            {res && res.ok && (
              <>
                <AIOutput
                  key={res.text}
                  text={res.text}
                  truncated={res.truncated}
                  isDraft={res.isDraft}
                  phone={phone}
                  customerId={customerId}
                  leadId={kind === "lead" ? id : null}
                  canLog={canLog}
                />
                <p className="text-xs text-slate-400">Consultas usadas este mes: {res.used} de {res.limit}</p>
              </>
            )}
          </>
        )}
      </CardBody>
    </Card>
  );
}
