/**
 * 卡牌类型相克关系，作为 LLM 评分的可解释乘数。
 * 详见 docs/world-cup-arena/design.md §3.3 / §3.4
 *
 * - 被克制方扣 20%
 * - 相克方加 20%
 * - 其余视为 neutral
 */

import type { CardCategory } from '@/data/cards/types';

/** A 类型 → 被它克制的 B 类型 */
export const CATEGORY_COUNTERS: Record<CardCategory, CardCategory> = {
  art: 'war', // 艺术克战争（柔克刚）
  war: 'philosophy', // 战争克哲学
  philosophy: 'historical', // 哲学克历史遗迹
  historical: 'modern', // 历史克现代
  modern: 'art', // 现代克艺术
  lifestyle: 'historical', // 生活克历史
  tech: 'lifestyle', // 科技克生活
};

export type Matchup = 'buff' | 'debuff' | 'neutral';

/**
 * 计算 cardA 相对 cardB 的相克结果。
 *
 * @returns 'buff' 表示 A 克 B，A 得分加成；
 *          'debuff' 表示 B 克 A，A 得分扣分；
 *          'neutral' 表示无相克关系
 */
export function matchupOf(a: CardCategory, b: CardCategory): Matchup {
  if (CATEGORY_COUNTERS[a] === b) return 'buff';
  if (CATEGORY_COUNTERS[b] === a) return 'debuff';
  return 'neutral';
}

/** 评分乘数（A 方的乘数）；B 方的乘数对调取反 */
export function multiplierOf(matchup: Matchup): number {
  if (matchup === 'buff') return 1.2;
  if (matchup === 'debuff') return 0.8;
  return 1.0;
}

/** 给裁判 prompt 的中文描述 */
export function matchupDescription(
  a: CardCategory,
  b: CardCategory,
  matchup: Matchup
): string {
  if (matchup === 'neutral') return '无明显相克关系';
  if (matchup === 'buff') return `${a} 克制 ${b}（A 评分 +20%）`;
  return `${b} 克制 ${a}（A 评分 −20%）`;
}
