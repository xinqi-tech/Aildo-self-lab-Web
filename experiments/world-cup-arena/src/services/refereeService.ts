/**
 * LLM 裁判服务：调当前 active provider 给两张卡牌打分。
 *
 * 流程：
 * 1) 根据 referee.txt 模板填充上下文
 * 2) 30 秒超时调 provider.chat({ responseFormat: 'json_object' })
 * 3) 严格解析 JSON，失败则降级到属性平均
 * 4) 应用相克 / 主场 / 冷门 乘数（多重相乘）
 *
 * 详见 docs/world-cup-arena/design.md §3.4
 */

import refereePromptTemplate from '@/prompts/referee.txt?raw';
import {
  matchupOf,
  multiplierOf,
  matchupDescription,
  type Matchup,
} from '@/services/cardMatchup';
import type { CulturalCard, CardLevel } from '@/data/cards/types';
import { CATEGORY_LABELS } from '@/data/cards/types';
import type { Country } from '@/data/countries';
import { useSettingsStore } from '@/stores/settings';
import { getProvider } from '@/services/llmProviders';

export type AnyContentLevel = CardLevel | 'PG' | 'R' | 'X';

export interface RefereeVerdict {
  /** A 方最终得分 0-100，已应用所有乘数 */
  aScore: number;
  /** B 方最终得分 0-100，已应用所有乘数 */
  bScore: number;
  /** 一句话结论 */
  verdict: string;
  /** 冷知识 */
  funFact: string;
  /** 相克信息（A 视角） */
  matchup: Matchup;
  /** 是否降级评分（LLM 失败兜底） */
  fallback?: boolean;
  /** Provider 自报延迟（ms），调试用 */
  latencyMs?: number;
}

const HOST_ISO3 = new Set(['USA', 'CAN', 'MEX']);
const UNDERDOG_ISO3 = new Set(['CPV', 'CUW', 'UZB', 'JOR']);

function applyBonuses(
  baseScore: number,
  card: CulturalCard,
  country: Country | undefined,
  matchupSide: Matchup
): number {
  let s = baseScore;
  // 相克乘数（A 视角；调用方对 B 翻转）
  s *= multiplierOf(matchupSide);
  // 主场加成 +10%
  if (country && HOST_ISO3.has(country.iso3)) s *= 1.1;
  // 冷门红利 +15%
  if (country && UNDERDOG_ISO3.has(country.iso3)) s *= 1.15;
  return Math.round(Math.max(0, Math.min(100, s)));
}

/** 平均属性 → 0-100 */
function baseScoreFromAttributes(c: CulturalCard): number {
  const a = c.attributes;
  return (a.historical + a.artistic + a.influence + a.uniqueness) / 4;
}

