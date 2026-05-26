/**
 * 赛程服务：拉取 openfootball/worldcup.json 2026 数据，Dexie 缓存，本地 fallback。
 * 详见 docs/world-cup-arena/design.md §3.4
 */

import Dexie, { type Table } from 'dexie';
import snapshot from '@/data/schedule-snapshot.json';
import { COUNTRY_BY_NAME_EN, type Country } from '@/data/countries';

export const SCHEDULE_URL =
  'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json';

/** openfootball 原始 match 结构 */
export interface RawMatch {
  round: string;
  date: string; // 'YYYY-MM-DD'
  time: string; // '13:00 UTC-6'
  team1: string;
  team2: string;
  group?: string; // 'Group A' / undefined for KO
  ground?: string;
  score?: any;
  goals1?: any;
  goals2?: any;
}

export interface RawSchedule {
  name: string;
  matches: RawMatch[];
}

/** 规范化后的 match，便于 UI 使用 */
export interface MatchView {
  id: string; // round + date + team1 + team2 拼出来稳定主键
  round: string;
  date: string;
  /** 当地时间字符串 'HH:mm' */
  localTime: string;
  /** UTC 偏移分钟数，如 UTC-6 = -360 */
  utcOffsetMin: number;
  /** kickoff 时间（绝对 UTC） */
  kickoffUtc: Date;
  team1Name: string;
  team2Name: string;
  team1?: Country;
  team2?: Country;
  group?: string;
  ground?: string;
  /** 已结束 / 进行中 / 未开始 */
  status: 'upcoming' | 'live' | 'finished';
}

// ── Dexie ───────────────────────────────────────────
class ScheduleDb extends Dexie {
  meta!: Table<{ key: string; value: any; updatedAt: number }, string>;
  matches!: Table<RawMatch & { id: string }, string>;

  constructor() {
    super('wca-schedule');
    this.version(1).stores({
      meta: 'key',
      matches: 'id, date',
    });
  }
}

const db = new ScheduleDb();

// ── 解析工具 ────────────────────────────────────────

/** 'UTC-6' / 'UTC+2' → 分钟数 */
function parseUtcOffset(time: string): { hhmm: string; offsetMin: number } {
  const m = time.match(/^(\d{1,2}:\d{2})\s+UTC([+-])(\d{1,2})(?::?(\d{2}))?$/i);
  if (!m) return { hhmm: time, offsetMin: 0 };
  const sign = m[2] === '-' ? -1 : 1;
  const offsetMin = sign * (parseInt(m[3], 10) * 60 + parseInt(m[4] || '0', 10));
  return { hhmm: m[1], offsetMin };
}

/** 拼 kickoff 的绝对 UTC 时间 */
function buildKickoffUtc(date: string, hhmm: string, offsetMin: number): Date {
  // 当地时间 = UTC + offset → UTC = 当地时间 - offset
  const [hh, mm] = hhmm.split(':').map(Number);
  const ms =
    Date.UTC(
      Number(date.slice(0, 4)),
      Number(date.slice(5, 7)) - 1,
      Number(date.slice(8, 10)),
      hh,
      mm
    ) -
    offsetMin * 60 * 1000;
  return new Date(ms);
}

function statusOf(kickoff: Date, now = new Date()): MatchView['status'] {
  const ms = kickoff.getTime();
  const nowMs = now.getTime();
  const matchLenMs = 2 * 60 * 60 * 1000; // 2 小时
  if (nowMs < ms) return 'upcoming';
  if (nowMs < ms + matchLenMs) return 'live';
  return 'finished';
}

function makeMatchId(m: RawMatch): string {
  return `${m.date}-${m.team1}-vs-${m.team2}`.replace(/\s+/g, '_');
}

/** 规范化：补全 Country、kickoff、状态 */
export function normalizeMatch(m: RawMatch): MatchView {
  const { hhmm, offsetMin } = parseUtcOffset(m.time);
  const kickoffUtc = buildKickoffUtc(m.date, hhmm, offsetMin);
  return {
    id: makeMatchId(m),
    round: m.round,
    date: m.date,
    localTime: hhmm,
    utcOffsetMin: offsetMin,
    kickoffUtc,
    team1Name: m.team1,
    team2Name: m.team2,
    team1: COUNTRY_BY_NAME_EN[m.team1.toLowerCase()],
    team2: COUNTRY_BY_NAME_EN[m.team2.toLowerCase()],
    group: m.group,
    ground: m.ground,
    status: statusOf(kickoffUtc),
  };
}

