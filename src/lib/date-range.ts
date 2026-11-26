export type RangeKey = "7d" | "30d" | "90d" | "mes" | "anio" | "personalizado";

export const RANGE_OPTIONS: { id: RangeKey; label: string }[] = [
  { id: "7d", label: "Últimos 7 días" },
  { id: "30d", label: "Últimos 30 días" },
  { id: "90d", label: "Últimos 90 días" },
  { id: "mes", label: "Este mes" },
  { id: "anio", label: "Este año" },
  { id: "personalizado", label: "Personalizado" },
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PY_OFFSET = "-03:00"; // Paraguay usa UTC-3 todo el año desde 2024

function startOfDay(d: string) {
  return new Date(`${d}T00:00:00${PY_OFFSET}`);
}

/** Convierte la fecha actual a 'YYYY-MM-DD' en hora de Paraguay. */
export function todayInPy(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Asuncion" }).format(now);
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Resuelve el rango del filtro. Devuelve fechas [from, to) en ISO con zona de Paraguay.
 * 'desde'/'hasta' son inclusivos en la interfaz.
 */
export function resolveRange(
  params: { rango?: string; desde?: string; hasta?: string },
  now = new Date(),
): { key: RangeKey; from: Date; to: Date; desde: string; hasta: string } {
  const today = todayInPy(now);
  const key = (RANGE_OPTIONS.some((o) => o.id === params.rango) ? params.rango : "30d") as RangeKey;
  let desde: string;
  let hasta = today;

  switch (key) {
    case "7d":
      desde = addDays(today, -6);
      break;
    case "90d":
      desde = addDays(today, -89);
      break;
    case "mes":
      desde = today.slice(0, 8) + "01";
      break;
    case "anio":
      desde = today.slice(0, 5) + "01-01";
      break;
    case "personalizado": {
      const d = params.desde && DATE_RE.test(params.desde) ? params.desde : addDays(today, -29);
      const h = params.hasta && DATE_RE.test(params.hasta) ? params.hasta : today;
      desde = d <= h ? d : h;
      hasta = d <= h ? h : d;
      // máximo 3 años para proteger el rendimiento
      if (startOfDay(hasta).getTime() - startOfDay(desde).getTime() > 3 * 366 * 86400000) {
        desde = addDays(hasta, -3 * 365);
      }
      break;
    }
    default:
      desde = addDays(today, -29);
  }
  return { key, from: startOfDay(desde), to: startOfDay(addDays(hasta, 1)), desde, hasta };
}
