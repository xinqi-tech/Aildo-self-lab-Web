import type { ChatOptions, ChatResponse, LLMProvider, Message, PingResult, ProviderConfig } from './types';

/**
 * 把用户配的 baseUrl 转成实际请求 URL：
 * 开发模式 + 默认 localhost:11434 → 走 Vite proxy `/api/ollama`，避开浏览器 CORS preflight。
 * （Ollama 默认 OLLAMA_ORIGINS 拒绝跨 origin POST，所以 GET ping 通但 POST chat 不通。）
 */
function effectiveBaseUrl(rawUrl: string): string {
  const url = rawUrl.replace(/\/$/, '');
  if (
    import.meta.env.DEV &&
    /^https?:\/\/(localhost|127\.0\.0\.1):11434$/.test(url)
  ) {
    return '/api/ollama';
  }
  return url;
}

/**
 * Ollama 本地 provider — 默认 http://localhost:11434
 * 文档：https://github.com/ollama/ollama/blob/main/docs/api.md
 */
export const OllamaProvider: LLMProvider = {
  id: 'ollama',
  displayName: 'Ollama (Local)',
  requiresApiKey: false,
  defaultBaseUrl: 'http://localhost:11434',
  defaultModel: 'llama3.2',
  suggestedModels: ['llama3.2', 'llama3.1', 'qwen2.5', 'mistral', 'gemma2'] as const,

  async chat(messages: Message[], config: ProviderConfig, options: ChatOptions = {}): Promise<ChatResponse> {
    const baseUrl = effectiveBaseUrl(config.baseUrl || this.defaultBaseUrl);
    const model = config.model || this.defaultModel;
    const t0 = performance.now();

    const body: any = {
      model,
      messages,
      stream: false,
      options: {
        temperature: options.temperature ?? 0.3,
        num_predict: options.maxTokens ?? 2048,
      },
    };
    if (options.responseFormat === 'json_object') body.format = 'json';

    const res = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: options.signal,
    });
    if (!res.ok) throw new Error(`Ollama HTTP ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return {
      content: data?.message?.content ?? '',
      raw: data,
      latencyMs: performance.now() - t0,
    };
  },

  async ping(config: ProviderConfig): Promise<PingResult> {
    const baseUrl = effectiveBaseUrl(config.baseUrl || this.defaultBaseUrl);
    const t0 = performance.now();
    try {
      const res = await fetch(`${baseUrl}/api/tags`, { method: 'GET' });
      const latencyMs = performance.now() - t0;
      if (!res.ok) return { ok: false, latencyMs, error: `HTTP ${res.status}` };
      const data = await res.json();
      const models = Array.isArray(data?.models) ? data.models.map((m: any) => m.name) : undefined;
      return { ok: true, latencyMs, models };
    } catch (e: any) {
      return {
        ok: false,
        latencyMs: performance.now() - t0,
        error: e?.message || '连接失败（Ollama 未启动？）',
      };
    }
  },
};
