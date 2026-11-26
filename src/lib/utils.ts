import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const gsFormatter = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 });

/** Formatea guaraníes: 1500000 -> "Gs. 1.500.000" */
export function formatGs(value: number | null | undefined): string {
  return `Gs. ${gsFormatter.format(Math.round(Number(value ?? 0)))}`;
}

/** Versión compacta para gráficos: 1500000 -> "1,5 M" */
export function formatGsCompact(value: number): string {
  const v = Math.abs(value);
  if (v >= 1_000_000_000) return `${(value / 1_000_000_000).toLocaleString("es-PY", { maximumFractionDigits: 1 })} MM`;
  if (v >= 1_000_000) return `${(value / 1_000_000).toLocaleString("es-PY", { maximumFractionDigits: 1 })} M`;
  if (v >= 1_000) return `${(value / 1_000).toLocaleString("es-PY", { maximumFractionDigits: 0 })} mil`;
  return gsFormatter.format(value);
}

export function formatNumber(value: number | null | undefined): string {
  return gsFormatter.format(Number(value ?? 0));
}

export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

/** Traduce errores de Postgres/Supabase a mensajes claros para el usuario. */
export function friendlyDbError(error: { code?: string; message?: string; hint?: string } | null): string {
  if (!error) return "Ocurrió un error inesperado.";
  switch (error.code) {
    case "23505":
      return "Ya existe un registro con esos datos (teléfono o correo duplicado).";
    case "42501":
      if (error.message && !error.message.includes("row-level security")) return error.message;
      return "No tenés permisos para realizar esta acción o tu cuenta está en modo solo lectura.";
    case "23503":
      return error.message ?? "La referencia indicada no es válida.";
    case "P0001":
    case "P0002":
    case "22023":
      return error.message ?? "Operación no permitida.";
    default:
      return "No se pudo completar la operación. Intentá de nuevo.";
  }
}
