import type { ChatOptions, ChatResponse, LLMProvider, Message, PingResult, ProviderConfig } from './types';

/**
 * Custom OpenAI-Compatible provider —— 用户填 baseURL（DeepSeek/Moonshot/Together AI/SiliconFlow 等）。
 * 协议同 OpenAI Chat Completions。
 */
export const CustomOpenAICompatProvider: LLMProvider = {
  id: 'customOpenAICompat',
  displayName: 'Custom (OpenAI-Compatible)',
  requiresApiKey: true,
  defaultBaseUrl: 'https://api.deepseek.com/v1',
  defaultModel: 'deepseek-chat',
  suggestedModels: [
    'deepseek-chat',
    'deepseek-reasoner',
    'moonshot-v1-32k',
    'Qwen/Qwen2.5-72B-Instruct',
  ] as const,

  async chat(messages: Message[], config: ProviderConfig, options: ChatOptions = {}): Promise<ChatResponse> {
    if (!config.baseUrl) throw new Error('Custom provider 需要 Base URL');
    const baseUrl = config.baseUrl.replace(/\/$/, '');
    const model = config.model || this.defaultModel;
    const t0 = performance.now();

    const body: any = {
      model,
      messages,
      temperature: options.temperature ?? 0.3,
      max_tokens: options.maxTokens ?? 2048,
    };
    if (options.responseFormat === 'json_object') body.response_format = { type: 'json_object' };

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: options.signal,
    });
    if (!res.ok) throw new Error(`Custom HTTP ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return {
      content: data?.choices?.[0]?.message?.content ?? '',
      raw: data,
      latencyMs: performance.now() - t0,
    };
  },

  async ping(config: ProviderConfig): Promise<PingResult> {
    if (!config.baseUrl) return { ok: false, latencyMs: 0, error: '缺少 Base URL' };
    const baseUrl = config.baseUrl.replace(/\/$/, '');
    const t0 = performance.now();
    try {
      const headers: Record<string, string> = {};
      if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;
      const res = await fetch(`${baseUrl}/models`, { method: 'GET', headers });
      const latencyMs = performance.now() - t0;
      if (!res.ok) return { ok: false, latencyMs, error: `HTTP ${res.status}` };
      const data = await res.json();
      const models = Array.isArray(data?.data) ? data.data.map((m: any) => m.id) : undefined;
      return { ok: true, latencyMs, models };
    } catch (e: any) {
      return { ok: false, latencyMs: performance.now() - t0, error: e?.message || '连接失败' };
    }
  },
};
