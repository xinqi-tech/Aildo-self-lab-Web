/**
 * 今日聚焦服务：每天选一个 48 强国家 + 调 LLM 写 80-120 字"侧切角度"短文。
 *
 * 设计原则：
 *  - 选国规则：day-of-year 取模 48，保证 "今天是 X" 对任何打开时间都是同一个结果
 *  - 缓存：Dexie meta 表 key=`daily-${YYYY-MM-DD}-${iso3}-${level}`，
 *    同一天 + 同一国 + 同一档不重复调 LLM（节省 quota，也保证看到一致内容）
 *  - localStorage 单独存 last-seen 日期，DailyFeature 路由可以用它判断"今天是否首次打开"
 *  - 失败兜底：返回 LLM 错误信息让 UI 提示去配 Provider
 */

import Dexie, { type Table } from 'dexie';
import dailyPromptTemplate from '@/prompts/dailyFeature.txt?raw';
import { COUNTRIES, type Country } from '@/data/countries';
import { useSettingsStore } from '@/stores/settings';
import { getProvider } from '@/services/llmProviders';

// ── Dexie meta 表（独立 db，不和 wca-db 混） ─────────
class DailyDb extends Dexie {
  cache!: Table<{ key: string; brief: string; createdAt: number }, string>;
  constructor() {
    super('wca-daily');
    this.version(1).stores({
      cache: 'key, createdAt',
    });
  }
}
const db = new DailyDb();

// ── 选国 ──────────────────────────────────────────────

/**
 * 给定日期返回今日聚焦国家。
 * 算法：自 2026-01-01 起的 day-of-year 取模 COUNTRIES.length（48），
 * 保证 365/48 ≈ 7.6 天轮一遍。
 */
export function todayCountry(now = new Date()): Country {
  const epoch = new Date(Date.UTC(2026, 0, 1)); // 2026-01-01 UTC
  const diffMs = now.getTime() - epoch.getTime();
  const dayIdx = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  const safeIdx = ((dayIdx % COUNTRIES.length) + COUNTRIES.length) % COUNTRIES.length;
  return COUNTRIES[safeIdx];
}

function todayKey(country: Country, level: string, now = new Date()): string {
  const ymd = now.toISOString().slice(0, 10);
  return `daily-${ymd}-${country.iso3}-${level.toLowerCase()}`;
}

// ── localStorage：上次打开 / 是否今日已看 ────────────

const LAST_SEEN_KEY = 'wca:daily:lastSeen';

export function todayYmd(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** 今日是否还没看过 NatGeo 开屏（DailyFeature 路由用来判断要不要强弹） */
export function isFirstVisitToday(now = new Date()): boolean {
  try {
    const last = localStorage.getItem(LAST_SEEN_KEY);
    return last !== todayYmd(now);
  } catch {
    return true;
  }
}

export function markSeenToday(now = new Date()): void {
  try {
    localStorage.setItem(LAST_SEEN_KEY, todayYmd(now));
  } catch {
    /* ignore */
  }
}

// ── 模板填充 ──────────────────────────────────────────

function fillTemplate(country: Country, level: string): string {
  const replace = (s: string, key: string, val: string) => s.split(`{${key}}`).join(val);
  let p = dailyPromptTemplate;
  p = replace(p, 'nameZh', country.nameZh);
  p = replace(p, 'nameEn', country.nameEn);
  p = replace(p, 'level', String(level).toLowerCase());
  return p;
}

// ── 主入口 ────────────────────────────────────────────

export interface DailyBrief {
  text: string;
  cached: boolean;
  error?: string;
}

const TIMEOUT_MS = 60_000;

function withTimeout<T>(p: Promise<T>, ms: number, label = 'Daily LLM'): Promise<T> {
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

/**
 * 拿今日 brief：先查 Dexie 缓存，命中即返回；否则调 LLM 写 + 写回缓存。
 *
 * 失败时 text = '' + error，UI 自己决定怎么展示（一般是显示 provider 错误 + 引导去 /settings）
 */
export async function getDailyBrief(
  country: Country,
  level: string,
  now = new Date()
): Promise<DailyBrief> {
  const key = todayKey(country, level, now);

  // 1. 缓存命中
  try {
    const hit = await db.cache.get(key);
    if (hit?.brief) {
      return { text: hit.brief, cached: true };
    }
  } catch (e) {
    console.warn('[daily] Dexie 读失败，继续走 LLM', e);
  }

  // 2. 调 LLM
  const settings = useSettingsStore();
  const providerId = settings.state.activeProvider;
  const cfg = settings.state.providers[providerId];

  let provider;
  try {
    provider = getProvider(providerId);
  } catch (e: any) {
    return { text: '', cached: false, error: `provider 不存在: ${providerId}` };
  }
  if (provider.requiresApiKey && !cfg?.apiKey) {
    return {
      text: '',
      cached: false,
      error: `${provider.displayName} 需要 API Key，去 /settings 配置`,
    };
  }

  const prompt = fillTemplate(country, level);
  const temperature = 0.65; // 比裁判略 high，鼓励"侧切角度"创意
  try {
    const res = await withTimeout(
      provider.chat(
        [
          {
            role: 'system',
            content: '你是 NatGeo 风格的旅行作家，输出纯散文，不要 markdown / JSON / emoji。',
          },
          { role: 'user', content: prompt },
        ],
        cfg,
        { temperature, responseFormat: 'text', maxTokens: 400 }
      ),
      TIMEOUT_MS,
      'Daily LLM'
    );
    const text = (res.content || '').trim();
    if (!text) {
      return { text: '', cached: false, error: 'LLM 返回空' };
    }
    // 3. 写回缓存
    try {
      await db.cache.put({ key, brief: text, createdAt: Date.now() });
    } catch (e) {
      console.warn('[daily] Dexie 写失败', e);
    }
    return { text, cached: false };
  } catch (e: any) {
    return { text: '', cached: false, error: e?.message || String(e) };
  }
}

/** 强制刷新：删 cache 再调一次 */
export async function regenerateDailyBrief(
  country: Country,
  level: string,
  now = new Date()
): Promise<DailyBrief> {
  const key = todayKey(country, level, now);
  try {
    await db.cache.delete(key);
  } catch {
    /* ignore */
  }
  return getDailyBrief(country, level, now);
}
