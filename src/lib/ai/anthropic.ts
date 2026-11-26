import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { AIProviderError, type AIProvider, type AIRequest, type AIResult } from "./types";

export const ANTHROPIC_DEFAULT_MODEL = "claude-opus-5-5";

/** Implementación con Claude (Anthropic). La clave vive solo en el servidor. */
export class AnthropicProvider implements AIProvider {
  readonly id = "anthropic";
  private client: Anthropic;

  constructor(
    apiKey: string,
    readonly model: string = ANTHROPIC_DEFAULT_MODEL,
    /** Solo para pruebas: reemplaza el transporte HTTP. */
    options: { fetch?: typeof fetch; maxRetries?: number } = {},
  ) {
    this.client = new Anthropic({
      apiKey,
      // Explícito: no tomar credenciales ni URL de otras variables del entorno
      authToken: null,
      baseURL: "https://api.anthropic.com",
      maxRetries: options.maxRetries ?? 1,
      timeout: 50_000,
      fetch: options.fetch,
    });
  }

  async generate(req: AIRequest): Promise<AIResult> {
    let message: Anthropic.Beta.BetaMessage;
    try {
      message = await this.client.beta.messages.create({
        model: this.model,
        max_tokens: req.maxTokens,
        system: req.system,
        messages: req.messages,
        output_config: { effort: req.effort },
        // Si el modelo principal no puede atender, la API usa su respaldo por defecto
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      });
    } catch (error) {
      throw mapError(error);
    }

    if (message.stop_reason === "refusal") {
      throw new AIProviderError("refused", "El asistente no puede responder esta solicitud. Reformulala, por favor.");
    }

    const text = message.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    if (!text) throw new AIProviderError("unknown", "El asistente no devolvió texto. Probá de nuevo.");

    const u = message.usage;
    return {
      text,
      model: message.model,
      inputTokens: (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0),
      outputTokens: u.output_tokens ?? 0,
      truncated: message.stop_reason === "max_tokens",
    };
  }
}

function mapError(error: unknown): AIProviderError {
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return new AIProviderError("auth", "La clave de la API de IA no es válida o no tiene permisos. Revisá ANTHROPIC_API_KEY.");
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new AIProviderError("rate_limited", "El proveedor de IA está limitando las consultas. Probá en un minuto.");
  }
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return new AIProviderError("timeout", "El asistente tardó demasiado en responder. Probá de nuevo.");
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return new AIProviderError("timeout", "No se pudo conectar con el proveedor de IA. Probá de nuevo.");
  }
  if (error instanceof Anthropic.BadRequestError) {
    return new AIProviderError("bad_request", "La solicitud al asistente no es válida. Si persiste, avisá al soporte.");
  }
  if (error instanceof Anthropic.InternalServerError || (error instanceof Anthropic.APIError && error.status === 529)) {
    return new AIProviderError("overloaded", "El proveedor de IA está saturado en este momento. Probá en unos minutos.");
  }
  console.error("[CLIENTE AI] error del proveedor", error);
  return new AIProviderError("unknown", "No se pudo completar la consulta al asistente.");
}
