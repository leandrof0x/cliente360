import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Search, Users, Repeat, ChevronLeft, ChevronRight } from "lucide-react";
import { getOrgContext } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { CUSTOMER_STATUS_LABELS, sanitizeSearch, type CustomerStatus } from "@/lib/crm";
import { formatNumber } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { ButtonLink, buttonClasses } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { WhatsAppLink } from "@/components/ui/whatsapp-link";

export const metadata: Metadata = { title: "Clientes" };

const PAGE_SIZE = 25;

type SP = { q?: string; estado?: string; tipo?: string; fuente?: string; etiqueta?: string; recurrentes?: string; pagina?: string; eliminado?: string };

interface Row {
  id: string;
  full_name: string;
  company: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  status: CustomerStatus;
  tags: string[];
  source: string | null;
  last_contact_at: string | null;
  open_leads: number;
  is_recurring: boolean;
  won_count: number;
}

const statusTone = { nuevo: "brand", activo: "success", inactivo: "neutral" } as const;

function lastContact(iso: string | null) {
  if (!iso) return { text: "Sin contacto", warn: true };
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days === 0) return { text: "Hoy", warn: false };
  if (days === 1) return { text: "Ayer", warn: false };
  return { text: `Hace ${days} días`, warn: days >= 7 };
}