function fillTemplate(
  cardA: CulturalCard,
  countryA: Country,
  cardB: CulturalCard,
  countryB: Country,
  level: AnyContentLevel,
  matchup: Matchup
): string {
  const sameGroup = countryA.group === countryB.group;
  const matchupDesc = matchupDescription(cardA.category, cardB.category, matchup);

  // 主场 / 冷门描述
  const hostBonuses: string[] = [];
  if (HOST_ISO3.has(countryA.iso3)) hostBonuses.push(`A 国 ${countryA.nameZh} 是承办国 +10%`);
  if (HOST_ISO3.has(countryB.iso3)) hostBonuses.push(`B 国 ${countryB.nameZh} 是承办国 +10%`);
  const hostDesc = hostBonuses.length ? hostBonuses.join('；') : '无';

  const underdogBonuses: string[] = [];
  if (UNDERDOG_ISO3.has(countryA.iso3))
    underdogBonuses.push(`A 国 ${countryA.nameZh} 是首次参赛 +15%`);
  if (UNDERDOG_ISO3.has(countryB.iso3))
    underdogBonuses.push(`B 国 ${countryB.nameZh} 是首次参赛 +15%`);
  const underdogDesc = underdogBonuses.length ? underdogBonuses.join('；') : '无';

  const replace = (s: string, key: string, val: string | number | boolean) =>
    s.split(`{${key}}`).join(String(val));

  let prompt = refereePromptTemplate;
  prompt = replace(prompt, 'level', String(level).toLowerCase());
  prompt = replace(prompt, 'sameGroup', sameGroup ? 'true' : 'false');
  prompt = replace(prompt, 'countryAZh', countryA.nameZh);
  prompt = replace(prompt, 'countryAEn', countryA.nameEn);
  prompt = replace(prompt, 'groupA', countryA.group);
  prompt = replace(prompt, 'confederationA', countryA.confederation);
  prompt = replace(prompt, 'nameA', cardA.name);
  prompt = replace(prompt, 'nameAEn', cardA.nameEn);
  prompt = replace(prompt, 'categoryA', CATEGORY_LABELS[cardA.category] || cardA.category);
  prompt = replace(prompt, 'rarityA', cardA.rarity);
  prompt = replace(prompt, 'eraA', cardA.era);
  prompt = replace(prompt, 'histA', cardA.attributes.historical);
  prompt = replace(prompt, 'artA', cardA.attributes.artistic);
  prompt = replace(prompt, 'infA', cardA.attributes.influence);
  prompt = replace(prompt, 'uniqA', cardA.attributes.uniqueness);
  prompt = replace(prompt, 'descA', cardA.description);
  prompt = replace(prompt, 'tagsA', (cardA.tags || []).join(', '));

  prompt = replace(prompt, 'countryBZh', countryB.nameZh);
  prompt = replace(prompt, 'countryBEn', countryB.nameEn);
  prompt = replace(prompt, 'groupB', countryB.group);
  prompt = replace(prompt, 'confederationB', countryB.confederation);
  prompt = replace(prompt, 'nameB', cardB.name);
  prompt = replace(prompt, 'nameBEn', cardB.nameEn);
  prompt = replace(prompt, 'categoryB', CATEGORY_LABELS[cardB.category] || cardB.category);
  prompt = replace(prompt, 'rarityB', cardB.rarity);
  prompt = replace(prompt, 'eraB', cardB.era);
  prompt = replace(prompt, 'histB', cardB.attributes.historical);
  prompt = replace(prompt, 'artB', cardB.attributes.artistic);
  prompt = replace(prompt, 'infB', cardB.attributes.influence);
  prompt = replace(prompt, 'uniqB', cardB.attributes.uniqueness);
  prompt = replace(prompt, 'descB', cardB.description);
  prompt = replace(prompt, 'tagsB', (cardB.tags || []).join(', '));

  prompt = replace(prompt, 'matchupDesc', matchupDesc);
  prompt = replace(prompt, 'hostBonusDesc', hostDesc);
  prompt = replace(prompt, 'underdogBonusDesc', underdogDesc);

  return prompt;
}

/**
 * 降级评分：LLM 失败时按属性平均 + 相克乘数计算。
 * errorReason 会被附在 verdict / funFact，让用户能在对战界面看到真正原因，
 * 而不是只看到含糊的"裁判离线"。
 */
function fallbackVerdict(
  cardA: CulturalCard,
  countryA: Country,
  cardB: CulturalCard,
  countryB: Country,
  errorReason?: string
): RefereeVerdict {
  const matchup = matchupOf(cardA.category, cardB.category);
  const baseA = baseScoreFromAttributes(cardA);
  const baseB = baseScoreFromAttributes(cardB);
  const aScore = applyBonuses(baseA, cardA, countryA, matchup);
  const inverseForB: Matchup =
    matchup === 'buff' ? 'debuff' : matchup === 'debuff' ? 'buff' : 'neutral';
  const bScore = applyBonuses(baseB, cardB, countryB, inverseForB);

  // 截断过长的错误消息（HTTP 返回体可能很长）
  const short = errorReason ? errorReason.slice(0, 140) : '';

  return {
    aScore,
    bScore,
    verdict: short ? `（裁判离线：${short}）` : '（裁判离线，按属性计算）',
    funFact: short
      ? '⚙️ 去 /settings 检查 Provider 配置：model 名是否对、API Key 是否填、本地 Ollama 是否在跑。点 "测试连接" 会列出本地可用模型。'
      : '提示：在设置里配置 LLM Provider 可以让裁判给出真正的金句与冷知识。',
    matchup,
    fallback: true,
  };
}

