import { describe, expect, it } from "vitest";
import { addDays, resolveRange, todayInPy } from "@/lib/date-range";

const NOW = new Date("2026-11-26T02:30:00Z"); // 25/11 23:30 en Paraguay

describe("todayInPy", () => {
  it("usa la hora de Paraguay (UTC-3)", () => {
    expect(todayInPy(NOW)).toBe("2026-11-25");
  });
});

describe("resolveRange", () => {
  it("por defecto son los últimos 30 días incluyendo hoy", () => {
    const r = resolveRange({}, NOW);
    expect(r.key).toBe("30d");
    expect(r.desde).toBe("2026-10-27");
    expect(r.hasta).toBe("2026-11-25");
    expect(r.from.toISOString()).toBe("2026-10-27T03:00:00.000Z");
    expect(r.to.toISOString()).toBe("2026-11-26T03:00:00.000Z");
  });
  it("este mes empieza el día 1", () => {
    expect(resolveRange({ rango: "mes" }, NOW).desde).toBe("2026-11-01");
  });
  it("este año empieza el 1 de enero", () => {
    expect(resolveRange({ rango: "anio" }, NOW).desde).toBe("2026-01-01");
  });
  it("personalizado ordena fechas invertidas", () => {
    const r = resolveRange({ rango: "personalizado", desde: "2026-11-10", hasta: "2026-11-01" }, NOW);
    expect(r.desde).toBe("2026-11-01");
    expect(r.hasta).toBe("2026-11-10");
  });
  it("personalizado ignora fechas inválidas", () => {
    const r = resolveRange({ rango: "personalizado", desde: "x'; drop table", hasta: "2026-11-20" }, NOW);
    expect(r.desde).toBe(addDays("2026-11-25", -29));
  });
  it("rango desconocido vuelve al valor por defecto", () => {
    expect(resolveRange({ rango: "999d" }, NOW).key).toBe("30d");
  });
});
