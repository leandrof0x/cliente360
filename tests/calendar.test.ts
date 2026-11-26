import { describe, expect, it } from "vitest";
import { dayKeyPy, shiftDate, startOfWeek, visibleRange, weekdayMon } from "@/lib/calendar";

describe("calendario", () => {
  it("la semana empieza el lunes", () => {
    expect(weekdayMon("2026-11-23")).toBe(0); // lunes
    expect(weekdayMon("2026-11-29")).toBe(6); // domingo
    expect(startOfWeek("2026-11-26")).toBe("2026-11-23");
    expect(startOfWeek("2026-11-29")).toBe("2026-11-23");
  });
  it("la vista mensual cubre semanas completas", () => {
    const r = visibleRange("mes", "2026-11-15");
    expect(r.from).toBe("2026-10-26");
    expect(r.days.length % 7).toBe(0);
    expect(r.days).toContain("2026-11-30");
    expect(r.to > "2026-11-30").toBe(true);
  });
  it("navega entre períodos", () => {
    expect(shiftDate("mes", "2026-12-20", 1)).toBe("2027-01-01");
    expect(shiftDate("semana", "2026-11-26", -1)).toBe("2026-11-19");
    expect(shiftDate("dia", "2026-02-28", 1)).toBe("2026-03-01");
  });
  it("usa la fecha local de Paraguay", () => {
    expect(dayKeyPy("2026-11-27T02:00:00Z")).toBe("2026-11-26");
  });
});
