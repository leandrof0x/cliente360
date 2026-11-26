"use client";

import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Copy, MessageSquareText, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { addStarterTemplates, deleteTemplate, saveTemplate } from "@/app/actions/templates";
import { TEMPLATE_CATEGORIES, TEMPLATE_VARIABLES } from "@/lib/templates";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmButton } from "@/components/ui/confirm-button";

export interface TemplateRow {
  id: string;
  name: string;
  category: string | null;
  channel: "whatsapp" | "email";
  body: string;
}

function Highlighted({ text }: { text: string }) {
  const parts = text.split(/(\{\w+\})/g);
  return (
    <p className="whitespace-pre-wrap text-sm text-slate-700">
      {parts.map((p, i) =>
        /^\{\w+\}$/.test(p) ? (
          <span key={i} className="rounded bg-brand-50 px-1 font-medium text-brand-700">{p}</span>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </p>
  );
}

function TemplateForm({ initial, onDone }: { initial?: TemplateRow; onDone: () => void }) {
  const [state, action] = useActionState(saveTemplate.bind(null, initial?.id ?? null), null);
  const [body, setBody] = useState(initial?.body ?? "");
  const ref = useRef<HTMLTextAreaElement>(null);
  const fe = state && !state.ok ? state.fieldErrors : undefined;
  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);

  function insertVar(key: string) {
    const el = ref.current;
    const token = `{${key}}`;
    if (!el) return setBody((b) => b + token);
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    const next = body.slice(0, start) + token + body.slice(end);
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  }

  return (
    <form action={action} className="space-y-4">
      {state && !state.ok && <Alert tone="error">{state.error}</Alert>}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre *" htmlFor="tpl-name" error={fe?.name?.[0]}>
          <Input id="tpl-name" name="name" required maxLength={120} defaultValue={initial?.name} autoFocus />
        </Field>
        <Field label="Categoría" htmlFor="tpl-cat">
          <Input id="tpl-cat" name="category" list="tpl-cats" maxLength={60} defaultValue={initial?.category ?? ""} />
          <datalist id="tpl-cats">{TEMPLATE_CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
        </Field>
      </div>
      <input type="hidden" name="channel" value={initial?.channel ?? "whatsapp"} />
      <Field label="Mensaje *" htmlFor="tpl-body" error={fe?.body?.[0]} hint={`${body.length}/4000`}>
        <Textarea ref={ref} id="tpl-body" name="body" required rows={6} maxLength={4000} value={body} onChange={(e) => setBody(e.target.value)} />
      </Field>
      <div>
        <p className="mb-1.5 text-xs font-medium text-slate-500">Insertar dato del cliente:</p>
        <div className="flex flex-wrap gap-1.5">
          {TEMPLATE_VARIABLES.map((v) => (
            <button key={v.key} type="button" onClick={() => insertVar(v.key)} title={v.label} className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 hover:border-brand-400 hover:text-brand-700">
              {`{${v.key}}`}
            </button>
          ))}
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onDone}>Cancelar</Button>
        <SubmitButton pendingText="Guardando...">Guardar plantilla</SubmitButton>
      </div>
    </form>
  );
}

export function TemplateManager({ templates, canEdit, canDelete }: { templates: TemplateRow[]; canEdit: boolean; canDelete: boolean }) {
  const [editing, setEditing] = useState<TemplateRow | "new" | null>(null);
  const [filter, setFilter] = useState<string>("");
  const [copied, setCopied] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const categories = useMemo(() => [...new Set(templates.map((t) => t.category).filter(Boolean))] as string[], [templates]);
  const shown = filter ? templates.filter((t) => t.category === filter) : templates;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {categories.length > 1 && (
            <>
              <button onClick={() => setFilter("")} className={`rounded-full px-3 py-1 text-xs font-medium ${!filter ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}>Todas</button>
              {categories.map((c) => (
                <button key={c} onClick={() => setFilter(c)} className={`rounded-full px-3 py-1 text-xs font-medium ${filter === c ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}>{c}</button>
              ))}
            </>
          )}
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <Button variant="secondary" loading={pending} onClick={() => start(async () => { const r = await addStarterTemplates(); setMsg(r.ok ? (r.message ?? null) : r.error); })}>
              <Sparkles className="h-4 w-4" /> Agregar sugeridas
            </Button>
            <Button onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> Nueva plantilla</Button>
          </div>
        )}
      </div>
      {msg && <Alert tone="info" className="mb-4">{msg}</Alert>}

      {shown.length === 0 ? (
        <Card>
          <EmptyState icon={MessageSquareText} title="Todavía no tenés plantillas" description="Guardá los mensajes que más usás y personalizalos con el nombre del cliente en un clic." />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {shown.map((t) => (
            <Card key={t.id} className="flex flex-col p-5">
              <div className="mb-2 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate font-semibold text-slate-900">{t.name}</h3>
                  {t.category && <Badge className="mt-1">{t.category}</Badge>}
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    onClick={async () => { await navigator.clipboard.writeText(t.body); setCopied(t.id); setTimeout(() => setCopied(null), 1500); }}
                    className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    title="Copiar texto"
                    aria-label="Copiar texto"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                  {canEdit && (
                    <button onClick={() => setEditing(t)} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Editar" aria-label="Editar">
                      <Pencil className="h-4 w-4" />
                    </button>
                  )}
                  {canDelete && (
                    <ConfirmButton variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-red-600" title="¿Eliminar plantilla?" description={`Se eliminará «${t.name}».`} action={() => deleteTemplate(t.id)} aria-label="Eliminar">
                      <Trash2 className="h-4 w-4" />
                    </ConfirmButton>
                  )}
                </div>
              </div>
              <Highlighted text={t.body} />
              {copied === t.id && <p className="mt-2 text-xs text-success-700">Copiado</p>}
            </Card>
          ))}
        </div>
      )}

      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={editing === "new" ? "Nueva plantilla" : "Editar plantilla"} className="max-w-2xl">
        {editing !== null && <TemplateForm initial={editing === "new" ? undefined : editing} onDone={() => setEditing(null)} />}
      </Dialog>
    </>
  );
}
