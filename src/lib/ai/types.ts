/**
 * Contrato del proveedor de IA. CLIENTE360 no depende de un proveedor concreto:
 * cualquier implementación (Anthropic, OpenAI, un modelo local, etc.) solo
 * necesita cumplir esta interfaz y registrarse en `src/lib/ai/index.ts`.
 */
export type AIEffort = "low" | "medium" | "high";

export interface AIMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AIRequest {
  system: string;
  messages: AIMessage[];
  maxTokens: number;
  /** Cuánto razonamiento invertir: bajo para borradores, medio para análisis. */
  effort: AIEffort;
}

export interface AIResult {
  text: string;
  /** Modelo que efectivamente respondió (puede diferir si hubo un respaldo). */
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** La respuesta se cortó por longitud. */
  truncated: boolean;
}

export type AIErrorCode =
  | "not_configured"
  | "auth"
  | "rate_limited"
  | "overloaded"
  | "refused"
  | "timeout"
  | "bad_request"
  | "unknown";

export class AIProviderError extends Error {
  constructor(
    public code: AIErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AIProviderError";
  }
}

export interface AIProvider {
  readonly id: string;
  readonly model: string;
  generate(req: AIRequest): Promise<AIResult>;
}
