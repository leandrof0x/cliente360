import { describe, expect, it } from "vitest";
import { organizationSchema, safeNext, signUpSchema } from "@/lib/validation";
import { formatGs, friendlyDbError } from "@/lib/utils";

describe("safeNext", () => {
  it("acepta rutas internas", () => expect(safeNext("/clientes")).toBe("/clientes"));
  it("rechaza redirecciones externas", () => {
    expect(safeNext("https://evil.com")).toBe("/dashboard");
    expect(safeNext("//evil.com")).toBe("/dashboard");
    expect(safeNext("/\\evil.com")).toBe("/dashboard");
    expect(safeNext(null)).toBe("/dashboard");
  });
});

describe("esquemas", () => {
  it("valida el registro", () => {
    expect(signUpSchema.safeParse({ fullName: "Ana", email: "ANA@X.COM ", password: "12345678" }).success).toBe(true);
    expect(signUpSchema.safeParse({ fullName: "A", email: "no", password: "123" }).success).toBe(false);
  });
  it("normaliza el correo", () => {
    const r = signUpSchema.parse({ fullName: "Ana", email: " ANA@X.COM ", password: "12345678" });
    expect(r.email).toBe("ana@x.com");
  });
  it("valida la empresa", () => {
    expect(organizationSchema.safeParse({ name: "Mi negocio", phone: "0981 123-456" }).success).toBe(true);
    expect(organizationSchema.safeParse({ name: "X", phone: "" }).success).toBe(false);
    expect(organizationSchema.safeParse({ name: "Mi negocio", phone: "abc" }).success).toBe(false);
  });
});

describe("formato y errores", () => {
  it("formatea guaraníes", () => expect(formatGs(1500000)).toMatch(/^Gs\. 1[.\s]500[.\s]000$/));
  it("traduce duplicados", () => expect(friendlyDbError({ code: "23505" })).toContain("duplicado"));
  it("traduce RLS", () => expect(friendlyDbError({ code: "42501", message: "new row violates row-level security policy" })).toContain("permisos"));
});
