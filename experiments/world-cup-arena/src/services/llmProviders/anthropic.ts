import type { ChatOptions, ChatResponse, LLMProvider, Message, PingResult, ProviderConfig } from './types';

/**
 * Anthropic Messages provider。
 * 文档：https://docs.anthropic.com/en/api/messages
 * 注意：浏览器直连需要 anthropic-dangerous-direct-browser-access: true（个人项目可接受）
 */
export const AnthropicProvider: LLMProvider = {
  id: 'anthropic',
  displayName: 'Anthropic (Claude)',
  requiresApiKey: true,
  defaultBaseUrl: 'https://api.anthropic.com/v1',
  defaultModel: 'claude-3-5-sonnet-latest',
  suggestedModels: [
    'claude-3-5-sonnet-latest',
    'claude-3-5-haiku-latest',
    'claude-3-opus-latest',
    'claude-sonnet-4-5',
  ] as const,

  async chat(messages: Message[], config: ProviderConfig, options: ChatOptions = {}): Promise<ChatResponse> {
    if (!config.apiKey) throw new Error('Anthropic 需要 API Key');
    const baseUrl = (config.baseUrl || this.defaultBaseUrl).replace(/\/$/, '');
    const model = config.model || this.defaultModel;
    const t0 = performance.now();

    // Anthropic 要求 system 单独传，user/assistant 在 messages 里
    const sys = messages.find((m) => m.role === 'system')?.content;
    const conv = messages.filter((m) => m.role !== 'system');

    const body: any = {
      model,
      max_tokens: options.maxTokens ?? 2048,
      temperature: options.temperature ?? 0.3,
      messages: conv.map((m) => ({ role: m.role, content: m.content })),
    };
    if (sys) body.system = sys;
    // Anthropic 没有原生 json_object 模式，靠 prompt 指令保证 JSON 输出

    const res = await fetch(`${baseUrl}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': config.extra?.['anthropic-version'] || '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify(body),
      signal: options.signal,
    });
    if (!res.ok) throw new Error(`Anthropic HTTP ${res.status}: ${await res.text()}`);
    const data = await res.json();
    const content = Array.isArray(data?.content)
      ? data.content
          .filter((b: any) => b.type === 'text')
          .map((b: any) => b.text)
          .join('')
      : '';
    return { content, raw: data, latencyMs: performance.now() - t0 };
  },

  async ping(config: ProviderConfig): Promise<PingResult> {
    if (!config.apiKey) return { ok: false, latencyMs: 0, error: '缺少 API Key' };
    const t0 = performance.now();
    try {
      // Anthropic 没有便宜的 GET 列表接口，用最小 chat 探活
      await this.chat(
        [{ role: 'user', content: 'ping' }],
        config,
        { maxTokens: 8, temperature: 0 }
      );
      return { ok: true, latencyMs: performance.now() - t0 };
    } catch (e: any) {
      return { ok: false, latencyMs: performance.now() - t0, error: e?.message || '连接失败' };
    }
  },
};
