import type { ChatOptions, ChatResponse, LLMProvider, Message, PingResult, ProviderConfig } from './types';

/**
 * Google Gemini provider（generateContent REST）。
 * 文档：https://ai.google.dev/gemini-api/docs/text-generation
 */
export const GeminiProvider: LLMProvider = {
  id: 'gemini',
  displayName: 'Google Gemini',
  requiresApiKey: true,
  defaultBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
  defaultModel: 'gemini-2.0-flash',
  suggestedModels: [
    'gemini-2.0-flash',
    'gemini-2.0-flash-exp',
    'gemini-1.5-pro',
    'gemini-1.5-flash',
  ] as const,

  async chat(messages: Message[], config: ProviderConfig, options: ChatOptions = {}): Promise<ChatResponse> {
    if (!config.apiKey) throw new Error('Gemini 需要 API Key');
    const baseUrl = (config.baseUrl || this.defaultBaseUrl).replace(/\/$/, '');
    const model = config.model || this.defaultModel;
    const t0 = performance.now();

    const sys = messages.find((m) => m.role === 'system')?.content;
    const conv = messages.filter((m) => m.role !== 'system');

    const body: any = {
      contents: conv.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
      generationConfig: {
        temperature: options.temperature ?? 0.3,
        maxOutputTokens: options.maxTokens ?? 2048,
      },
    };
    if (sys) body.systemInstruction = { parts: [{ text: sys }] };
    if (options.responseFormat === 'json_object') {
      body.generationConfig.responseMimeType = 'application/json';
    }

    const url = `${baseUrl}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(
      config.apiKey
    )}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: options.signal,
    });
    if (!res.ok) throw new Error(`Gemini HTTP ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const content =
      data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') ?? '';
    return { content, raw: data, latencyMs: performance.now() - t0 };
  },

  async ping(config: ProviderConfig): Promise<PingResult> {
    if (!config.apiKey) return { ok: false, latencyMs: 0, error: '缺少 API Key' };
    const baseUrl = (config.baseUrl || this.defaultBaseUrl).replace(/\/$/, '');
    const t0 = performance.now();
    try {
      const res = await fetch(`${baseUrl}/models?key=${encodeURIComponent(config.apiKey)}`, {
        method: 'GET',
      });
      const latencyMs = performance.now() - t0;
      if (!res.ok) return { ok: false, latencyMs, error: `HTTP ${res.status}` };
      const data = await res.json();
      const models = Array.isArray(data?.models)
        ? data.models.map((m: any) => m.name?.replace(/^models\//, ''))
        : undefined;
      return { ok: true, latencyMs, models };
    } catch (e: any) {
      return { ok: false, latencyMs: performance.now() - t0, error: e?.message || '连接失败' };
    }
  },
};
