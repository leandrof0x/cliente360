import "server-only";
import { serverEnv } from "@/lib/server-env";
import { AnthropicProvider, ANTHROPIC_DEFAULT_MODEL } from "./anthropic";
import type { AIProvider } from "./types";

export interface AIStatus {
  configured: boolean;
  provider: string;
  /** Qué variable falta, para mostrarla a quien administra la cuenta. */
  missing: string[];
}

export function getAIStatus(): AIStatus {
  const provider = serverEnv.aiProvider;
  if (provider === "anthropic") {
    const missing = serverEnv.anthropicApiKey ? [] : ["ANTHROPIC_API_KEY"];
    return { configured: missing.length === 0, provider, missing };
  }
  return { configured: false, provider, missing: [`AI_PROVIDER (proveedor "${provider}" no implementado)`] };
}

/** Devuelve el proveedor configurado o null si faltan credenciales. */
export function getAIProvider(): AIProvider | null {
  if (!getAIStatus().configured) return null;
  switch (serverEnv.aiProvider) {
    case "anthropic":
      return new AnthropicProvider(serverEnv.anthropicApiKey, serverEnv.aiModel || ANTHROPIC_DEFAULT_MODEL);
    default:
      return null;
  }
}