// ── 加载策略 ────────────────────────────────────────

const MEMORY_KEY = '__wca_schedule_cache__';
let memoryCache: { matches: MatchView[]; loadedAt: number } | null = null;

/**
 * 拉取赛程：
 * 1. Dexie 有缓存 → 立即返回，后台刷新
 * 2. 否则尝试网络，失败回退到打包 snapshot
 */
export async function loadSchedule(force = false): Promise<MatchView[]> {
  if (!force && memoryCache && Date.now() - memoryCache.loadedAt < 60_000) {
    return memoryCache.matches;
  }

  let raw: RawSchedule | null = null;

  // 1. Dexie 缓存
  if (!force) {
    try {
      const meta = await db.meta.get('schedule');
      if (meta?.value && Date.now() - meta.updatedAt < 6 * 60 * 60 * 1000) {
        raw = meta.value as RawSchedule;
      }
    } catch (e) {
      console.warn('[schedule] Dexie 读取失败，继续走网络', e);
    }
  }

  // 2. 网络拉取（force 或 Dexie 无缓存）
  if (!raw) {
    try {
      const res = await fetch(SCHEDULE_URL, { cache: 'no-cache' });
      if (res.ok) {
        raw = (await res.json()) as RawSchedule;
        try {
          await db.meta.put({ key: 'schedule', value: raw, updatedAt: Date.now() });
        } catch (e) {
          console.warn('[schedule] Dexie 写入失败', e);
        }
      } else {
        console.warn(`[schedule] HTTP ${res.status}，回退到 snapshot`);
      }
    } catch (e) {
      console.warn('[schedule] 网络拉取失败，回退到 snapshot', e);
    }
  }

  // 3. fallback：打包的 snapshot
  if (!raw) raw = snapshot as RawSchedule;

  const matches = raw.matches.map(normalizeMatch).sort((a, b) =>
    a.kickoffUtc.getTime() - b.kickoffUtc.getTime()
  );
  memoryCache = { matches, loadedAt: Date.now() };
  // 把 cache 也挂到 window 方便调试
  (globalThis as any)[MEMORY_KEY] = memoryCache;
  return matches;
}

// ── 查询助手 ────────────────────────────────────────

export function getTodayMatches(all: MatchView[], now = new Date()): MatchView[] {
  const today = now.toISOString().slice(0, 10);
  return all.filter((m) => m.date === today);
}

/** 找当天的；若没有则取最近一场未来比赛 */
export function getFeaturedMatch(all: MatchView[], now = new Date()): MatchView | null {
  const today = getTodayMatches(all, now);
  // 优先取今天还没结束的
  const live = today.find((m) => m.status === 'live');
  if (live) return live;
  const upcomingToday = today.find((m) => m.status === 'upcoming');
  if (upcomingToday) return upcomingToday;

  const futureAny = all.find((m) => m.kickoffUtc.getTime() > now.getTime());
  if (futureAny) return futureAny;

  // 全部已结束（赛后），返回最后一场
  return all[all.length - 1] ?? null;
}

/** 未来 7 天的比赛 */
export function getUpcomingWeek(all: MatchView[], now = new Date()): MatchView[] {
  const cutoff = now.getTime() + 7 * 24 * 60 * 60 * 1000;
  return all.filter(
    (m) => m.kickoffUtc.getTime() >= now.getTime() && m.kickoffUtc.getTime() <= cutoff
  );
}

/**
 * 接下来 N 场未结束的比赛（live + upcoming，已按 kickoff 升序）。
 * 开赛前永远不会空 — 是 MatchPicker 默认 tab。
 */
export function getUpcomingMatches(all: MatchView[], limit = 8): MatchView[] {
  return all.filter((m) => m.status !== 'finished').slice(0, limit);
}
