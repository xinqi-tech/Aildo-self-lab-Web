/**
 * Tournament 锦标赛引擎：
 *  - 创建存档（小组赛 + 淘汰赛骨架）
 *  - 模拟非玩家场次（基于卡池属性 + 主场 + 随机）
 *  - 回写玩家场次结果
 *  - 推进阶段（小组赛全打完 → 决出 32 强 → 排淘汰赛对阵）
 *
 * 简化（个人项目）：
 *   - 非玩家场用快速模拟，不调 LLM
 *   - 淘汰赛平局直接 sudden death（双方各随机 1 张比 attribute 总和）
 *   - 出线规则：组内 1/2 自动 + 8 个最佳第 3（按积分 → 净胜球 → 进球数）
 *
 * 详见 docs/world-cup-arena/design.md §2 + §3.5
 */

import { COUNTRIES, COUNTRY_BY_ISO3, GROUPS, type Country } from '@/data/countries';
import { loadCardsForCountry } from '@/services/cardPoolService';
import type { CardLevel, CulturalCard } from '@/data/cards/types';
import type {
  GroupTableRow,
  PlayerStageEntry,
  Tournament,
  TournamentMatch,
  TournamentStatus,
} from '@/services/tournamentDb';

// ── 创建存档 ────────────────────────────────────────────────

/**
 * 初始化一份锦标赛：72 场小组赛 + 32 场淘汰赛骨架（占位符）。
 *
 * @param playerIso3 玩家代表国家的 ISO3
 * @param contentLevel 内容尺度
 * @param name 自定义存档名（可空，默认 "<中文名> 的 2026 征程"）
 */
export function createTournament(
  playerIso3: string,
  contentLevel: CardLevel,
  name?: string
): Tournament {
  const player = COUNTRY_BY_ISO3[playerIso3];
  if (!player) throw new Error(`未知国家 ${playerIso3}`);

  const matches: TournamentMatch[] = [];

  // ── 小组赛：每组 4 队 × 3 轮 × 2 场 = 6 场 / 组 × 12 组 = 72 场 ──
  for (const g of GROUPS) {
    const teams = COUNTRIES.filter((c) => c.group === g);
    if (teams.length !== 4) {
      console.warn(`[tournament] 组 ${g} 队数异常 ${teams.length}（期望 4）`);
    }
    // round-robin 3 轮配对：(0v1,2v3) / (0v2,1v3) / (0v3,1v2)
    const pairings: Array<Array<[number, number]>> = [
      [[0, 1], [2, 3]],
      [[0, 2], [1, 3]],
      [[0, 3], [1, 2]],
    ];
    pairings.forEach((round, ri) => {
      for (const [a, b] of round) {
        const ta = teams[a];
        const tb = teams[b];
        if (!ta || !tb) continue;
        matches.push({
          id: `group-${g}-R${ri + 1}-${ta.iso3}-${tb.iso3}`,
          stage: 'group',
          round: ri + 1,
          group: g,
          aIso3: ta.iso3,
          bIso3: tb.iso3,
          involvesPlayer: ta.iso3 === playerIso3 || tb.iso3 === playerIso3,
        });
      }
    });
  }

  // ── 淘汰赛骨架：32 强 16 场 + 16 强 8 场 + 8 强 4 场 + 4 强 2 场 + 3/4 决 1 场 + 决赛 1 场 = 32 ──
  for (let i = 1; i <= 16; i++) {
    matches.push({
      id: `ro32-M${String(i).padStart(2, '0')}`,
      stage: 'ro32',
      aIso3: `R32-A${i}`,
      bIso3: `R32-B${i}`,
      involvesPlayer: false,
    });
  }
  for (let i = 1; i <= 8; i++) {
    matches.push({
      id: `ro16-M${String(i).padStart(2, '0')}`,
      stage: 'ro16',
      aIso3: `W-ro32-M${String(i * 2 - 1).padStart(2, '0')}`,
      bIso3: `W-ro32-M${String(i * 2).padStart(2, '0')}`,
      involvesPlayer: false,
    });
  }
  for (let i = 1; i <= 4; i++) {
    matches.push({
      id: `qf-M${String(i).padStart(2, '0')}`,
      stage: 'qf',
      aIso3: `W-ro16-M${String(i * 2 - 1).padStart(2, '0')}`,
      bIso3: `W-ro16-M${String(i * 2).padStart(2, '0')}`,
      involvesPlayer: false,
    });
  }
  for (let i = 1; i <= 2; i++) {
    matches.push({
      id: `sf-M${String(i).padStart(2, '0')}`,
      stage: 'sf',
      aIso3: `W-qf-M${String(i * 2 - 1).padStart(2, '0')}`,
      bIso3: `W-qf-M${String(i * 2).padStart(2, '0')}`,
      involvesPlayer: false,
    });
  }
  matches.push({
    id: 'third',
    stage: 'third',
    aIso3: 'L-sf-M01',
    bIso3: 'L-sf-M02',
    involvesPlayer: false,
  });
  matches.push({
    id: 'final',
    stage: 'final',
    aIso3: 'W-sf-M01',
    bIso3: 'W-sf-M02',
    involvesPlayer: false,
  });

  const groupTables = initGroupTables();

  const now = Date.now();
  const tournament: Tournament = {
    name: name?.trim() || `${player.nameZh} 的 2026 征程`,
    createdAt: now,
    updatedAt: now,
    playerIso3,
    contentLevel,
    status: 'group',
    matches,
    groupTables,
    playerStageHistory: [],
  };
  tournament.currentMatchId = getNextPlayerMatch(tournament)?.id;
  return tournament;
}

