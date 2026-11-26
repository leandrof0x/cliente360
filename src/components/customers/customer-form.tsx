"use client";

import Link from "next/link";
import { useActionState } from "react";
import { saveCustomer } from "@/app/actions/customers";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { SubmitButton } from "@/components/ui/submit-button";
import { ButtonLink } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { CUSTOMER_SOURCES, CUSTOMER_STATUS_LABELS, CUSTOMER_TYPES } from "@/lib/crm";
import type { MemberOption } from "@/lib/members";

export interface CustomerFormValues {
  id?: string;
  full_name?: string;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  company?: string | null;
  customer_type?: string | null;
  source?: string | null;
  registered_at?: string;
  status?: string;
  tags?: string[];
  notes?: string | null;
  assigned_to?: string | null;
}

export function CustomerForm({
  initial,
  members,
  today,
}: {
  initial?: CustomerFormValues;
  members: MemberOption[];
  today: string;
}) {
  const action = saveCustomer.bind(null, initial?.id ?? null);
  const [state, formAction] = useActionState(action, null);
  const fe = state && !state.ok ? state.fieldErrors : undefined;
  const dupId = state && !state.ok ? (state as { data?: { duplicateId?: string } }).data?.duplicateId : undefined;
  const e = (k: string) => fe?.[k]?.[0];

  return (
    <form action={formAction} className="space-y-6" noValidate>
      {state && !state.ok && (
        <Alert tone="error">
          {state.error}{" "}
          {dupId && (
            <Link href={`/clientes/${dupId}`} className="font-semibold underline">
              Ver cliente existente
            </Link>
          )}
        </Alert>
      )}

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-sm font-semibold text-slate-900">Datos de contacto</legend>
        <Field label="Nombre completo *" htmlFor="full_name" error={e("full_name")} className="sm:col-span-2">
          <Input id="full_name" name="full_name" required maxLength={160} defaultValue={initial?.full_name ?? ""} autoFocus />
        </Field>
        <Field label="WhatsApp" htmlFor="whatsapp" error={e("whatsapp")} hint="Ej.: 0981 123 456">
          <Input id="whatsapp" name="whatsapp" type="tel" maxLength={30} defaultValue={initial?.whatsapp ?? ""} />
        </Field>
        <Field label="Teléfono" htmlFor="phone" error={e("phone")}>
          <Input id="phone" name="phone" type="tel" maxLength={30} defaultValue={initial?.phone ?? ""} />
        </Field>
        <Field label="Correo electrónico" htmlFor="email" error={e("email")}>
          <Input id="email" name="email" type="email" maxLength={254} defaultValue={initial?.email ?? ""} />
        </Field>
        <Field label="Empresa" htmlFor="company" error={e("company")}>
          <Input id="company" name="company" maxLength={160} defaultValue={initial?.company ?? ""} />
        </Field>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-3 text-sm font-semibold text-slate-900">Clasificación</legend>
        <Field label="Tipo de cliente" htmlFor="customer_type" error={e("customer_type")}>
          <Input id="customer_type" name="customer_type" list="customer-types" maxLength={60} defaultValue={initial?.customer_type ?? ""} />
          <datalist id="customer-types">
            {CUSTOMER_TYPES.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </Field>
        <Field label="¿Cómo nos conoció?" htmlFor="source" error={e("source")}>
          <Input id="source" name="source" list="customer-sources" maxLength={60} defaultValue={initial?.source ?? ""} />
          <datalist id="customer-sources">
            {CUSTOMER_SOURCES.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </Field>
        <Field label="Estado" htmlFor="status" error={e("status")}>
          <Select id="status" name="status" defaultValue={initial?.status ?? "nuevo"}>
            {Object.entries(CUSTOMER_STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Fecha de registro" htmlFor="registered_at" error={e("registered_at")}>
          <Input id="registered_at" name="registered_at" type="date" max={today} defaultValue={initial?.registered_at ?? today} />
        </Field>
        <Field label="Responsable" htmlFor="assigned_to" error={e("assigned_to")}>
          <Select id="assigned_to" name="assigned_to" defaultValue={initial?.assigned_to ?? ""}>
            <option value="">Sin asignar</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Etiquetas" htmlFor="tags" error={e("tags")} hint="Separadas por coma. Ej.: mayorista, vip">
          <Input id="tags" name="tags" maxLength={400} defaultValue={(initial?.tags ?? []).join(", ")} />
        </Field>
        <Field label="Observaciones" htmlFor="notes" error={e("notes")} className="sm:col-span-2">
          <Textarea id="notes" name="notes" maxLength={5000} rows={3} defaultValue={initial?.notes ?? ""} />
        </Field>
      </fieldset>

      <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
        <ButtonLink href={initial?.id ? `/clientes/${initial.id}` : "/clientes"} variant="secondary">
          Cancelar
        </ButtonLink>
        <SubmitButton pendingText="Guardando...">{initial?.id ? "Guardar cambios" : "Crear cliente"}</SubmitButton>
      </div>
    </form>
  );
}
