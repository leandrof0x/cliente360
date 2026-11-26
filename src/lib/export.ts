/**
 * Exportación a CSV (compatible con Excel en español: separador ";" y BOM UTF-8).
 * Archivo puro para poder probarlo.
 */
export interface ExportColumn<T> {
  header: string;
  value: (row: T) => string | number | boolean | null | undefined;
  /** Ancho sugerido en Excel */
  width?: number;
  kind?: "text" | "number" | "money" | "date";
}

/** Evita la inyección de fórmulas al abrir el archivo en una planilla. */
export function safeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return s;
}

function csvEscape(s: string): string {
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv<T>(columns: ExportColumn<T>[], rows: T[]): string {
  const lines = [columns.map((c) => csvEscape(c.header)).join(";")];
  for (const row of rows) lines.push(columns.map((c) => csvEscape(safeCell(c.value(row)))).join(";"));
  return `﻿${lines.join("\r\n")}\r\n`;
}

export function exportFileName(kind: string, desde?: string, hasta?: string, ext = "csv") {
  const safe = kind.replace(/[^a-z0-9-]/gi, "").toLowerCase() || "datos";
  const range = desde && hasta ? `_${desde}_a_${hasta}` : "";
  return `cliente360_${safe}${range}.${ext}`;
}

const pyDate = new Intl.DateTimeFormat("es-PY", { timeZone: "America/Asuncion", day: "2-digit", month: "2-digit", year: "numeric" });
const pyDateTime = new Intl.DateTimeFormat("es-PY", {
  timeZone: "America/Asuncion",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** Fecha legible en hora de Paraguay (dd/mm/aaaa). */
export function exportDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00-03:00` : iso);
  return Number.isNaN(d.getTime()) ? "" : pyDate.format(d);
}

export function exportDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : pyDateTime.format(d);
}
