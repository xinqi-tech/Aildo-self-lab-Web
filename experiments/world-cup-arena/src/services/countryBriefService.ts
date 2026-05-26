/**
 * 国家百科 brief 服务：动态生成历史 / 文化 / 足球 3 类内容并缓存。
 *
 * 设计原则：
 *  - 独立 Dexie db（wca-country-briefs），不和 wca-daily / wca-db 混
 *  - 缓存 key = `${iso3}-${kind}-${level}`：换尺度自动重新生成
 *  - 失败兜底：返回 error 让 UI 自己决定怎么展示
 *  - 30s 超时：与 daily / referee 一致
 */

import Dexie, { type Table } from 'dexie';
import historyPrompt from '@/prompts/countryHistory.txt?raw';
import culturePrompt from '@/prompts/countryCulture.txt?raw';
import footballPrompt from '@/prompts/countryFootball.txt?raw';
import { useSettingsStore } from '@/stores/settings';
import { getProvider } from '@/services/llmProviders';
import type { Country } from '@/data/countries';

// ── 类型 ───────────────────────────────────────────────

export type BriefKind = 'history' | 'culture' | 'football';

export interface HistoryEvent {
  year: string;
  event: string;
  detail: string;
}
export interface HistoryContent {
  summary: string;
  timeline: HistoryEvent[];
}

export interface CultureContent {
  summary: string;
  art: string;
  literature: string;
  festival: string;
  cuisine: string;
  philosophy: string;
}

export interface WorldCupRecord {
  year: string;
  result: string;
}
export interface FootballContent {
  summary: string;
  world_cup_history: WorldCupRecord[];
  legends: string[];
  style: string;
  current_2026: string;
}

export type BriefContent = HistoryContent | CultureContent | FootballContent;

export interface BriefResult<T = BriefContent> {
  content: T | null;
  cached: boolean;
  raw?: string;
  error?: string;
  /** 生成时间（毫秒 epoch） */
  generatedAt?: number;
  /** 生成时使用的 provider id */
  provider?: string;
  /** 生成时使用的 model 名 */
  model?: string;
}

// ── Dexie ──────────────────────────────────────────────

interface BriefCacheRow {
  key: string; // `${iso3}-${kind}-${level}`
  iso3: string;
  kind: BriefKind;
  level: string;
  content: any; // 解析后的 JSON
  raw: string; // 原始 LLM 返回
  generatedAt: number;
  provider: string;
  model: string;
}

class BriefDb extends Dexie {
  briefs!: Table<BriefCacheRow, string>;
  constructor() {
    super('wca-country-briefs');
    this.version(1).stores({
      briefs: 'key, iso3, kind, generatedAt',
    });
  }
}
const bdb = new BriefDb();

// ── prompt 路由 ────────────────────────────────────────

const PROMPT_MAP: Record<BriefKind, string> = {
  history: historyPrompt,
  culture: culturePrompt,
  football: footballPrompt,
};

const KIND_LABEL: Record<BriefKind, string> = {
  history: '历史',
  culture: '文化',
  football: '足球',
};

// ── helpers ────────────────────────────────────────────

