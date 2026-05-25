/**
 * LLM Provider 抽象接口。
 * 详见 docs/world-cup-arena/design.md §5.2
 */

export type ProviderId = 'ollama' | 'openai' | 'anthropic' | 'gemini' | 'customOpenAICompat';

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  temperature?: number;
  responseFormat?: 'text' | 'json_object';
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface ChatResponse {
  content: string;
  raw?: any;
  latencyMs?: number;
}

export interface PingResult {
  ok: boolean;
  latencyMs: number;
  error?: string;
  /** Provider 自报的可用模型（如果接口提供） */
  models?: string[];
}

/** Settings store 中保存的每个 provider 的用户配置 */
export interface ProviderConfig {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  /** Anthropic 需要的版本号、Gemini 等扩展字段都塞这里 */
  extra?: Record<string, string>;
}

export interface LLMProvider {
  readonly id: ProviderId;
  readonly displayName: string;
  readonly requiresApiKey: boolean;
  readonly defaultBaseUrl: string;
  readonly defaultModel: string;
  /** 内置可选模型，仅用于 UI 下拉提示，用户可自填 */
  readonly suggestedModels: readonly string[];

  chat(messages: Message[], config: ProviderConfig, options?: ChatOptions): Promise<ChatResponse>;

  ping(config: ProviderConfig): Promise<PingResult>;
}
