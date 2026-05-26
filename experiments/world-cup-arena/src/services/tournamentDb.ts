/**
 * Tournament 锦标赛存档：独立 Dexie 数据库（wca-tournament），与对局回放 db (wca-db) 解耦。
 *
 * 一档对应一次"2026 征程"。
 *  - 玩家选一个国家
 *  - 引擎一次性生成全部 72 场小组赛 + 32 场淘汰赛骨架
 *  - 非玩家场次走快速 AI 模拟
 *  - 玩家场次走完整 Battle（5 回合 LLM）
 *  - 玩家场次结束后调 tournamentEngine.applyPlayerMatchResult 回写
 *
 * 详见 docs/world-cup-arena/design.md §2 + §3.5
 */

import Dexie, { type Table } from 'dexie';

/** 锦标赛全局状态 */
export type TournamentStatus =
  | 'group' //  小组赛阶段
  | 'ro32' //   32 强
  | 'ro16' //   16 强
  | 'qf' //     8 强
  | 'sf' //     4 强
  | 'final' //  决赛
  | 'champion' // 玩家夺冠
  | 'eliminated'; // 玩家淘汰

/** 单场比赛阶段 */
export type MatchStage =
  | 'group'
  | 'ro32'
  | 'ro16'
  | 'qf'
  | 'sf'
  | 'third' //  3/4 名决定战
  | 'final';

/** 比赛 — 占位符可能为 'W01' (R32 winner of match 01)、'G1A' (Group A 第 1) 等 */
export interface TournamentMatch {
  /** 唯一 id，小组赛 'group-A-R1-MEX-ZAF'，淘汰赛 'ro32-M01' / 'ro16-M01' / 'qf-M01' / 'sf-M01' / 'third' / 'final' */
  id: string;
  stage: MatchStage;
  /** 小组赛 1-3 轮 */
  round?: number;
  /** 'A' - 'L'，仅小组赛 */
  group?: string;
  /** ISO3 或占位符（'G1A' / 'G2A' / 'G3X' 第 3 / 'W-ro32-M01' 等） */
  aIso3: string;
  bIso3: string;
  /** 玩家是否参与（用于决定走 Battle 还是模拟） */
  involvesPlayer: boolean;
  /** 比赛结果（已打 = 有；未打 = undefined） */
  result?: {
    /** A 方 LLM 总分（玩家场用 sum；模拟场 = 模拟进球 * 25） */
    aScore: number;
    /** B 方同上 */
    bScore: number;
    winner: 'a' | 'b' | 'draw';
    playedAt: number;
    /** 玩家场次的 wca-db.battles 主键 */
    battleId?: number;
    /** 简化版进球（模拟场 = a/bScore/25，玩家场 = a/bWins） */
    aGoals: number;
    bGoals: number;
  };
}

/** 小组积分榜行 */
export interface GroupTableRow {
  iso3: string;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  /** 用进球代替 LLM 总分（简化） */
  goalsFor: number;
  goalsAgainst: number;
  diff: number;
  points: number;
  /** 排名（1-4，全打完才填） */
  rank?: 1 | 2 | 3 | 4;
  /** 是否出线（决出 32 强后填） */
  qualified?: boolean;
  /** 在 8 个最佳第 3 中的排名（1-12，只有第 3 才填） */
  bestThirdRank?: number;
}

/** 玩家征程历史一站 */
export interface PlayerStageEntry {
  stage: MatchStage;
  opponent: string; // ISO3
  outcome: 'win' | 'lose' | 'draw';
  matchId: string;
}

/** 一份存档 */
export interface Tournament {
  id?: number;
  /** 用户填，默认 "<国家中文名> 的 2026 征程" */
  name: string;
  createdAt: number;
  updatedAt: number;
  playerIso3: string;
  contentLevel: 'pg' | 'r' | 'x';
  status: TournamentStatus;
  /** 所有比赛（小组赛 72 + 淘汰赛 32 = 104 个 slot，淘汰赛对阵未定时双方仍是占位符） */
  matches: TournamentMatch[];
  /** 按 group 字母聚合 */
  groupTables: Record<string, GroupTableRow[]>;
  /** 下一场要打的 (玩家场次) */
  currentMatchId?: string;
  /** 玩家在淘汰赛阶段的对手序列 */
  playerStageHistory: PlayerStageEntry[];
  finishedAt?: number;
  /** 1 = 冠军，2 = 亚军，3 = 季军，4 = 4 强，依此类推 */
  finalPlacement?: number;
}

class TournamentDb extends Dexie {
  tournaments!: Table<Tournament, number>;

  constructor() {
    super('wca-tournament');
    this.version(1).stores({
      tournaments: '++id, createdAt, updatedAt, playerIso3, status',
    });
  }
}

const tdb = new TournamentDb();

/** 拉所有存档，按 updatedAt 倒序 */
export async function listTournaments(): Promise<Tournament[]> {
  return await tdb.tournaments.orderBy('updatedAt').reverse().toArray();
}

export async function getTournament(id: number): Promise<Tournament | undefined> {
  return await tdb.tournaments.get(id);
}

/**
 * 保存存档：自动更新 updatedAt。
 * 若 t.id 已存在则 put 覆盖；无则 add 自增。
 */
export async function saveTournament(t: Tournament): Promise<number> {
  t.updatedAt = Date.now();
  if (t.id) {
    await tdb.tournaments.put(t);
    return t.id;
  }
  return await tdb.tournaments.add(t);
}

export async function deleteTournament(id: number): Promise<void> {
  await tdb.tournaments.delete(id);
}

export { tdb };
