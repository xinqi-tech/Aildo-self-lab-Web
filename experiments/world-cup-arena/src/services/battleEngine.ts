/**
 * 对战引擎：5 回合状态机。
 *
 * 规则（详见 design.md §3.4）：
 * 1. initBattle: 玩家选边后，从所代表国家卡池里抽 5 张为手牌
 * 2. playRound: 玩家出 1 张，AI 随机出 1 张，调 refereeService 评分
 *    每回合 LLM verdict 高分一方得 1 局分
 * 3. finalizeBattle: 5 回合后总比分高者胜；平局走加时（双方任意 1 张传奇决胜）
 * 4. 结果通过 db.ts 落 IndexedDB
 */

import type { CulturalCard, CardLevel } from '@/data/cards/types';
import type { Country } from '@/data/countries';
import { COUNTRY_BY_ISO3 } from '@/data/countries';
import type { MatchView } from '@/services/scheduleService';
import { loadCardsForCountry, type AnyContentLevel } from '@/services/cardPoolService';
import { maybeReplaceWithLegend } from '@/services/legendDrop';
import { judgeRound, type RefereeVerdict } from '@/services/refereeService';
import type { RoundRecord, SavedBattle } from '@/services/db';
import { saveBattle, saveBattleVerdicts } from '@/services/db';

export type BattleSide = 'a' | 'b';

export interface BattleState {
  match: MatchView;
  /** 双方 Country 引用（resolve 自 ISO3） */
  aCountry: Country;
  bCountry: Country;
  playerSide: BattleSide;
  contentLevel: AnyContentLevel;

  /** 双方手牌（5 张） */
  aHand: CulturalCard[];
  bHand: CulturalCard[];

  /** 已完成回合 */
  rounds: RoundRecord[];

  /** 当前回合 index 0-4，>=5 表示已结束 */
  currentRound: number;

  /** 累计得分（回合数，不是 LLM 评分总和） */
  aWins: number;
  bWins: number;

  /** 状态：playing → finished_pending_save → finished */
  status: 'playing' | 'judging' | 'finished';

  /** 最终胜方（finished 后才有） */
  winner?: 'a' | 'b' | 'draw';

  /** 持久化主键（finalizeBattle 后填） */
  savedBattleId?: number;

  startedAt: number;
}

