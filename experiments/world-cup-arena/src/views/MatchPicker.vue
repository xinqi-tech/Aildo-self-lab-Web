<script setup lang="ts">
/**
 * 选场次 view: /match-picker
 *
 * Tab: 今日 / 本周 / 全部
 * 每场显示双方国旗 + 时间 + 场地 + 选边下拉
 * 选定后跳 /battle?matchId=xxx&side=a|b
 */
import { onMounted, ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import {
  loadSchedule,
  getTodayMatches,
  getUpcomingWeek,
  getUpcomingMatches,
  type MatchView,
} from '@/services/scheduleService';

const router = useRouter();
const all = ref<MatchView[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

type TabKey = 'upcoming' | 'today' | 'week' | 'all';
const tab = ref<TabKey>('upcoming');

onMounted(async () => {
  loading.value = true;
  try {
    all.value = await loadSchedule();
  } catch (e: any) {
    error.value = e?.message || '赛程加载失败';
  } finally {
    loading.value = false;
  }
});

const visible = computed<MatchView[]>(() => {
  if (loading.value) return [];
  switch (tab.value) {
    case 'upcoming':
      return getUpcomingMatches(all.value);
    case 'today':
      return getTodayMatches(all.value);
    case 'week':
      return getUpcomingWeek(all.value);
    case 'all':
      return all.value;
  }
  return [];
});

const counts = computed(() => ({
  upcoming: getUpcomingMatches(all.value).length,
  today: getTodayMatches(all.value).length,
  week: getUpcomingWeek(all.value).length,
  all: all.value.length,
}));

function pick(match: MatchView, side: 'a' | 'b') {
  if (!match.team1 || !match.team2) {
    alert(`赛程国家映射缺失：${match.team1Name} vs ${match.team2Name}`);
    return;
  }
  router.push({
    path: '/battle',
    query: { matchId: match.id, side },
  });
}

function formatVenueTime(m: MatchView): string {
  const off = m.utcOffsetMin;
  const sign = off >= 0 ? '+' : '-';
  const h = Math.floor(Math.abs(off) / 60);
  return `${m.localTime} UTC${sign}${h}`;
}

function formatLocalTime(m: MatchView): string {
  return m.kickoffUtc.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusBadge(m: MatchView): { label: string; cls: string } {
  switch (m.status) {
    case 'live':
      return { label: '⚡ 进行中', cls: 'live' };
    case 'finished':
      return { label: '✅ 已结束', cls: 'finished' };
    default:
      return { label: '⏳ 即将开始', cls: 'upcoming' };
  }
}
</script>

<template>
  <div class="picker-page">
    <header class="picker-header">
      <h1 class="title-natgeo">选择对战赛事</h1>
      <p class="picker-sub">
        从 2026 真实赛程中选一场，代表其中一方上场。<br />
        <span class="picker-sub-hint">⏱ 任何时候都能玩 — 不必等到真实比赛日。</span>
      </p>
    </header>

    <div class="picker-tabs mono">
      <button
        v-for="t in (['upcoming', 'today', 'week', 'all'] as const)"
        :key="t"
        class="tab-btn"
        :class="{ 'is-active': tab === t }"
        @click="tab = t"
      >
        {{ t === 'upcoming' ? '即将开始' : t === 'today' ? '今日' : t === 'week' ? '本周' : '全部' }}
        <span class="tab-count">{{ counts[t] }}</span>
      </button>
    </div>

    <div v-if="loading" class="picker-loading mono">加载赛程中…</div>
    <div v-else-if="error" class="picker-error mono">⚠ {{ error }}</div>

    <div v-else-if="visible.length === 0" class="picker-empty mono">
      <span v-if="tab === 'today'">
        今天没有真实比赛 — 切到"即将开始"挑一场玩（开赛前默认从开幕战开始）。
      </span>
      <span v-else-if="tab === 'week'">本周内没有比赛 — 试试"即将开始"或"全部"。</span>
      <span v-else>这一段没有比赛。</span>
    </div>

    <ul v-else class="match-list">
      <li v-for="m in visible" :key="m.id" class="match-row nat-card">
        <div class="match-meta">
          <span class="status-pill mono" :class="`status-${statusBadge(m).cls}`">
            {{ statusBadge(m).label }}
          </span>
          <span class="match-date mono">{{ m.date }}</span>
          <span class="match-round mono" v-if="m.group || m.round">
            {{ m.group || m.round }}
          </span>
        </div>

        <div class="match-teams">
          <button class="team-pick" @click="pick(m, 'a')" :disabled="!m.team1">
            <span class="team-flag">{{ m.team1?.flag ?? '🏳️' }}</span>
            <span class="team-name title-cn">
              {{ m.team1?.nameZh ?? m.team1Name }}
            </span>
            <span class="team-side mono">代表 A</span>
          </button>

          <div class="vs-block">
            <span class="vs-text">VS</span>
          </div>

          <button class="team-pick" @click="pick(m, 'b')" :disabled="!m.team2">
            <span class="team-flag">{{ m.team2?.flag ?? '🏳️' }}</span>
            <span class="team-name title-cn">
              {{ m.team2?.nameZh ?? m.team2Name }}
            </span>
            <span class="team-side mono">代表 B</span>
          </button>
        </div>

        <div class="match-times">
          <div class="time-block">
            <span class="time-label mono">当地</span>
            <span class="time-value mono">{{ formatVenueTime(m) }}</span>
          </div>
          <div class="time-block">
            <span class="time-label mono">你的</span>
            <span class="time-value mono">{{ formatLocalTime(m) }}</span>
          </div>
          <div v-if="m.ground" class="time-block">
            <span class="time-label mono">场地</span>
            <span class="time-value">{{ m.ground }}</span>
          </div>
        </div>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.picker-page {
  max-width: 980px;
  margin: 0 auto;
  padding: var(--space-5) var(--space-5) var(--space-7);
}

.picker-header {
  text-align: center;
  margin-bottom: var(--space-5);
}
.picker-header h1 {
  font-size: 28px;
  margin-bottom: var(--space-2);
}
.picker-sub {
  font-family: var(--font-serif-cn);
  color: var(--text-secondary);
  font-size: 14px;
}

.picker-tabs {
  display: flex;
  justify-content: center;
  gap: var(--space-3);
  margin-bottom: var(--space-5);
  border-bottom: 1px solid var(--border-thin);
}
.tab-btn {
  padding: 10px 24px;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  color: var(--text-secondary);
  font-size: 13px;
  letter-spacing: 0.08em;
  transition: all 0.15s;
}
.tab-btn:hover {
  color: var(--accent-deep);
}
.tab-btn.is-active {
  color: var(--accent-deep);
  border-bottom-color: var(--accent-gold);
}
.tab-count {
  display: inline-block;
  margin-left: 6px;
  font-size: 10px;
  padding: 1px 6px;
  background: var(--accent-gold);
  color: var(--accent-deep);
  border-radius: 8px;
}

.picker-loading,
.picker-error,
.picker-empty {
  text-align: center;
  padding: var(--space-7) 0;
  color: var(--text-tertiary);
  font-size: 13px;
}
.picker-error {
  color: var(--text-error);
}

.match-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}

.match-row {
  padding: var(--space-4);
  display: grid;
  grid-template-columns: 1fr 2fr 1fr;
  gap: var(--space-4);
  align-items: center;
}
@media (max-width: 720px) {
  .match-row {
    grid-template-columns: 1fr;
  }
}

.match-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: flex-start;
}
.status-pill {
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 2px;
  letter-spacing: 0.06em;
}
.status-pill.status-live {
  background: var(--accent-blood);
  color: var(--bg-parchment);
}
.status-pill.status-finished {
  background: rgba(42, 36, 25, 0.2);
  color: var(--text-secondary);
}
.status-pill.status-upcoming {
  background: var(--accent-gold);
  color: var(--accent-deep);
}
.match-date,
.match-round {
  font-size: 10px;
  color: var(--text-tertiary);
}

.match-teams {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
}
.team-pick {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  flex: 1;
  padding: 10px 8px;
  background: rgba(244, 232, 208, 0.6);
  border: 1px solid var(--border-thin);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.15s;
}
.team-pick:hover:not(:disabled) {
  background: var(--accent-gold);
  border-color: var(--accent-gold);
  transform: translateY(-2px);
}
.team-pick:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.team-flag {
  font-size: 30px;
  line-height: 1;
}
.team-name {
  font-size: 14px;
  font-weight: 700;
  color: var(--accent-deep);
}
.team-side {
  font-size: 9px;
  color: var(--text-tertiary);
  letter-spacing: 0.1em;
}

.vs-block {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 var(--space-2);
}
.vs-text {
  font-family: var(--font-title);
  font-size: 18px;
  color: var(--accent-gold);
  font-weight: 900;
  letter-spacing: 0.1em;
}

.match-times {
  display: flex;
  flex-direction: column;
  gap: 4px;
  border-left: 1px dashed var(--border-thin);
  padding-left: var(--space-3);
}
@media (max-width: 720px) {
  .match-times {
    border-left: none;
    padding-left: 0;
    border-top: 1px dashed var(--border-thin);
    padding-top: var(--space-2);
  }
}
.time-block {
  display: flex;
  gap: 8px;
  font-size: 11px;
  align-items: baseline;
}
.time-label {
  color: var(--accent-gold);
  letter-spacing: 0.06em;
  width: 32px;
  flex-shrink: 0;
}
.time-value {
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
