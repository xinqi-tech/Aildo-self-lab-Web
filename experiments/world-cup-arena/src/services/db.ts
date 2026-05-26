/**
 * Dexie 本地存档：对局回放 + 裁判金句墙原始数据。
 *
 * 表设计：
 *   battles  : 一局完整对战（5 回合 + 双方卡 + 最终比分 + winner + match 元数据）
 *   verdicts : 单条裁判金句（含 battleId 外键），阶段 3 金句墙按这张表
 *
 * 注意：world-cup-arena 是个人项目，无需迁移 / 加密。
 */

import Dexie, { type Table } from 'dexie';
import type { CulturalCard } from '@/data/cards/types';
import type { Matchup } from '@/services/cardMatchup';
import type { RefereeDebug, DimensionScores } from '@/services/refereeService';

/** 单回合结果（已完成的回合才落库） */
export interface RoundRecord {
  index: number; // 0-4
  aCard: CulturalCard;
  bCard: CulturalCard;
  aScore: number;
  bScore: number;
  /** 4 维度细分（评分前的原始分） */
  aDims?: DimensionScores;
  bDims?: DimensionScores;
  matchup: Matchup;
  verdict: string;
  /** 判定依据 — 谁强在哪谁弱在哪 */
  reasoning?: string;
  funFact: string;
  fallback?: boolean;
  /** LLM 调用调试信息（prompt / response / timing） */
  debug?: RefereeDebug;
}

/** 完整对局 */
export interface SavedBattle {
  id?: number; // 自增主键
  /** 对应真实赛程的 matchId（scheduleService.makeMatchId 产物） */
  matchId: string;
  matchDate: string; // YYYY-MM-DD
  matchGround?: string;
  matchRound?: string;
  matchGroup?: string;

  /** 双方国家 ISO3 */
  aIso3: string;
  bIso3: string;
  /** 玩家选哪边：'a' = team1，'b' = team2 */
  playerSide: 'a' | 'b';

  /** 本局采用的内容尺度 */
  contentLevel: string; // 'pg' | 'r' | 'x'

  rounds: RoundRecord[];
  aTotal: number;
  bTotal: number;
  winner: 'a' | 'b' | 'draw';

  startedAt: number;
  finishedAt: number;
}

/** 单条裁判金句（金句墙数据源） */
export interface SavedVerdict {
  id?: number;
  battleId: number;
  roundIndex: number;
  aIso3: string;
  bIso3: string;
  aCardName: string;
  bCardName: string;
  verdict: string;
  funFact: string;
  contentLevel: string;
  savedAt: number;
}

class WCADB extends Dexie {
  battles!: Table<SavedBattle, number>;
  verdicts!: Table<SavedVerdict, number>;

  constructor() {
    super('wca-db');
    this.version(1).stores({
      battles: '++id, matchId, matchDate, finishedAt',
      verdicts: '++id, battleId, savedAt, aIso3, bIso3',
    });
  }
}

export const db = new WCADB();

/** 存一局对战，返回新主键 */
export async function saveBattle(battle: SavedBattle): Promise<number> {
  return await db.battles.add(battle);
}

/** 把本局所有金句一并落 verdicts 表 */
export async function saveBattleVerdicts(battleId: number, battle: SavedBattle): Promise<void> {
  const records: SavedVerdict[] = battle.rounds.map((r) => ({
    battleId,
    roundIndex: r.index,
    aIso3: battle.aIso3,
    bIso3: battle.bIso3,
    aCardName: r.aCard.name,
    bCardName: r.bCard.name,
    verdict: r.verdict,
    funFact: r.funFact,
    contentLevel: battle.contentLevel,
    savedAt: Date.now(),
  }));
  await db.verdicts.bulkAdd(records);
}

export async function getBattle(id: number): Promise<SavedBattle | undefined> {
  return await db.battles.get(id);
}

export async function listBattles(limit = 50): Promise<SavedBattle[]> {
  return await db.battles.orderBy('finishedAt').reverse().limit(limit).toArray();
}

export async function listVerdicts(limit = 200): Promise<SavedVerdict[]> {
  return await db.verdicts.orderBy('savedAt').reverse().limit(limit).toArray();
}

/**
 * 金句墙查询：按 savedAt 倒序，可选 since（毫秒时间戳，>= since 才返回）。
 * 不限制条数（金句墙要全展示），如果将来真的爆了再加分页。
 */
export async function queryVerdicts(opts: { since?: number; limit?: number } = {}): Promise<
  SavedVerdict[]
> {
  let q = db.verdicts.orderBy('savedAt').reverse();
  if (opts.since != null) {
    q = q.filter((v) => v.savedAt >= (opts.since as number));
  }
  if (opts.limit) q = q.limit(opts.limit);
  return await q.toArray();
}

/** 删除一条金句 */
export async function deleteVerdict(id: number): Promise<void> {
  await db.verdicts.delete(id);
}

/**
 * 查含传奇卡的回合金句：扫 battles 表，找到 rounds 里 rarity='legendary' 的回合，
 * 返回对应 verdicts。
 * （Dexie 没法直接对嵌套数组建索引，所以走全表扫；个人项目数据量不会超过几百局。）
 */
export async function queryLegendaryVerdicts(): Promise<SavedVerdict[]> {
  const allBattles = await db.battles.toArray();
  const legendBattleIds: number[] = [];
  const legendRoundIndexes: Record<number, Set<number>> = {};
  for (const b of allBattles) {
    if (!b.id) continue;
    const idxs = new Set<number>();
    for (const r of b.rounds) {
      if (r.aCard?.rarity === 'legendary' || r.bCard?.rarity === 'legendary') {
        idxs.add(r.index);
      }
    }
    if (idxs.size > 0) {
      legendBattleIds.push(b.id);
      legendRoundIndexes[b.id] = idxs;
    }
  }
  if (legendBattleIds.length === 0) return [];
  const verdicts = await db.verdicts
    .where('battleId')
    .anyOf(legendBattleIds)
    .toArray();
  return verdicts
    .filter((v) => legendRoundIndexes[v.battleId]?.has(v.roundIndex))
    .sort((a, b) => b.savedAt - a.savedAt);
}
