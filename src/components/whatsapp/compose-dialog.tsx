"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Check, Copy, ExternalLink, MessageCircle } from "lucide-react";
import { logManualWhatsApp } from "@/app/actions/templates";
import { renderTemplate, type TemplateVars } from "@/lib/templates";
import { waNumber } from "@/lib/crm";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Select, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";

export interface ComposeTemplate {
  id: string;
  name: string;
  body: string;
}

/**
 * WhatsApp versión 1: el usuario elige una plantilla, la ajusta y la envía
 * él mismo desde su WhatsApp. Nada se envía automáticamente.
 */
export function WhatsAppComposeDialog({
  customerId,
  leadId,
  phone,
  vars,
  templates,
  canLog,
}: {
  customerId: string;
  leadId?: string | null;
  phone: string | null;
  vars: TemplateVars;
  templates: ComposeTemplate[];
  canLog: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [templateId, setTemplateId] = useState("");
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);
  const [used, setUsed] = useState(false);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const number = waNumber(phone);
  const waHref = useMemo(() => (number ? `https://wa.me/${number}?text=${encodeURIComponent(text)}` : null), [number, text]);

  function pick(id: string) {
    setTemplateId(id);
    const t = templates.find((x) => x.id === id);
    setText(t ? renderTemplate(t.body, vars) : "");
    setResult(null);
  }

  return (
    <>
      <Button type="button" variant="success" onClick={() => { setOpen(true); setUsed(false); setResult(null); }}>
        <MessageCircle className="h-4 w-4" /> Mensaje
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Mensaje por WhatsApp" description="Elegí una plantilla, ajustá el texto y envialo desde tu WhatsApp." className="max-w-xl">
        <div className="space-y-4">
          {templates.length > 0 ? (
            <Select value={templateId} onChange={(e) => pick(e.target.value)} aria-label="Plantilla">
              <option value="">Escribir sin plantilla</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          ) : (
            <p className="text-sm text-slate-500">
              No tenés plantillas todavía. <Link href="/plantillas" className="font-medium text-brand-700 underline">Crear plantillas</Link>
            </p>
          )}
          <Textarea value={text} onChange={(e) => { setText(e.target.value); setResult(null); }} rows={7} maxLength={4000} placeholder="Escribí tu mensaje…" aria-label="Mensaje" />
          {!number && <Alert tone="warning">Este cliente no tiene un número de WhatsApp o teléfono válido. Podés copiar el mensaje.</Alert>}
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="secondary"
              disabled={!text.trim()}
              onClick={async () => {
                await navigator.clipboard.writeText(text);
                setCopied(true);
                setUsed(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? "Copiado" : "Copiar"}
            </Button>
            {waHref && (
              <a
                href={waHref}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setUsed(true)}
                aria-disabled={!text.trim()}
                className={`inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-success-600 px-4 text-sm font-medium text-white hover:bg-success-700 ${!text.trim() ? "pointer-events-none opacity-50" : ""}`}
              >
                <ExternalLink className="h-4 w-4" /> Abrir en WhatsApp
              </a>
            )}
          </div>
          {used && canLog && !result?.ok && (
            <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-slate-700">¿Enviaste el mensaje? Registralo en el historial del cliente.</p>
              <Button
                size="sm"
                loading={pending}
                onClick={() =>
                  start(async () => {
                    const r = await logManualWhatsApp({ customerId, leadId, content: text });
                    setResult({ ok: r.ok, msg: r.ok ? (r.message ?? "Registrado") : r.error });
                  })
                }
              >
                Registrar envío
              </Button>
            </div>
          )}
          {result && <Alert tone={result.ok ? "success" : "error"}>{result.msg}</Alert>}
        </div>
      </Dialog>
    </>
  );
}