interface LlmRefereeJson {
  a_score?: number;
  b_score?: number;
  verdict?: string;
  fun_fact?: string;
}

/** 把 LLM 返回的字符串里第一个 { 开始的 JSON 拽出来 */
function safeParseJson(raw: string): LlmRefereeJson | null {
  if (!raw) return null;
  // 去掉 ```json ... ``` 包装
  const stripped = raw
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
  try {
    return JSON.parse(stripped);
  } catch {
    // 再宽容一点：找第一个 { 到最后一个 }
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

/** 30 秒超时包装 */
function withTimeout<T>(p: Promise<T>, ms: number, label = 'LLM'): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

/**
 * 调 LLM 给两张卡评分。
 *
 * 失败（超时 / JSON 解析失败 / provider 报错）→ 降级评分。
 */
export async function judgeRound(
  cardA: CulturalCard,
  countryA: Country,
  cardB: CulturalCard,
  countryB: Country,
  level: AnyContentLevel
): Promise<RefereeVerdict> {
  const matchup = matchupOf(cardA.category, cardB.category);
  const inverseForB: Matchup =
    matchup === 'buff' ? 'debuff' : matchup === 'debuff' ? 'buff' : 'neutral';

  const settings = useSettingsStore();
  const providerId = settings.state.activeProvider;
  const providerCfg = settings.state.providers[providerId];

  // 没配 key 或 Ollama 都还是要尝试（Ollama 本地不需要 key）
  let provider;
  try {
    provider = getProvider(providerId);
  } catch (e: any) {
    console.warn('[referee] provider 不存在，降级', e);
    return fallbackVerdict(cardA, countryA, cardB, countryB, `provider 不存在: ${providerId}`);
  }

  // 必填 Key 缺失 → 直接降级
  if (provider.requiresApiKey && !providerCfg?.apiKey) {
    return fallbackVerdict(
      cardA,
      countryA,
      cardB,
      countryB,
      `${provider.displayName} 需要 API Key`
    );
  }

  const prompt = fillTemplate(cardA, countryA, cardB, countryB, level, matchup);
  const temperature = settings.state.refereeTemperature ?? 0.3;

  try {
    const start = performance.now();
    const res = await withTimeout(
      provider.chat(
        [
          {
            role: 'system',
            content:
              '你是文化裁判，输出必须是单个合法 JSON 对象，不要 markdown 包装，不要解释。',
          },
          { role: 'user', content: prompt },
        ],
        providerCfg,
        { temperature, responseFormat: 'json_object', maxTokens: 600 }
      ),
      30_000,
      'Referee LLM'
    );
    const latencyMs = Math.round(performance.now() - start);

    const parsed = safeParseJson(res.content);
    if (!parsed || typeof parsed.a_score !== 'number' || typeof parsed.b_score !== 'number') {
      console.warn('[referee] JSON 解析失败，降级', { raw: res.content });
      const preview = (res.content || '').replace(/\s+/g, ' ').slice(0, 60);
      return fallbackVerdict(
        cardA,
        countryA,
        cardB,
        countryB,
        `LLM 返回非 JSON: "${preview}…"`
      );
    }

    // LLM 给出的是 0-100 基础分（含相克），但我们要保证乘数确定生效——
    // 这里采用更保守做法：把 LLM 评分当 "未加成基础"，再叠加我们的乘数。
    // 这样无论 LLM 是否理解相克，最终分都正确。
    const aFinal = applyBonuses(parsed.a_score, cardA, countryA, matchup);
    const bFinal = applyBonuses(parsed.b_score, cardB, countryB, inverseForB);

    return {
      aScore: aFinal,
      bScore: bFinal,
      verdict: (parsed.verdict || '').trim() || '裁判沉默了。',
      funFact: (parsed.fun_fact || '').trim() || '今日无冷知识。',
      matchup,
      latencyMs,
    };
  } catch (e: any) {
    const msg = e?.message || String(e);
    console.warn('[referee] LLM 调用失败，降级', msg);
    return fallbackVerdict(cardA, countryA, cardB, countryB, msg);
  }
}
