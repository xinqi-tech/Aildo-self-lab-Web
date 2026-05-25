import type { ChatOptions, ChatResponse, LLMProvider, Message, PingResult, ProviderConfig } from './types';

/**
 * OpenAI Chat Completions provider。
 * 文档：https://platform.openai.com/docs/api-reference/chat
 */
export const OpenAIProvider: LLMProvider = {
  id: 'openai',
  displayName: 'OpenAI',
  requiresApiKey: true,
  defaultBaseUrl: 'https://api.openai.com/v1',
  defaultModel: 'gpt-4o-mini',
  suggestedModels: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'] as const,

  async chat(messages: Message[], config: ProviderConfig, options: ChatOptions = {}): Promise<ChatResponse> {
    if (!config.apiKey) throw new Error('OpenAI 需要 API Key');
    const baseUrl = (config.baseUrl || this.defaultBaseUrl).replace(/\/$/, '');
    const model = config.model || this.defaultModel;
    const t0 = performance.now();

    const body: any = {
      model,
      messages,
      temperature: options.temperature ?? 0.3,
      max_tokens: options.maxTokens ?? 2048,
    };
    if (options.responseFormat === 'json_object') body.response_format = { type: 'json_object' };

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: options.signal,
    });
    if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}: ${await res.text()}`);
    const data = await res.json();
    return {
      content: data?.choices?.[0]?.message?.content ?? '',
      raw: data,
      latencyMs: performance.now() - t0,
    };
  },

  async ping(config: ProviderConfig): Promise<PingResult> {
    if (!config.apiKey) return { ok: false, latencyMs: 0, error: '缺少 API Key' };
    const baseUrl = (config.baseUrl || this.defaultBaseUrl).replace(/\/$/, '');
    const t0 = performance.now();
    try {
      const res = await fetch(`${baseUrl}/models`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${config.apiKey}` },
      });
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