/** 12 组空积分榜 */
function initGroupTables(): Record<string, GroupTableRow[]> {
  const out: Record<string, GroupTableRow[]> = {};
  for (const g of GROUPS) {
    const teams = COUNTRIES.filter((c) => c.group === g);
    out[g] = teams.map((t) => ({
      iso3: t.iso3,
      played: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      diff: 0,
      points: 0,
    }));
  }
  return out;
}

// ── 国家强度估算（卡池属性平均） ──────────────────────────────

const STRENGTH_CACHE = new Map<string, number>();
const HOST_SET = new Set(['USA', 'CAN', 'MEX']);

/**
 * 国家强度 = PG 卡 attributes 4 维平均（0-100）。
 * 取 PG 一档保持模拟稳定（不受用户 contentLevel 影响），
 * 但因为所有国家 PG 都至少 1 张，足够代表实力。
 */
function countryStrength(iso3: string): number {
  const cached = STRENGTH_CACHE.get(iso3);
  if (cached != null) return cached;

  const cards = loadCardsForCountry(iso3, 'pg');
  if (cards.length === 0) {
    STRENGTH_CACHE.set(iso3, 50);
    return 50;
  }
  let total = 0;
  for (const c of cards) {
    const a = c.attributes;
    total += (a.historical + a.artistic + a.influence + a.uniqueness) / 4;
  }
  const avg = total / cards.length;
  STRENGTH_CACHE.set(iso3, avg);
  return avg;
}

/** 主场 buff */
function isHostBoost(iso3: string): number {
  return HOST_SET.has(iso3) ? 1.1 : 1.0;
}

// ── 模拟单场（非玩家） ───────────────────────────────────────

/**
 * 快速模拟：双方强度 × 主场 × 0.7-1.3 随机 → 强度差映射进球。
 *
 * 设计目标：强队不一定赢，但赢面大；进球范围 0-4。
 */
export function simulateMatch(aIso3: string, bIso3: string): {
  aScore: number;
  bScore: number;
  aGoals: number;
  bGoals: number;
  winner: 'a' | 'b' | 'draw';
} {
  const aStr = countryStrength(aIso3) * isHostBoost(aIso3) * (0.7 + Math.random() * 0.6);
  const bStr = countryStrength(bIso3) * isHostBoost(bIso3) * (0.7 + Math.random() * 0.6);

  // 强度映射进球：基准 = strength / 30，加 ±1 随机
  const aGoals = Math.max(0, Math.min(5, Math.round(aStr / 30 + (Math.random() - 0.5))));
  const bGoals = Math.max(0, Math.min(5, Math.round(bStr / 30 + (Math.random() - 0.5))));

  let winner: 'a' | 'b' | 'draw';
  if (aGoals > bGoals) winner = 'a';
  else if (bGoals > aGoals) winner = 'b';
  else winner = 'draw';

  return {
    aScore: aGoals * 25,
    bScore: bGoals * 25,
    aGoals,
    bGoals,
    winner,
  };
}

