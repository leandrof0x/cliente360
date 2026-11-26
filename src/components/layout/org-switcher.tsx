"use client";

import Link from "next/link";
import { useRef } from "react";
import { Plus } from "lucide-react";
import { switchOrganization } from "@/app/actions/organization";
import { ROLE_LABELS } from "@/lib/constants";
import type { OrgRole } from "@/lib/types";

export function OrgSwitcher({
  current,
  options,
  role,
}: {
  current: string;
  options: { id: string; name: string }[];
  role: OrgRole;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const currentName = options.find((o) => o.id === current)?.name ?? "";
  return (
    <div className="rounded-xl bg-sidebar-hover p-3">
      {options.length > 1 ? (
        <form ref={formRef} action={switchOrganization}>
          <label htmlFor="org-switch" className="sr-only">
            Empresa activa
          </label>
          <select
            id="org-switch"
            name="organizationId"
            defaultValue={current}
            onChange={() => formRef.current?.requestSubmit()}
            className="w-full truncate rounded-md border-0 bg-transparent p-0 text-sm font-semibold text-white focus:ring-0"
          >
            {options.map((o) => (
              <option key={o.id} value={o.id} className="text-slate-900">
                {o.name}
              </option>
            ))}
          </select>
        </form>
      ) : (
        <p className="truncate text-sm font-semibold text-white">{currentName}</p>
      )}
      <div className="mt-1 flex items-center justify-between">
        <span className="text-xs text-sidebar-muted">{ROLE_LABELS[role]}</span>
        <Link href="/onboarding?nueva=1" className="inline-flex items-center gap-1 text-xs text-sidebar-muted hover:text-white">
          <Plus className="h-3 w-3" aria-hidden /> Negocio
        </Link>
      </div>
    </div>
  );
}