/** 从 LLM 字符串里把 JSON 抠出来；忽略 ```json 包装与首尾噪音 */
function safeParseJson(raw: string): any {
  if (!raw) return null;
  const stripped = raw
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
  try {
    return JSON.parse(stripped);
  } catch {
    const start = stripped.indexOf('{');
    const end = stripped.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(stripped.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

const TIMEOUT_MS = 60_000;

function withTimeout<T>(p: Promise<T>, ms: number, label = 'Brief LLM'): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timeout ${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

function fillTemplate(template: string, country: Country, level: string): string {
  return template
    .split('{countryZh}').join(country.nameZh)
    .split('{countryEn}').join(country.nameEn)
    .split('{confederation}').join(country.confederation)
    .split('{level}').join(level);
}

function cacheKey(iso3: string, kind: BriefKind, level: string): string {
  return `${iso3}-${kind}-${level.toLowerCase()}`;
}

// ── 简单字段校验 ────────────────────────────────────────

function validate(kind: BriefKind, obj: any): boolean {
  if (!obj || typeof obj !== 'object') return false;
  if (typeof obj.summary !== 'string' || !obj.summary.trim()) return false;
  if (kind === 'history') {
    return Array.isArray(obj.timeline) && obj.timeline.length > 0;
  }
  if (kind === 'culture') {
    return (
      typeof obj.art === 'string' &&
      typeof obj.literature === 'string' &&
      typeof obj.festival === 'string' &&
      typeof obj.cuisine === 'string' &&
      typeof obj.philosophy === 'string'
    );
  }
  if (kind === 'football') {
    return (
      Array.isArray(obj.world_cup_history) &&
      Array.isArray(obj.legends) &&
      typeof obj.style === 'string' &&
      typeof obj.current_2026 === 'string'
    );
  }
  return false;
}

// ── 主入口 ─────────────────────────────────────────────

/**
 * 拿 country brief：先查 Dexie，命中即返回；否则调 LLM + 写回缓存。
 *
 * @param force true 时强制重新生成（删 cache 再调）
 */
export async function getBrief<T extends BriefContent = BriefContent>(
  country: Country,
  kind: BriefKind,
  force = false
): Promise<BriefResult<T>> {
  const settings = useSettingsStore();
  const level = String(settings.state.contentLevel).toLowerCase();
  const key = cacheKey(country.iso3, kind, level);

  // 1. 缓存命中
  if (!force) {
    try {
      const cached = await bdb.briefs.get(key);
      if (cached?.content && validate(kind, cached.content)) {
        return {
          content: cached.content as T,
          cached: true,
          raw: cached.raw,
          generatedAt: cached.generatedAt,
          provider: cached.provider,
          model: cached.model,
        };
      }
    } catch (e) {
      console.warn(`[brief] Dexie 读失败（${key}），继续走 LLM`, e);
    }
  } else {
    try {
      await bdb.briefs.delete(key);
    } catch {
      /* ignore */
    }
  }

  // 2. 调 LLM
  const providerId = settings.state.activeProvider;
  const cfg = settings.state.providers[providerId];

  let provider;
  try {
    provider = getProvider(providerId);
  } catch {
    return { content: null, cached: false, error: `provider 不存在: ${providerId}` };
  }
  if (provider.requiresApiKey && !cfg?.apiKey) {
    return {
      content: null,
      cached: false,
      error: `${provider.displayName} 需要 API Key，去 /settings 配置`,
    };
  }

  const template = PROMPT_MAP[kind];
  const prompt = fillTemplate(template, country, level);
  const systemPrompt = `你是 ${KIND_LABEL[kind]}百科作家，输出必须是单个合法 JSON 对象，不要 markdown 包装、不要解释、不要 emoji。`;

  console.group(`📜 [brief] ${country.iso3} · ${kind} · ${level}`);
  console.log('Provider:', providerId, '· Model:', cfg?.model);
  console.log('Prompt length:', prompt.length);

  const start = performance.now();
  try {
    const res = await withTimeout(
      provider.chat(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: prompt },
        ],
        cfg,
        { temperature: 0.4, responseFormat: 'json_object', maxTokens: 1500 }
      ),
      TIMEOUT_MS,
      `Brief LLM (${kind})`
    );
    const durationMs = Math.round(performance.now() - start);
    console.log(`✅ LLM 响应 ${durationMs}ms`);

    const parsed = safeParseJson(res.content);
    if (!parsed || !validate(kind, parsed)) {
      const preview = (res.content || '').replace(/\s+/g, ' ').slice(0, 80);
      console.warn('❌ 解析/校验失败', { parsed, preview });
      console.groupEnd();
      return {
        content: null,
        cached: false,
        raw: res.content,
        error: `LLM 返回结构不符合 ${kind} 模式: "${preview}…"`,
      };
    }

    const generatedAt = Date.now();
    try {
      await bdb.briefs.put({
        key,
        iso3: country.iso3,
        kind,
        level,
        content: parsed,
        raw: res.content,
        generatedAt,
        provider: providerId,
        model: cfg?.model || provider.defaultModel,
      });
    } catch (e) {
      console.warn('[brief] Dexie 写失败', e);
    }
    console.groupEnd();

    return {
      content: parsed as T,
      cached: false,
      raw: res.content,
      generatedAt,
      provider: providerId,
      model: cfg?.model || provider.defaultModel,
    };
  } catch (e: any) {
    console.warn(`❌ LLM 失败`, e);
    console.groupEnd();
    return { content: null, cached: false, error: e?.message || String(e) };
  }
}

/** 删除指定 country/kind 的所有 level 缓存（不常用） */
export async function clearBrief(iso3: string, kind: BriefKind): Promise<void> {
  try {
    const rows = await bdb.briefs.where({ iso3, kind }).toArray();
    await Promise.all(rows.map((r) => bdb.briefs.delete(r.key)));
  } catch (e) {
    console.warn('[brief] clearBrief 失败', e);
  }
}

/** 删整张表（仅 debug 用） */
export async function clearAllBriefs(): Promise<void> {
  try {
    await bdb.briefs.clear();
  } catch (e) {
    console.warn('[brief] clearAllBriefs 失败', e);
  }
}
