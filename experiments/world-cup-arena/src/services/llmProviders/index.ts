import { OllamaProvider } from './ollama';
import { OpenAIProvider } from './openai';
import { AnthropicProvider } from './anthropic';
import { GeminiProvider } from './gemini';
import { CustomOpenAICompatProvider } from './customOpenAICompat';
import type { LLMProvider, ProviderId } from './types';

export const PROVIDERS: readonly LLMProvider[] = [
  OllamaProvider,
  OpenAIProvider,
  AnthropicProvider,
  GeminiProvider,
  CustomOpenAICompatProvider,
];

export const PROVIDERS_BY_ID: Record<ProviderId, LLMProvider> = Object.fromEntries(
  PROVIDERS.map((p) => [p.id, p])
) as Record<ProviderId, LLMProvider>;

export function getProvider(id: ProviderId): LLMProvider {
  const p = PROVIDERS_BY_ID[id];
  if (!p) throw new Error(`未知 provider: ${id}`);
  return p;
}

export * from './types';
