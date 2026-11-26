import { describe, expect, it } from "vitest";
import { AnthropicProvider } from "@/lib/ai/anthropic";
import { AIProviderError } from "@/lib/ai/types";
import { AI_ACTIONS, buildSystemPrompt, buildUserPrompt, compact, clip, daysSince, pyDate } from "@/lib/ai/prompts";

describe("prompts de CLIENTE AI", () => {
  it("el sistema prohíbe inventar datos y trata los datos como información", () => {
    const s = buildSystemPrompt({ businessName: "Ferretería Sol", userName: "Ana", roleLabel: "Vendedor", today: "26/11/2026" });
    expect(s).toContain("Ferretería Sol");
    expect(s).toMatch(/Nunca inventes clientes, ventas/);
    expect(s).toMatch(/no instrucciones/);
  });

  it("delimita los datos y quita vacíos", () => {
    const p = buildUserPrompt({ action: "customer_summary", data: { cliente: { nombre: "Juan", email: null, notas: "" }, lista_x: [] } });
    expect(p.startsWith("<datos>")).toBe(true);
    expect(p).toContain('"nombre": "Juan"');
    expect(p).not.toContain("email");
    expect(p).toContain('"lista_x": []');
  });

  it("los borradores piden solo el texto y respetan el tono", () => {
    const formal = buildUserPrompt({ action: "follow_up_message", data: {}, tone: "formal" });
    expect(formal).toMatch(/usted/);
    const reply = buildUserPrompt({ action: "draft_reply", data: {}, incoming: "Hola, ¿tienen stock?" });
    expect(reply).toContain("Hola, ¿tienen stock?");
    expect(reply).toMatch(/\[precio\]/);
  });

  it("reportes y recomendaciones son solo para gestión", () => {
    expect(AI_ACTIONS.commercial_report.managersOnly).toBe(true);
    expect(AI_ACTIONS.conversion_tips.managersOnly).toBe(true);
    expect(AI_ACTIONS.draft_reply.isDraft).toBe(true);
  });

  it("helpers", () => {
    expect(clip("abcdef", 3)).toBe("abc…");
    expect(compact({ a: [{ b: null, c: 1 }] })).toEqual({ a: [{ c: 1 }] });
    expect(pyDate("2026-11-26")).toBe("26/11/2026");
    expect(daysSince("2026-11-20T12:00:00Z", new Date("2026-11-26T12:00:00Z"))).toBe(6);
  });
});

function mockFetch(status: number, body: unknown, seen: { url?: string; headers?: Headers; body?: Record<string, unknown> }) {
  return (async (url: string, init: RequestInit) => {
    seen.url = String(url);
    seen.headers = new Headers(init.headers);
    seen.body = JSON.parse(String(init.body));
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
}

const okMessage = (extra: Record<string, unknown> = {}) => ({
  id: "msg_1",
  type: "message",
  role: "assistant",
  model: "claude-opus-5-5",
  content: [{ type: "text", text: "Hola Juan, ¿cómo estás?" }],
  stop_reason: "end_turn",
  stop_sequence: null,
  usage: { input_tokens: 1000, output_tokens: 50, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
  ...extra,
});

describe("proveedor Anthropic", () => {
  it("envía modelo, esfuerzo, respaldo y devuelve texto y consumo", async () => {
    const seen: Parameters<typeof mockFetch>[2] = {};
    const p = new AnthropicProvider("sk-test", "claude-opus-5-5", { fetch: mockFetch(200, okMessage(), seen), maxRetries: 0 });
    const r = await p.generate({ system: "s", messages: [{ role: "user", content: "hola" }], maxTokens: 500, effort: "low" });
    expect(r.text).toBe("Hola Juan, ¿cómo estás?");
    expect(r.inputTokens).toBe(1000);
    expect(r.outputTokens).toBe(50);
    expect(seen.body?.model).toBe("claude-opus-5-5");
    expect(seen.body?.output_config).toEqual({ effort: "low" });
    expect(seen.body?.fallbacks).toBe("default");
    expect(seen.body).not.toHaveProperty("thinking");
    expect(seen.headers?.get("anthropic-beta")).toContain("server-side-fallback-2026-07-01");
    expect(seen.headers?.get("authorization") ?? seen.headers?.get("x-api-key")).toMatch(/sk-test/);
    expect(seen.url).toMatch(/^https:\/\/api\.anthropic\.com\/v1\/messages/);
  });

  it("una negativa del modelo se informa como error, no como respuesta", async () => {
    const p = new AnthropicProvider("k", undefined, { fetch: mockFetch(200, okMessage({ stop_reason: "refusal", content: [] }), {}), maxRetries: 0 });
    await expect(p.generate({ system: "s", messages: [{ role: "user", content: "x" }], maxTokens: 10, effort: "low" })).rejects.toMatchObject({ code: "refused" });
  });

  it("traduce errores de autenticación y de límite", async () => {
    const err = (status: number, type: string) => ({ type: "error", error: { type, message: "x" } });
    const auth = new AnthropicProvider("k", undefined, { fetch: mockFetch(401, err(401, "authentication_error"), {}), maxRetries: 0 });
    await expect(auth.generate({ system: "s", messages: [{ role: "user", content: "x" }], maxTokens: 10, effort: "low" })).rejects.toBeInstanceOf(AIProviderError);
    await expect(auth.generate({ system: "s", messages: [{ role: "user", content: "x" }], maxTokens: 10, effort: "low" })).rejects.toMatchObject({ code: "auth" });
    const rl = new AnthropicProvider("k", undefined, { fetch: mockFetch(429, err(429, "rate_limit_error"), {}), maxRetries: 0 });
    await expect(rl.generate({ system: "s", messages: [{ role: "user", content: "x" }], maxTokens: 10, effort: "low" })).rejects.toMatchObject({ code: "rate_limited" });
  });

  it("marca respuestas cortadas por longitud", async () => {
    const p = new AnthropicProvider("k", undefined, { fetch: mockFetch(200, okMessage({ stop_reason: "max_tokens" }), {}), maxRetries: 0 });
    const r = await p.generate({ system: "s", messages: [{ role: "user", content: "x" }], maxTokens: 10, effort: "low" });
    expect(r.truncated).toBe(true);
  });
});
