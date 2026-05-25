/**
 * 卡池服务：按 contentLevel 过滤可用卡牌。
 *
 * 数据组织：
 *   src/data/cards/_pg/<ISO3>.json — PG 档卡数组
 *   src/data/cards/_r/<ISO3>.json  — R 档卡数组
 *   src/data/cards/_x/<ISO3>.json  — X 档卡数组
 *
 * 加载策略：用 import.meta.glob eager 静态导入，构建时即解析。
 * 内容尺度规则：
 *   'pg' → 只 _pg
 *   'r'  → _pg + _r
 *   'x'  → _pg + _r + _x
 *
 * 兼容 settings.contentLevel 的大写形式 ('PG' | 'R' | 'X')。
 */

import type { CulturalCard, CardLevel } from '@/data/cards/types';

/** settings 中的大小写中和 */
export type AnyContentLevel = CardLevel | 'PG' | 'R' | 'X';

function normalizeLevel(level: AnyContentLevel): CardLevel {
  const lower = (level as string).toLowerCase();
  if (lower === 'pg' || lower === 'r' || lower === 'x') return lower as CardLevel;
  return 'x'; // 兜底：未识别按最宽松
}

// ── 静态导入所有 JSON ────────────────────────────────────
// 路径必须是字面量，Vite 解析时一次性把所有 JSON 内联到 chunk。
const PG_MODULES = import.meta.glob('@/data/cards/_pg/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, CulturalCard[]>;
const R_MODULES = import.meta.glob('@/data/cards/_r/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, CulturalCard[]>;
const X_MODULES = import.meta.glob('@/data/cards/_x/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, CulturalCard[]>;

/** path '/.../_pg/MEX.json' → 'MEX' */
function iso3FromPath(path: string): string {
  const m = path.match(/\/([A-Z]{3})\.json$/i);
  return m ? m[1].toUpperCase() : '';
}

/** 把 record 转成 ISO3 → cards 索引 */
function buildIndex(modules: Record<string, CulturalCard[]>): Record<string, CulturalCard[]> {
  const out: Record<string, CulturalCard[]> = {};
  for (const [path, cards] of Object.entries(modules)) {
    const iso3 = iso3FromPath(path);
    if (!iso3) continue;
    out[iso3] = Array.isArray(cards) ? cards : [];
  }
  return out;
}

const PG_BY_ISO3 = buildIndex(PG_MODULES);
const R_BY_ISO3 = buildIndex(R_MODULES);
const X_BY_ISO3 = buildIndex(X_MODULES);

/** 按尺度返回该国允许的所有卡 */
export function loadCardsForCountry(iso3: string, level: AnyContentLevel): CulturalCard[] {
  const lv = normalizeLevel(level);
  const code = iso3.toUpperCase();
  const out: CulturalCard[] = [];
  out.push(...(PG_BY_ISO3[code] || []));
  if (lv === 'r' || lv === 'x') out.push(...(R_BY_ISO3[code] || []));
  if (lv === 'x') out.push(...(X_BY_ISO3[code] || []));
  return out;
}

/** 跨国合集：按尺度返回全部 48 国允许的卡 */
export function loadAllCards(level: AnyContentLevel): CulturalCard[] {
  const lv = normalizeLevel(level);
  const out: CulturalCard[] = [];
  for (const cards of Object.values(PG_BY_ISO3)) out.push(...cards);
  if (lv === 'r' || lv === 'x') {
    for (const cards of Object.values(R_BY_ISO3)) out.push(...cards);
  }
  if (lv === 'x') {
    for (const cards of Object.values(X_BY_ISO3)) out.push(...cards);
  }
  return out;
}

/** 统计：返回每档可用卡数（UI 显示用） */
export function getPoolStats(): { pg: number; r: number; x: number; countries: number } {
  let pg = 0;
  let r = 0;
  let x = 0;
  const countrySet = new Set<string>();
  for (const [iso3, cards] of Object.entries(PG_BY_ISO3)) {
    pg += cards.length;
    countrySet.add(iso3);
  }
  for (const [iso3, cards] of Object.entries(R_BY_ISO3)) {
    r += cards.length;
    countrySet.add(iso3);
  }
  for (const [iso3, cards] of Object.entries(X_BY_ISO3)) {
    x += cards.length;
    countrySet.add(iso3);
  }
  return { pg, r, x, countries: countrySet.size };
}