/**
 * 淘汰赛 sudden death：平局时双方各随机抽 1 张卡比 attribute 总和，
 * 总和高者胜，仍平则 A 先手胜（极小概率）。
 */
function suddenDeath(
  aIso3: string,
  bIso3: string,
  contentLevel: CardLevel
): 'a' | 'b' {
  const aPool = loadCardsForCountry(aIso3, contentLevel);
  const bPool = loadCardsForCountry(bIso3, contentLevel);
  const pick = (pool: CulturalCard[]): number => {
    if (pool.length === 0) return 0;
    const c = pool[Math.floor(Math.random() * pool.length)];
    return c.attributes.historical + c.attributes.artistic + c.attributes.influence + c.attributes.uniqueness;
  };
  const aSum = pick(aPool);
  const bSum = pick(bPool);
  return aSum >= bSum ? 'a' : 'b';
}

/**
 * 模拟一场非玩家比赛并写回 tournament.matches。
 *
 * 淘汰赛阶段平局会强制走 sudden death。
 */
export function simulateNonPlayerMatch(matchId: string, tournament: Tournament): void {
  const match = tournament.matches.find((m) => m.id === matchId);
  if (!match) throw new Error(`找不到比赛 ${matchId}`);
  if (match.result) return; // 已模拟过
  if (match.involvesPlayer) throw new Error(`玩家场次不能用模拟: ${matchId}`);

  const sim = simulateMatch(match.aIso3, match.bIso3);
  let winner = sim.winner;
  // 淘汰赛必须分胜负
  if (match.stage !== 'group' && winner === 'draw') {
    winner = suddenDeath(match.aIso3, match.bIso3, tournament.contentLevel);
  }
  match.result = {
    aScore: sim.aScore,
    bScore: sim.bScore,
    aGoals: sim.aGoals,
    bGoals: sim.bGoals,
    winner,
    playedAt: Date.now(),
  };

  if (match.stage === 'group' && match.group) {
    rebuildGroupTable(tournament, match.group);
  }
}

// ── 玩家场次回写 ─────────────────────────────────────────────

/**
 * 玩家场次结束后，调此函数把 Battle 结果回写到 tournament 上。
 *
 * @param aWins / bWins  5 回合制中各自赢的回合数（来自 BattleState）
 * @param aTotal / bTotal 5 回合 LLM 总分
 */
export function applyPlayerMatchResult(
  matchId: string,
  tournament: Tournament,
  params: {
    aWins: number;
    bWins: number;
    aTotal: number;
    bTotal: number;
    winner: 'a' | 'b' | 'draw';
    battleId?: number;
  }
): void {
  const match = tournament.matches.find((m) => m.id === matchId);
  if (!match) throw new Error(`找不到比赛 ${matchId}`);
  let winner = params.winner;

  // 淘汰赛阶段：玩家平局也走 sudden death（玩家不知情，引擎决定）
  if (match.stage !== 'group' && winner === 'draw') {
    winner = suddenDeath(match.aIso3, match.bIso3, tournament.contentLevel);
  }

  match.result = {
    aScore: params.aTotal,
    bScore: params.bTotal,
    aGoals: params.aWins,
    bGoals: params.bWins,
    winner,
    playedAt: Date.now(),
    battleId: params.battleId,
  };

  if (match.stage === 'group' && match.group) {
    rebuildGroupTable(tournament, match.group);
  }

  // 记录到征程历史
  const playerIso3 = tournament.playerIso3;
  const isPlayerA = match.aIso3 === playerIso3;
  const opponent = isPlayerA ? match.bIso3 : match.aIso3;
  const outcome: PlayerStageEntry['outcome'] =
    winner === 'draw'
      ? 'draw'
      : (winner === 'a' && isPlayerA) || (winner === 'b' && !isPlayerA)
        ? 'win'
        : 'lose';
  tournament.playerStageHistory.push({
    stage: match.stage,
    opponent,
    outcome,
    matchId: match.id,
  });
}

// ── 积分榜重算 ────────────────────────────────────────────────

