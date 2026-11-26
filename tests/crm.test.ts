import { describe, expect, it } from "vitest";
import { customerSchema, isoToPyLocal, leadSchema, pyLocalToIso, sanitizeSearch, waNumber } from "@/lib/crm";
import { normalizePhone } from "@/lib/phone";

describe("teléfonos", () => {
  it("normaliza igual que la base de datos", () => {
    expect(normalizePhone("0981 123 456")).toBe("595981123456");
    expect(normalizePhone("+595 981 123456")).toBe("595981123456");
    expect(normalizePhone("(021) 600-100")).toBe("59521600100");
    expect(normalizePhone("123")).toBeNull();
    expect(normalizePhone(null)).toBeNull();
  });
  it("arma el número de WhatsApp", () => {
    expect(waNumber("0981 123-456")).toBe("595981123456");
    expect(waNumber("+54 9 11 1234 5678")).toBe("5491112345678");
    expect(waNumber("12")).toBeNull();
  });
});

describe("fechas en hora de Paraguay", () => {
  it("datetime-local -> ISO", () => {
    expect(pyLocalToIso("2026-11-26T09:30")).toBe("2026-11-26T12:30:00.000Z");
    expect(pyLocalToIso("mañana")).toBeNull();
    expect(pyLocalToIso(null)).toBeNull();
  });
  it("ISO -> datetime-local", () => {
    expect(isoToPyLocal("2026-11-26T12:30:00.000Z")).toBe("2026-11-26T09:30");
    expect(isoToPyLocal(null)).toBe("");
  });
});

describe("búsqueda", () => {
  it("elimina caracteres que alteran el filtro", () => {
    expect(sanitizeSearch("ana,status.eq.x)")).toBe("ana status eq x");
    expect(sanitizeSearch("  juan   pérez ")).toBe("juan pérez");
    expect(sanitizeSearch(undefined)).toBe("");
  });
});

describe("esquema de cliente", () => {
  it("limpia etiquetas y vacíos", () => {
    const r = customerSchema.parse({ full_name: " Ana ", tags: "VIP, mayorista, vip, ", email: "", phone: "" });
    expect(r.full_name).toBe("Ana");
    expect(r.tags).toEqual(["vip", "mayorista"]);
    expect(r.email).toBeNull();
    expect(r.phone).toBeNull();
    expect(r.status).toBe("nuevo");
  });
  it("rechaza datos inválidos", () => {
    expect(customerSchema.safeParse({ full_name: "" }).success).toBe(false);
    expect(customerSchema.safeParse({ full_name: "A", email: "x@" }).success).toBe(false);
    expect(customerSchema.safeParse({ full_name: "A", phone: "abc" }).success).toBe(false);
    expect(customerSchema.safeParse({ full_name: "A", assigned_to: "no-uuid" }).success).toBe(false);
  });
});

describe("esquema de oportunidad", () => {
  const base = { customer_id: "3f1c2b9e-1d2a-4c3b-9e8f-7a6b5c4d3e2f", title: "Presupuesto" };
  it("redondea el valor y aplica el estado por defecto", () => {
    const r = leadSchema.parse({ ...base, estimated_value: "1500000.6" });
    expect(r.estimated_value).toBe(1500001);
    expect(r.status).toBe("nueva");
  });
  it("rechaza valores negativos y estados inválidos", () => {
    expect(leadSchema.safeParse({ ...base, estimated_value: "-1" }).success).toBe(false);
    expect(leadSchema.safeParse({ ...base, estimated_value: "1", status: "x" }).success).toBe(false);
  });
});