export default async function CustomersPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const ctx = await getOrgContext();
  const supabase = await createClient();
  const page = Math.max(1, Number.parseInt(sp.pagina ?? "1", 10) || 1);
  const q = sanitizeSearch(sp.q);

  let query = supabase
    .from("customer_overview")
    .select("id, full_name, company, phone, whatsapp, email, status, tags, source, last_contact_at, open_leads, is_recurring, won_count", { count: "exact" })
    .eq("organization_id", ctx.org.id);

  if (q) {
    const digits = q.replace(/\D/g, "");
    const parts = [`full_name.ilike.*${q}*`, `email.ilike.*${q}*`, `company.ilike.*${q}*`];
    if (digits.length >= 3) parts.push(`phone_normalized.ilike.*${digits.replace(/^0/, "")}*`);
    query = query.or(parts.join(","));
  }
  if (sp.estado && sp.estado in CUSTOMER_STATUS_LABELS) query = query.eq("status", sp.estado);
  if (sp.tipo) query = query.eq("customer_type", sp.tipo.slice(0, 60));
  if (sp.fuente) query = query.eq("source", sp.fuente.slice(0, 60));
  if (sp.etiqueta) query = query.contains("tags", [sp.etiqueta.slice(0, 30)]);
  if (sp.recurrentes === "1") query = query.eq("is_recurring", true);

  const from = (page - 1) * PAGE_SIZE;
  const [{ data, count, error }, { data: facets }] = await Promise.all([
    query.order("created_at", { ascending: false }).range(from, from + PAGE_SIZE - 1),
    supabase.from("customers").select("customer_type, source, tags").eq("organization_id", ctx.org.id).limit(2000),
  ]);

  const rows = (data ?? []) as Row[];
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const types = [...new Set((facets ?? []).map((f) => f.customer_type).filter(Boolean))].sort() as string[];
  const sources = [...new Set((facets ?? []).map((f) => f.source).filter(Boolean))].sort() as string[];
  const tags = [...new Set((facets ?? []).flatMap((f) => (f.tags as string[]) ?? []))].sort();
  const hasFilters = Boolean(q || sp.estado || sp.tipo || sp.fuente || sp.etiqueta || sp.recurrentes);

  const pageHref = (p: number) => {
    const params = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && k !== "pagina" && k !== "eliminado") as [string, string][]);
    params.set("pagina", String(p));
    return `/clientes?${params.toString()}`;
  };

  return (
    <>
      <PageHeader
        title="Clientes"
        description={`${formatNumber(total)} ${hasFilters ? "resultados" : "clientes registrados"}`}
        actions={
          ctx.writable && (
            <ButtonLink href="/clientes/nuevo">
              <Plus className="h-4 w-4" aria-hidden /> Nuevo cliente
            </ButtonLink>
          )
        }
      />

      {sp.eliminado === "1" && <Alert tone="success" className="mb-4">Cliente eliminado.</Alert>}

      <form className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))_auto]" role="search">
        <div className="relative sm:col-span-2 lg:col-span-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <label htmlFor="q" className="sr-only">Buscar</label>
          <Input id="q" name="q" defaultValue={sp.q ?? ""} placeholder="Buscar por nombre, teléfono, correo o empresa" className="pl-9" />
        </div>
        <Select name="estado" defaultValue={sp.estado ?? ""} aria-label="Estado">
          <option value="">Todos los estados</option>
          {Object.entries(CUSTOMER_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <Select name="tipo" defaultValue={sp.tipo ?? ""} aria-label="Tipo">
          <option value="">Todos los tipos</option>
          {types.map((t) => <option key={t} value={t}>{t}</option>)}
        </Select>
        <Select name="fuente" defaultValue={sp.fuente ?? ""} aria-label="Fuente">
          <option value="">Todas las fuentes</option>
          {sources.map((t) => <option key={t} value={t}>{t}</option>)}
        </Select>
        <Select name="etiqueta" defaultValue={sp.etiqueta ?? ""} aria-label="Etiqueta">
          <option value="">Todas las etiquetas</option>
          {tags.map((t) => <option key={t} value={t}>{t}</option>)}
        </Select>
        <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-1">
          <label className="flex h-10 items-center gap-2 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 shadow-sm">
            <input type="checkbox" name="recurrentes" value="1" defaultChecked={sp.recurrentes === "1"} className="accent-brand-600" />
            Recurrentes
          </label>
          <button className={buttonClasses("secondary")}>Filtrar</button>
          {hasFilters && <Link href="/clientes" className="text-sm text-slate-500 hover:text-slate-800">Limpiar</Link>}
        </div>
      </form>

      {error && <Alert tone="error" className="mb-4">No se pudo cargar la lista de clientes.</Alert>}

      <Card>
        {rows.length === 0 ? (
          <EmptyState
            icon={Users}
            title={hasFilters ? "No hay clientes con esos filtros" : "Todavía no registraste clientes"}
            description={hasFilters ? "Probá con otra búsqueda." : "Registrá tu primer cliente para empezar a hacer seguimiento de tus ventas."}
            action={!hasFilters && ctx.writable ? <ButtonLink href="/clientes/nuevo"><Plus className="h-4 w-4" /> Nuevo cliente</ButtonLink> : undefined}
          />
        ) : (
          <>
            {/* Escritorio: tabla */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs font-medium uppercase tracking-wide text-slate-500">
                    <th className="px-5 py-3">Cliente</th>
                    <th className="px-3 py-3">Contacto</th>
                    <th className="px-3 py-3">Estado</th>
                    <th className="px-3 py-3">Oportunidades</th>
                    <th className="px-3 py-3">Último contacto</th>
                    <th className="px-5 py-3"><span className="sr-only">Acciones</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((c) => {
                    const lc = lastContact(c.last_contact_at);
                    return (
                      <tr key={c.id} className="group hover:bg-slate-50/70">
                        <td className="px-5 py-3">
                          <Link href={`/clientes/${c.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                            {c.full_name}
                          </Link>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1">
                            {c.company && <span className="text-xs text-slate-500">{c.company}</span>}
                            {c.is_recurring && <Badge tone="success"><Repeat className="h-3 w-3" /> Recurrente</Badge>}
                            {c.tags.slice(0, 3).map((t) => <Badge key={t}>{t}</Badge>)}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-slate-600">
                          <div>{c.whatsapp ?? c.phone ?? "—"}</div>
                          {c.email && <div className="text-xs text-slate-500">{c.email}</div>}
                        </td>
                        <td className="px-3 py-3"><Badge tone={statusTone[c.status]}>{CUSTOMER_STATUS_LABELS[c.status]}</Badge></td>
                        <td className="tabular px-3 py-3 text-slate-700">
                          {c.open_leads > 0 ? `${c.open_leads} abierta${c.open_leads > 1 ? "s" : ""}` : "—"}
                          {c.won_count > 0 && <span className="ml-1 text-xs text-success-700">· {c.won_count} ganada{c.won_count > 1 ? "s" : ""}</span>}
                        </td>
                        <td className={`px-3 py-3 ${lc.warn && c.open_leads > 0 ? "font-medium text-amber-700" : "text-slate-600"}`}>{lc.text}</td>
                        <td className="px-5 py-3 text-right"><WhatsAppLink number={c.whatsapp ?? c.phone} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {/* Celular: tarjetas */}
            <ul className="divide-y divide-slate-100 md:hidden">
              {rows.map((c) => {
                const lc = lastContact(c.last_contact_at);
                return (
                  <li key={c.id} className="flex items-center gap-3 px-4 py-3">
                    <Link href={`/clientes/${c.id}`} className="min-w-0 flex-1">
                      <p className="truncate font-medium text-slate-900">{c.full_name}</p>
                      <p className="truncate text-xs text-slate-500">
                        {CUSTOMER_STATUS_LABELS[c.status]} · {lc.text}
                        {c.open_leads > 0 ? ` · ${c.open_leads} abierta${c.open_leads > 1 ? "s" : ""}` : ""}
                      </p>
                    </Link>
                    {c.is_recurring && <Repeat className="h-4 w-4 text-success-600" aria-label="Recurrente" />}
                    <WhatsAppLink number={c.whatsapp ?? c.phone} className="p-2" />
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Card>

      {pages > 1 && (
        <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Paginación">
          <span className="text-slate-500">Página {page} de {pages}</span>
          <div className="flex gap-2">
            {page > 1 && <Link href={pageHref(page - 1)} className={buttonClasses("secondary", "sm")}><ChevronLeft className="h-4 w-4" /> Anterior</Link>}
            {page < pages && <Link href={pageHref(page + 1)} className={buttonClasses("secondary", "sm")}>Siguiente <ChevronRight className="h-4 w-4" /></Link>}
          </div>
        </nav>
      )}
    </>
  );
}