/** Fisher-Yates 洗牌 */
function shuffle<T>(arr: T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** 从卡池抽 5 张；不足 5 张则有放回填充 */
function draw5(pool: CulturalCard[]): CulturalCard[] {
  if (pool.length === 0) return [];
  const shuffled = shuffle(pool);
  if (shuffled.length >= 5) return shuffled.slice(0, 5);
  const out = shuffled.slice();
  while (out.length < 5) {
    out.push(shuffled[Math.floor(Math.random() * shuffled.length)]);
  }
  return out;
}

/**
 * 初始化对战状态。
 *
 * @throws 如果 match.team1 / team2 缺 ISO3 映射
 */
export function initBattle(
  match: MatchView,
  playerSide: BattleSide,
  contentLevel: AnyContentLevel
): BattleState {
  if (!match.team1 || !match.team2) {
    throw new Error(`赛程缺国家映射：${match.team1Name} vs ${match.team2Name}`);
  }
  const aCountry = match.team1;
  const bCountry = match.team2;

  const aPool = loadCardsForCountry(aCountry.iso3, contentLevel);
  const bPool = loadCardsForCountry(bCountry.iso3, contentLevel);

  let aHand = draw5(aPool);
  let bHand = draw5(bPool);

  // 球星彩蛋（design.md §3.6 ②）：5% 概率把玩家手牌某张替换为该国传奇卡。
  // AI 手牌不替换，避免对手太强。每张手牌独立判定。
  if (playerSide === 'a') {
    aHand = aHand.map((c) => maybeReplaceWithLegend(c, aCountry.iso3));
  } else {
    bHand = bHand.map((c) => maybeReplaceWithLegend(c, bCountry.iso3));
  }

  return {
    match,
    aCountry,
    bCountry,
    playerSide,
    contentLevel,
    aHand,
    bHand,
    rounds: [],
    currentRound: 0,
    aWins: 0,
    bWins: 0,
    status: 'playing',
    startedAt: Date.now(),
  };
}

/** AI 随机出一张（简单策略：直接随机；后续可升级为相克算法） */
function aiPickCard(hand: CulturalCard[]): CulturalCard {
  return hand[Math.floor(Math.random() * hand.length)];
}

/**
 * 玩家出一张牌（playerCardId 指对应 player side 的手牌某张）。
 * AI 自动从另一侧手牌随机出一张。
 *
 * 调 LLM 评分后落回合数据 + 推进 currentRound。
 *
 * @returns 更新后的 state（同对象引用）+ 本回合 RoundRecord
 */
export async function playRound(
  state: BattleState,
  playerCardId: string
): Promise<{ state: BattleState; round: RoundRecord }> {
  if (state.status !== 'playing') {
    throw new Error(`对战已结束，状态 ${state.status}`);
  }
  if (state.currentRound >= 5) {
    throw new Error('已经打完 5 回合');
  }

  state.status = 'judging';

  const playerHand = state.playerSide === 'a' ? state.aHand : state.bHand;
  const aiHand = state.playerSide === 'a' ? state.bHand : state.aHand;

  const playerCard = playerHand.find((c) => c.id === playerCardId);
  if (!playerCard) throw new Error(`手牌中没有 id=${playerCardId}`);
  const aiCard = aiPickCard(aiHand);

  // A 永远对应 team1，B 永远对应 team2
  const [aCard, bCard]: [CulturalCard, CulturalCard] =
    state.playerSide === 'a' ? [playerCard, aiCard] : [aiCard, playerCard];

  let verdict: RefereeVerdict;
  try {
    verdict = await judgeRound(
      aCard,
      state.aCountry,
      bCard,
      state.bCountry,
      state.contentLevel
    );
  } catch (e) {
    // judgeRound 内部已经有降级，理论上不会到这里
    console.error('[battleEngine] judgeRound 异常', e);
    verdict = {
      aScore: 50,
      bScore: 50,
      verdict: '裁判罢工。',
      funFact: '',
      matchup: 'neutral',
      fallback: true,
    };
  }

  const round: RoundRecord = {
    index: state.currentRound,
    aCard,
    bCard,
    aScore: verdict.aScore,
    bScore: verdict.bScore,
    aDims: verdict.aDims,
    bDims: verdict.bDims,
    matchup: verdict.matchup,
    verdict: verdict.verdict,
    reasoning: verdict.reasoning,
    funFact: verdict.funFact,
    fallback: verdict.fallback,
    debug: verdict.debug,
  };

  // 移除已出的牌
  if (state.playerSide === 'a') {
    state.aHand = state.aHand.filter((c) => c.id !== playerCard.id);
    state.bHand = state.bHand.filter((c) => c.id !== aiCard.id);
  } else {
    state.bHand = state.bHand.filter((c) => c.id !== playerCard.id);
    state.aHand = state.aHand.filter((c) => c.id !== aiCard.id);
  }

  state.rounds.push(round);
  if (round.aScore > round.bScore) state.aWins += 1;
  else if (round.bScore > round.aScore) state.bWins += 1;
  // 平局不算谁赢

  state.currentRound += 1;
  state.status = 'playing';

  return { state, round };
}

/**
 * 结算：算总 winner，落 Dexie，state.status = 'finished'。
 *
 * 平局处理：design.md §3.4 写的是 "加时赛双方各 1 张传奇牌"，
 * 简化版：直接比 5 回合总 LLM 分（aScoreSum vs bScoreSum），再不行就 draw。
 */
export async function finalizeBattle(state: BattleState): Promise<BattleState> {
  if (state.status === 'judging') {
    throw new Error('正在等裁判判分，不能结算');
  }
  if (state.currentRound < 5) {
    throw new Error(`还没打完，currentRound=${state.currentRound}`);
  }

  let winner: 'a' | 'b' | 'draw';
  if (state.aWins > state.bWins) winner = 'a';
  else if (state.bWins > state.aWins) winner = 'b';
  else {
    // 加时简化：比 5 回合 LLM 总分
    const aTotal = state.rounds.reduce((s, r) => s + r.aScore, 0);
    const bTotal = state.rounds.reduce((s, r) => s + r.bScore, 0);
    if (aTotal > bTotal) winner = 'a';
    else if (bTotal > aTotal) winner = 'b';
    else winner = 'draw';
  }
  state.winner = winner;
  state.status = 'finished';

  const aTotal = state.rounds.reduce((s, r) => s + r.aScore, 0);
  const bTotal = state.rounds.reduce((s, r) => s + r.bScore, 0);

  const saved: SavedBattle = {
    matchId: state.match.id,
    matchDate: state.match.date,
    matchGround: state.match.ground,
    matchRound: state.match.round,
    matchGroup: state.match.group,
    aIso3: state.aCountry.iso3,
    bIso3: state.bCountry.iso3,
    playerSide: state.playerSide,
    contentLevel: String(state.contentLevel).toLowerCase(),
    rounds: state.rounds,
    aTotal,
    bTotal,
    winner,
    startedAt: state.startedAt,
    finishedAt: Date.now(),
  };

  try {
    const id = await saveBattle(saved);
    state.savedBattleId = id;
    // 同步把每回合金句也落 verdicts 表（金句墙阶段 3 用）
    await saveBattleVerdicts(id, { ...saved, id });
  } catch (e) {
    console.warn('[battleEngine] Dexie 写入失败', e);
  }

  return state;
}

/** 用于路由刷新恢复时把 ISO3 还原成 Country */
export function resolveCountry(iso3: string): Country | undefined {
  return COUNTRY_BY_ISO3[iso3];
}

/** 用于 stores 重新构造 contentLevel 为 CardLevel 的类型保护 */
export function normalizeContentLevel(level: AnyContentLevel): CardLevel {
  const lower = String(level).toLowerCase();
  if (lower === 'pg' || lower === 'r' || lower === 'x') return lower as CardLevel;
  return 'x';
}