export function rebuildGroupTable(tournament: Tournament, group: string): void {
  const rows = tournament.groupTables[group];
  if (!rows) return;

  // 重置
  for (const r of rows) {
    r.played = 0;
    r.wins = 0;
    r.draws = 0;
    r.losses = 0;
    r.goalsFor = 0;
    r.goalsAgainst = 0;
    r.diff = 0;
    r.points = 0;
    r.rank = undefined;
    r.qualified = undefined;
    r.bestThirdRank = undefined;
  }

  // 累加该组所有已结束比赛
  const groupMatches = tournament.matches.filter(
    (m) => m.stage === 'group' && m.group === group && m.result
  );
  for (const m of groupMatches) {
    const aRow = rows.find((r) => r.iso3 === m.aIso3);
    const bRow = rows.find((r) => r.iso3 === m.bIso3);
    if (!aRow || !bRow || !m.result) continue;
    aRow.played += 1;
    bRow.played += 1;
    aRow.goalsFor += m.result.aGoals;
    aRow.goalsAgainst += m.result.bGoals;
    bRow.goalsFor += m.result.bGoals;
    bRow.goalsAgainst += m.result.aGoals;
    if (m.result.winner === 'a') {
      aRow.wins += 1;
      bRow.losses += 1;
      aRow.points += 3;
    } else if (m.result.winner === 'b') {
      bRow.wins += 1;
      aRow.losses += 1;
      bRow.points += 3;
    } else {
      aRow.draws += 1;
      bRow.draws += 1;
      aRow.points += 1;
      bRow.points += 1;
    }
    aRow.diff = aRow.goalsFor - aRow.goalsAgainst;
    bRow.diff = bRow.goalsFor - bRow.goalsAgainst;
  }

  // 排名（只有全打完才有意义；进行中也排个序方便 UI 展示）
  rows.sort(compareGroupRow);
  rows.forEach((r, i) => {
    r.rank = (i + 1) as 1 | 2 | 3 | 4;
  });
}

/** 小组赛排序：积分 → 净胜球 → 进球 */
function compareGroupRow(a: GroupTableRow, b: GroupTableRow): number {
  if (b.points !== a.points) return b.points - a.points;
  if (b.diff !== a.diff) return b.diff - a.diff;
  if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
  return a.iso3.localeCompare(b.iso3);
}

// ── 阶段推进 ─────────────────────────────────────────────────

/**
 * 推进 tournament：
 *  1. 把所有 involvesPlayer=false 且尚未模拟的比赛模拟掉（仅当前阶段及之前）
 *  2. 检查当前阶段是否全部结束
 *  3. 若结束：决出下一阶段对阵、更新 status
 *  4. 重算 currentMatchId
 *
 * 应在 createTournament 之后 + 每次玩家场次回写后调用。
 */
export function advanceTournament(tournament: Tournament): void {
  if (tournament.status === 'champion' || tournament.status === 'eliminated') {
    return;
  }

  // 1. 当前阶段先模拟掉所有非玩家场（玩家场要等用户来打）
  for (const m of tournament.matches) {
    if (m.result) continue;
    if (!isStageActiveOrPast(m.stage, tournament.status)) continue;
    if (!m.involvesPlayer && hasResolvedTeams(m)) {
      simulateNonPlayerMatch(m.id, tournament);
    }
  }

  // 2. 检查阶段是否完成
  const allStageMatches = tournament.matches.filter((m) => m.stage === currentStage(tournament));
  const stageDone = allStageMatches.every((m) => !!m.result);

  if (!stageDone) {
    tournament.currentMatchId = getNextPlayerMatch(tournament)?.id;
    return;
  }

  // 3. 推进到下一阶段
  switch (tournament.status) {
    case 'group':
      promoteToRo32(tournament);
      break;
    case 'ro32':
      promoteToNext(tournament, 'ro32', 'ro16');
      break;
    case 'ro16':
      promoteToNext(tournament, 'ro16', 'qf');
      break;
    case 'qf':
      promoteToNext(tournament, 'qf', 'sf');
      break;
    case 'sf':
      promoteToNext(tournament, 'sf', 'final');
      // sf 同时填 third 比赛
      fillThirdPlace(tournament);
      break;
    case 'final':
      finalizeTournament(tournament);
      return;
  }

  // 4. 继续模拟新阶段的非玩家场
  for (const m of tournament.matches) {
    if (m.result) continue;
    if (m.stage !== currentStage(tournament)) continue;
    if (!m.involvesPlayer && hasResolvedTeams(m)) {
      simulateNonPlayerMatch(m.id, tournament);
    }
  }

  // 5. 标记玩家是否已被淘汰
  if (!playerStillIn(tournament)) {
    tournament.status = 'eliminated';
    tournament.finishedAt = Date.now();
    tournament.finalPlacement = computePlayerPlacement(tournament);
    return;
  }

  // 6. 重新计算下一场玩家比赛
  tournament.currentMatchId = getNextPlayerMatch(tournament)?.id;
}

