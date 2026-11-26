"use client";

import { useState, useTransition } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { logManualWhatsApp } from "@/app/actions/templates";
import { waNumber } from "@/lib/crm";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";

/**
 * Resultado de CLIENTE AI. Los borradores se pueden editar, copiar y abrir en
 * WhatsApp: nada se envía automáticamente.
 */
export function AIOutput({
  text,
  truncated,
  isDraft,
  phone,
  customerId,
  leadId,
  canLog,
}: {
  text: string;
  truncated?: boolean;
  isDraft?: boolean;
  phone?: string | null;
  customerId?: string;
  leadId?: string | null;
  canLog?: boolean;
}) {
  const [value, setValue] = useState(text);
  const [copied, setCopied] = useState(false);
  const [used, setUsed] = useState(false);
  const [logged, setLogged] = useState<{ ok: boolean; msg: string } | null>(null);
  const [pending, start] = useTransition();
  const number = isDraft ? waNumber(phone) : null;

  return (
    <div className="space-y-3">
      {isDraft ? (
        <Textarea value={value} onChange={(e) => setValue(e.target.value)} rows={6} maxLength={4000} aria-label="Borrador del mensaje" />
      ) : (
        <div className="whitespace-pre-wrap rounded-xl border border-slate-200 bg-white p-4 text-sm leading-relaxed text-slate-800">{value}</div>
      )}
      {truncated && <p className="text-xs text-amber-700">La respuesta se cortó por longitud. Pedí algo más acotado para verla completa.</p>}
      <p className="text-xs text-slate-500">Generado por IA con los datos de CLIENTE360. Revisalo antes de usarlo.</p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              setUsed(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              /* el navegador bloqueó el portapapeles */
            }
          }}
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? "Copiado" : "Copiar"}
        </Button>
        {number && value.trim() && (
          <a
            href={`https://wa.me/${number}?text=${encodeURIComponent(value)}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setUsed(true)}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-success-600 px-3 text-sm font-medium text-white hover:bg-success-700"
          >
            <ExternalLink className="h-4 w-4" /> Abrir en WhatsApp
          </a>
        )}
      </div>
      {isDraft && used && canLog && customerId && !logged?.ok && (
        <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-700">¿Enviaste el mensaje? Registralo en el historial.</p>
          <Button
            size="sm"
            loading={pending}
            onClick={() =>
              start(async () => {
                const r = await logManualWhatsApp({ customerId, leadId, content: value });
                setLogged({ ok: r.ok, msg: r.ok ? (r.message ?? "Registrado") : r.error });
              })
            }
          >
            Registrar envío
          </Button>
        </div>
      )}
      {logged && <Alert tone={logged.ok ? "success" : "error"}>{logged.msg}</Alert>}
    </div>
  );
}
