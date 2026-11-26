import { addDays } from "./date-range";

export type CalendarView = "dia" | "semana" | "mes";
const TZ = "America/Asuncion";

/** 'YYYY-MM-DD' del instante en hora de Paraguay. */
export function dayKeyPy(iso: string | Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(typeof iso === "string" ? new Date(iso) : iso);
}

export function timePy(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-PY", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ });
}

/** Día de la semana 0=lunes … 6=domingo. */
export function weekdayMon(dateStr: string): number {
  return (new Date(`${dateStr}T12:00:00Z`).getUTCDay() + 6) % 7;
}

export function startOfWeek(dateStr: string): string {
  return addDays(dateStr, -weekdayMon(dateStr));
}

export function addMonths(dateStr: string, n: number): string {
  const [y, m] = dateStr.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 10);
}

/** Rango visible [desde, hasta) como fechas locales y la lista de días a dibujar. */
export function visibleRange(view: CalendarView, date: string): { from: string; to: string; days: string[] } {
  if (view === "dia") return { from: date, to: addDays(date, 1), days: [date] };
  if (view === "semana") {
    const from = startOfWeek(date);
    return { from, to: addDays(from, 7), days: Array.from({ length: 7 }, (_, i) => addDays(from, i)) };
  }
  const first = date.slice(0, 8) + "01";
  const from = startOfWeek(first);
  const nextMonth = addMonths(first, 1);
  const lastDay = addDays(nextMonth, -1);
  const to = addDays(startOfWeek(lastDay), 7);
  const days: string[] = [];
  for (let d = from; d < to; d = addDays(d, 1)) days.push(d);
  return { from, to, days };
}

export function shiftDate(view: CalendarView, date: string, dir: 1 | -1): string {
  if (view === "dia") return addDays(date, dir);
  if (view === "semana") return addDays(date, 7 * dir);
  return addMonths(date.slice(0, 8) + "01", dir);
}

export function pyDayStartIso(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00-03:00`).toISOString();
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function formatTitle(view: CalendarView, date: string): string {
  return cap(rawTitle(view, date));
}

function rawTitle(view: CalendarView, date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  if (view === "mes") return d.toLocaleDateString("es-PY", { month: "long", year: "numeric", timeZone: "UTC" });
  if (view === "dia") return d.toLocaleDateString("es-PY", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const from = startOfWeek(date);
  const to = addDays(from, 6);
  const f = new Date(`${from}T12:00:00Z`).toLocaleDateString("es-PY", { day: "numeric", month: "short", timeZone: "UTC" });
  const t = new Date(`${to}T12:00:00Z`).toLocaleDateString("es-PY", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  return `${f} – ${t}`;
}