/** 当前阶段 → 给 m.stage 用的字符串 */
function currentStage(t: Tournament): TournamentMatch['stage'] {
  switch (t.status) {
    case 'group':
      return 'group';
    case 'ro32':
      return 'ro32';
    case 'ro16':
      return 'ro16';
    case 'qf':
      return 'qf';
    case 'sf':
      return 'sf';
    case 'final':
      return 'final';
    default:
      return 'group';
  }
}

/** 这个 stage 是否在当前 status 之前或就是当前 */
function isStageActiveOrPast(
  stage: TournamentMatch['stage'],
  status: TournamentStatus
): boolean {
  const order: Array<TournamentMatch['stage']> = ['group', 'ro32', 'ro16', 'qf', 'sf', 'third', 'final'];
  const statusOrder: Record<TournamentStatus, number> = {
    group: 0,
    ro32: 1,
    ro16: 2,
    qf: 3,
    sf: 4,
    final: 5,
    champion: 6,
    eliminated: 6,
  };
  return order.indexOf(stage) <= statusOrder[status];
}

/** 双方 iso3 都已 resolve 成真国家（不是占位符）→ 才能模拟 */
function hasResolvedTeams(m: TournamentMatch): boolean {
  return COUNTRY_BY_ISO3[m.aIso3] != null && COUNTRY_BY_ISO3[m.bIso3] != null;
}

/** 当前阶段的下一场玩家比赛 */
export function getNextPlayerMatch(tournament: Tournament): TournamentMatch | undefined {
  const stage = currentStage(tournament);
  return tournament.matches.find(
    (m) => m.stage === stage && m.involvesPlayer && !m.result && hasResolvedTeams(m)
  );
}

/** 玩家是否还在比赛中（淘汰赛阶段没被淘汰） */
function playerStillIn(tournament: Tournament): boolean {
  // 看 status 是否已经在新阶段，且玩家是否进入了该阶段
  const stage = currentStage(tournament);
  if (stage === 'group') return true;
  const stageMatches = tournament.matches.filter((m) => m.stage === stage);
  return stageMatches.some(
    (m) => m.aIso3 === tournament.playerIso3 || m.bIso3 === tournament.playerIso3
  );
}

// ── 出线决出 32 强 ──────────────────────────────────────────

/**
 * 12 组前 2 + 8 个最佳第 3 = 32 队，按 seed 顺序排（小组冠 → 小组亚 → 最佳第 3）。
 */
function determineQualifiers(tournament: Tournament): string[] {
  const winners: string[] = [];
  const runnersUp: string[] = [];
  const thirds: GroupTableRow[] = [];

  for (const g of GROUPS) {
    const rows = tournament.groupTables[g];
    if (!rows || rows.length < 4) continue;
    rows.sort(compareGroupRow);
    rows.forEach((r, i) => {
      r.rank = (i + 1) as 1 | 2 | 3 | 4;
      r.qualified = false;
    });
    if (rows[0]) {
      rows[0].qualified = true;
      winners.push(rows[0].iso3);
    }
    if (rows[1]) {
      rows[1].qualified = true;
      runnersUp.push(rows[1].iso3);
    }
    if (rows[2]) {
      thirds.push(rows[2]);
    }
  }

  // 8 个最佳第 3
  thirds.sort(compareGroupRow);
  const bestThirds = thirds.slice(0, 8);
  bestThirds.forEach((r, i) => {
    r.qualified = true;
    r.bestThirdRank = i + 1;
  });
  // 给所有第 3 打编号（即使没出线）
  thirds.forEach((r, i) => {
    if (r.bestThirdRank == null) r.bestThirdRank = i + 1;
  });

  return [...winners, ...runnersUp, ...bestThirds.map((r) => r.iso3)];
}

