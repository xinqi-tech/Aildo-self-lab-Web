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
