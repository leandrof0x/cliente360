import { describe, expect, it } from "vitest";
import { exportDate, exportFileName, safeCell, toCsv } from "@/lib/export";

describe("exportación CSV", () => {
  it("usa ; y BOM para Excel en español, y escapa comillas", () => {
    const csv = toCsv([{ header: "Nombre", value: (r: { n: string }) => r.n }, { header: "Nota", value: () => 'dice "hola"; chau' }], [{ n: "Ana" }]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain("Nombre;Nota\r\n");
    expect(csv).toContain('Ana;"dice ""hola""; chau"');
  });

  it("neutraliza fórmulas", () => {
    expect(safeCell("=HYPERLINK(\"x\")")).toBe("'=HYPERLINK(\"x\")");
    expect(safeCell("+595981")).toBe("'+595981");
    expect(safeCell("Juan")).toBe("Juan");
    expect(safeCell(1500000)).toBe("1500000");
    expect(safeCell(true)).toBe("Sí");
    expect(safeCell(null)).toBe("");
  });

  it("nombres y fechas", () => {
    expect(exportFileName("clientes")).toBe("cliente360_clientes.csv");
    expect(exportFileName("reporte", "2026-11-01", "2026-11-26", "xlsx")).toBe("cliente360_reporte_2026-11-01_a_2026-11-26.xlsx");
    expect(exportDate("2026-11-26")).toBe("26/11/2026");
    expect(exportDate("2026-11-27T01:00:00Z")).toBe("26/11/2026");
  });
});