/**
 * 小组赛结束 → 排淘汰赛 32 强对阵。
 *
 * 简化版：32 队按 seed (1 → 32) 顺序，1v32, 2v31, ... 16v17。
 * 玩家所在的 match 标 involvesPlayer = true。
 */
function promoteToRo32(tournament: Tournament): void {
  const ranked = determineQualifiers(tournament);
  if (ranked.length !== 32) {
    console.warn(`[tournament] 出线队数异常 ${ranked.length}（期望 32）`);
  }
  // 1v32, 2v31, ...
  const ro32 = tournament.matches.filter((m) => m.stage === 'ro32');
  for (let i = 0; i < 16; i++) {
    const m = ro32[i];
    if (!m) break;
    const a = ranked[i];
    const b = ranked[31 - i];
    m.aIso3 = a ?? m.aIso3;
    m.bIso3 = b ?? m.bIso3;
    m.involvesPlayer =
      a === tournament.playerIso3 || b === tournament.playerIso3;
  }
  tournament.status = 'ro32';
}

/** 通用：从 prevStage 推到 nextStage（取胜者填 nextStage matches） */
function promoteToNext(
  tournament: Tournament,
  prevStage: TournamentMatch['stage'],
  nextStage: TournamentMatch['stage']
): void {
  const next = tournament.matches.filter((m) => m.stage === nextStage);
  for (const m of next) {
    m.aIso3 = resolveWinner(tournament, m.aIso3) ?? m.aIso3;
    m.bIso3 = resolveWinner(tournament, m.bIso3) ?? m.bIso3;
    m.involvesPlayer =
      m.aIso3 === tournament.playerIso3 || m.bIso3 === tournament.playerIso3;
  }
  // 更新 status
  tournament.status = nextStage as TournamentStatus;
}

/** 'W-ro32-M01' → ISO3（找该 match 的 winner 那一方的真 iso3） */
function resolveWinner(tournament: Tournament, placeholder: string): string | undefined {
  if (!placeholder.startsWith('W-') && !placeholder.startsWith('L-')) {
    return placeholder; // 已经是真 iso3
  }
  const isLoser = placeholder.startsWith('L-');
  const matchId = placeholder.slice(2); // 'ro32-M01'
  const src = tournament.matches.find((m) => m.id === matchId);
  if (!src || !src.result) return undefined;
  if (src.result.winner === 'a') return isLoser ? src.bIso3 : src.aIso3;
  if (src.result.winner === 'b') return isLoser ? src.aIso3 : src.bIso3;
  return undefined; // 平局未决（不应到这里）
}

/** 4 强败者填 3/4 决定战 */
function fillThirdPlace(tournament: Tournament): void {
  const third = tournament.matches.find((m) => m.id === 'third');
  if (!third) return;
  third.aIso3 = resolveWinner(tournament, third.aIso3) ?? third.aIso3;
  third.bIso3 = resolveWinner(tournament, third.bIso3) ?? third.bIso3;
  third.involvesPlayer =
    third.aIso3 === tournament.playerIso3 || third.bIso3 === tournament.playerIso3;
}

// ── 决赛后定档 ───────────────────────────────────────────────

function finalizeTournament(tournament: Tournament): void {
  const finalMatch = tournament.matches.find((m) => m.id === 'final');
  const thirdMatch = tournament.matches.find((m) => m.id === 'third');
  if (finalMatch?.result) {
    const championIso3 =
      finalMatch.result.winner === 'a' ? finalMatch.aIso3 : finalMatch.bIso3;
    if (championIso3 === tournament.playerIso3) {
      tournament.status = 'champion';
    } else {
      tournament.status = 'eliminated';
    }
  } else {
    tournament.status = 'eliminated';
  }
  tournament.finalPlacement = computePlayerPlacement(tournament);
  tournament.finishedAt = Date.now();
}

