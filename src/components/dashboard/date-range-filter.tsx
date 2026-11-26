"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";
import { CalendarDays, Loader2 } from "lucide-react";
import { RANGE_OPTIONS, type RangeKey } from "@/lib/date-range";
import { Button } from "@/components/ui/button";

export function DateRangeFilter({ value, desde, hasta }: { value: RangeKey; desde: string; hasta: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const [custom, setCustom] = useState(value === "personalizado");
  const [from, setFrom] = useState(desde);
  const [to, setTo] = useState(hasta);

  function apply(next: Record<string, string>) {
    const sp = new URLSearchParams(params.toString());
    ["rango", "desde", "hasta"].forEach((k) => sp.delete(k));
    Object.entries(next).forEach(([k, v]) => sp.set(k, v));
    start(() => router.push(`?${sp.toString()}`, { scroll: false }));
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
        <label htmlFor="rango" className="sr-only">
          Período
        </label>
        <select
          id="rango"
          value={custom ? "personalizado" : value}
          onChange={(e) => {
            const v = e.target.value as RangeKey;
            if (v === "personalizado") setCustom(true);
            else {
              setCustom(false);
              apply({ rango: v });
            }
          }}
          className="h-9 rounded-lg border border-slate-200 bg-white pl-9 pr-8 text-sm font-medium text-slate-700 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-100"
        >
          {RANGE_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      {custom && (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            apply({ rango: "personalizado", desde: from, hasta: to });
          }}
        >
          <input
            type="date"
            aria-label="Desde"
            value={from}
            max={to}
            onChange={(e) => setFrom(e.target.value)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm shadow-sm"
            required
          />
          <span className="text-sm text-slate-400">a</span>
          <input
            type="date"
            aria-label="Hasta"
            value={to}
            min={from}
            onChange={(e) => setTo(e.target.value)}
            className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-sm shadow-sm"
            required
          />
          <Button type="submit" size="sm">
            Aplicar
          </Button>
        </form>
      )}
      {pending && <Loader2 className="h-4 w-4 animate-spin text-slate-400" aria-label="Actualizando" />}
    </div>
  );
}
