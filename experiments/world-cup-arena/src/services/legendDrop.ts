/**
 * 球星彩蛋传奇卡（Legend Drop）服务。
 *
 * 详见 docs/world-cup-arena/design.md §3.6 ②：
 *   - 每国预置 1-2 张传奇球星卡（梅西 / C 罗 / 姆巴佩 / 哈兰德 / 孙兴慜 …）
 *   - 抽卡时极小概率（5%）替换为该国传奇卡
 *   - 传奇卡属性比同国普通卡高 30%，但属性总和受 360 上限约束
 *   - 弹出时配特效：金色光晕 + 球员动作剪影
 *
 * 数据组织：
 *   src/data/cards/_legend/<ISO3>.json — 该国传奇卡数组（通常 1 张，少数国家 2 张）
 *
 * 加载策略：与 cardPoolService 一致，import.meta.glob eager 构建时内联。
 *
 * 注意：_legend 不会被 cardPoolService 当成普通卡池加载（避免污染普通抽牌）。
 *      只通过 maybeReplaceWithLegend 在 initBattle 抽完手牌后做替换。
 */

import type { CulturalCard } from '@/data/cards/types';

/** 传奇卡掉率（每张手牌独立判定）*/
const LEGEND_DROP_RATE = 0.05;

const modules = import.meta.glob<CulturalCard[]>('@/data/cards/_legend/*.json', {
  eager: true,
  import: 'default',
});

/** ISO3 → 传奇卡数组 */
const legendsByCountry: Record<string, CulturalCard[]> = {};
for (const path in modules) {
  const iso3 = path.match(/_legend\/([A-Z]{3})\.json$/)?.[1];
  if (iso3) legendsByCountry[iso3] = modules[path];
}

/**
 * 5% 概率把普通卡替换为该国传奇卡。
 *
 * @param card  普通手牌卡
 * @param iso3  该卡所属国家
 * @returns     原卡 95% / 该国某张随机传奇卡 5%；如果该国无传奇卡则永远返回原卡
 */
export function maybeReplaceWithLegend(card: CulturalCard, iso3: string): CulturalCard {
  if (Math.random() > LEGEND_DROP_RATE) return card;
  const legends = legendsByCountry[iso3];
  if (!legends?.length) return card;
  return legends[Math.floor(Math.random() * legends.length)];
}

/** 判定该国是否有传奇卡（UI 显示 ⭐ 角标用） */
export function hasLegendForCountry(iso3: string): boolean {
  return !!legendsByCountry[iso3]?.length;
}

/** 返回该国所有传奇卡（CountryDetail "本届卡牌" tab 可单独展示） */
export function getLegendsForCountry(iso3: string): CulturalCard[] {
  return legendsByCountry[iso3] || [];
}

/** 全部传奇卡数（UI 调试 / 统计） */
export function getLegendStats(): { countries: number; total: number } {
  const countries = Object.keys(legendsByCountry).length;
  let total = 0;
  for (const cards of Object.values(legendsByCountry)) total += cards.length;
  return { countries, total };
}