/**
 * 计算玩家最终名次：
 *  - 冠军 → 1
 *  - 亚军 → 2
 *  - 季军（3/4 名战胜者）→ 3
 *  - 4 名（3/4 名战败者）→ 4
 *  - 8 强、16 强、32 强出局 → 8 / 16 / 32
 *  - 小组赛出局 → 32+
 */
function computePlayerPlacement(tournament: Tournament): number {
  const playerIso3 = tournament.playerIso3;
  const finalM = tournament.matches.find((m) => m.id === 'final');
  if (finalM?.result) {
    const champ = finalM.result.winner === 'a' ? finalM.aIso3 : finalM.bIso3;
    const runnerUp = finalM.result.winner === 'a' ? finalM.bIso3 : finalM.aIso3;
    if (champ === playerIso3) return 1;
    if (runnerUp === playerIso3) return 2;
  }
  const thirdM = tournament.matches.find((m) => m.id === 'third');
  if (thirdM?.result) {
    const third = thirdM.result.winner === 'a' ? thirdM.aIso3 : thirdM.bIso3;
    const fourth = thirdM.result.winner === 'a' ? thirdM.bIso3 : thirdM.aIso3;
    if (third === playerIso3) return 3;
    if (fourth === playerIso3) return 4;
  }
  // 否则按淘汰阶段
  const order: Array<TournamentMatch['stage']> = ['sf', 'qf', 'ro16', 'ro32', 'group'];
  const placement: Record<string, number> = {
    sf: 4,
    qf: 8,
    ro16: 16,
    ro32: 32,
    group: 33,
  };
  for (const stage of order) {
    const played = tournament.matches.find(
      (m) =>
        m.stage === stage &&
        (m.aIso3 === playerIso3 || m.bIso3 === playerIso3) &&
        m.result
    );
    if (played) {
      const isPlayerA = played.aIso3 === playerIso3;
      const playerWon =
        (played.result!.winner === 'a' && isPlayerA) ||
        (played.result!.winner === 'b' && !isPlayerA);
      if (playerWon) continue; // 赢了，继续往后看
      return placement[stage];
    }
  }
  return 33; // 兜底
}

// ── 当前阶段的标签（UI 用） ──────────────────────────────────

export function stageLabel(status: TournamentStatus): string {
  switch (status) {
    case 'group':
      return '小组赛';
    case 'ro32':
      return '32 强';
    case 'ro16':
      return '16 强';
    case 'qf':
      return '8 强';
    case 'sf':
      return '4 强';
    case 'final':
      return '决赛';
    case 'champion':
      return '冠军';
    case 'eliminated':
      return '已淘汰';
  }
}

export function stageLabelShort(stage: TournamentMatch['stage']): string {
  switch (stage) {
    case 'group':
      return '小组赛';
    case 'ro32':
      return '32 强';
    case 'ro16':
      return '16 强';
    case 'qf':
      return '8 强';
    case 'sf':
      return '4 强';
    case 'third':
      return '3/4 名';
    case 'final':
      return '决赛';
  }
}

/** UI 用：拿到当前比赛该比赛玩家所在 side */
export function playerSideOfMatch(
  match: TournamentMatch,
  playerIso3: string
): 'a' | 'b' | null {
  if (match.aIso3 === playerIso3) return 'a';
  if (match.bIso3 === playerIso3) return 'b';
  return null;
}

/** UI 用：拿玩家在自己组的当前积分排名 */
export function playerGroupRank(t: Tournament): {
  group: string | null;
  rows: GroupTableRow[];
  playerRank: number | null;
} {
  const player = COUNTRY_BY_ISO3[t.playerIso3];
  if (!player) return { group: null, rows: [], playerRank: null };
  const rows = t.groupTables[player.group] ?? [];
  const sorted = [...rows].sort(compareGroupRow);
  const idx = sorted.findIndex((r) => r.iso3 === t.playerIso3);
  return {
    group: player.group,
    rows: sorted,
    playerRank: idx >= 0 ? idx + 1 : null,
  };
}

/** 工具：把比赛里的 iso3 转 Country（占位符返回 null） */
export function resolveCountryOrPlaceholder(iso3: string): Country | null {
  return COUNTRY_BY_ISO3[iso3] ?? null;
}
