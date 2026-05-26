<script setup lang="ts">
/**
 * 锦标赛存档列表：/tournament
 *
 * 列出所有 Tournament 存档（按 updatedAt 倒序），含国旗 + 名字 + 状态徽章 + 更新时间。
 * 每条提供 [继续] / [删除]；底部 "+ 开新档" 跳 /tournament/new。
 */
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  listTournaments,
  deleteTournament,
  type Tournament,
} from '@/services/tournamentDb';
import { stageLabel } from '@/services/tournamentEngine';
import { COUNTRY_BY_ISO3 } from '@/data/countries';

const router = useRouter();
const loading = ref(true);
const tournaments = ref<Tournament[]>([]);

async function refresh() {
  loading.value = true;
  try {
    tournaments.value = await listTournaments();
  } finally {
    loading.value = false;
  }
}

onMounted(refresh);

function continueGame(t: Tournament) {
  if (t.id != null) router.push(`/tournament/${t.id}`);
}

async function removeGame(t: Tournament) {
  if (t.id == null) return;
  if (!confirm(`删除存档 "${t.name}"？不可恢复。`)) return;
  await deleteTournament(t.id);
  await refresh();
}

function newGame() {
  router.push('/tournament/new');
}

function fmtTime(ts: number): string {
  const d = new Date(ts);
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${yy}-${mm}-${dd} ${hh}:${mi}`;
}

function badgeClass(t: Tournament): string {
  if (t.status === 'champion') return 'badge-champion';
  if (t.status === 'eliminated') return 'badge-eliminated';
  return 'badge-active';
}

const empty = computed(() => !loading.value && tournaments.value.length === 0);
</script>

<template>
  <div class="tournament-list-page">
    <header class="page-header">
      <h1 class="page-title">🏆 锦标赛存档</h1>
      <p class="page-sub mono">你的 2026 世界杯征程</p>
    </header>

    <div v-if="loading" class="loading mono">读取存档…</div>

    <div v-else-if="empty" class="empty-state nat-card">
      <p class="empty-line title-cn">还没有锦标赛</p>
      <p class="empty-sub mono">开始你的 2026 征程</p>
      <button class="nat-btn nat-btn-gold" @click="newGame">⚔ 开始新征程</button>
    </div>

    <ul v-else class="card-list">
      <li v-for="t in tournaments" :key="t.id" class="card-row nat-card">
        <div class="row-left">
          <span class="row-flag">{{ COUNTRY_BY_ISO3[t.playerIso3]?.flag || '🏳' }}</span>
          <div class="row-text">
            <div class="row-name title-cn">{{ t.name }}</div>
            <div class="row-meta mono">
              <span :class="['row-badge', badgeClass(t)]">{{ stageLabel(t.status) }}</span>
              <span class="row-time">更新 {{ fmtTime(t.updatedAt) }}</span>
              <span v-if="t.finalPlacement" class="row-placement">
                · 最终 {{ t.finalPlacement }} 位
              </span>
            </div>
          </div>
        </div>
        <div class="row-actions">
          <button class="nat-btn nat-btn-gold" @click="continueGame(t)">继续</button>
          <button class="nat-btn nat-btn-danger" @click="removeGame(t)">删除</button>
        </div>
      </li>
    </ul>

    <div v-if="!empty && !loading" class="footer-actions">
      <button class="nat-btn nat-btn-gold" @click="newGame">+ 开新档</button>
    </div>
  </div>
</template>

<style scoped>
.tournament-list-page {
  max-width: 960px;
  margin: 0 auto;
  padding: var(--space-5) var(--space-5) var(--space-7);
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
}

.page-header {
  text-align: center;
}
.page-title {
  font-family: var(--font-title);
  font-size: 32px;
  font-weight: 900;
  letter-spacing: 0.1em;
  color: var(--accent-deep);
}
.page-sub {
  margin-top: var(--space-2);
  color: var(--text-secondary);
  font-size: 12px;
  letter-spacing: 0.08em;
}

.loading {
  text-align: center;
  padding: var(--space-7) 0;
  color: var(--text-tertiary);
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-7) var(--space-5);
  text-align: center;
}
.empty-line {
  font-size: 22px;
  color: var(--accent-deep);
}
.empty-sub {
  font-size: 12px;
  color: var(--text-secondary);
  letter-spacing: 0.08em;
}

.card-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.card-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-4);
  padding: var(--space-3) var(--space-4);
  background: var(--bg-parchment);
  border: 1px solid var(--accent-gold);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-card);
}
.row-left {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex: 1;
  min-width: 0;
}
.row-flag {
  font-size: 36px;
  line-height: 1;
}
.row-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.row-name {
  font-size: 16px;
  color: var(--accent-deep);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.row-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  font-size: 11px;
  color: var(--text-secondary);
}
.row-badge {
  padding: 2px 8px;
  border-radius: 2px;
  font-weight: 600;
  letter-spacing: 0.06em;
}
.badge-active {
  background: var(--accent-gold);
  color: var(--accent-deep);
}
.badge-champion {
  background: var(--accent-blood);
  color: var(--bg-parchment);
}
.badge-eliminated {
  background: var(--text-tertiary);
  color: var(--bg-parchment);
}
.row-time {
  color: var(--text-tertiary);
}
.row-placement {
  color: var(--accent-blood);
  font-weight: 600;
}
.row-actions {
  display: flex;
  gap: var(--space-2);
}

.nat-btn {
  font-family: var(--font-title);
  letter-spacing: 0.08em;
  font-size: 11px;
  padding: 6px 12px;
  border-radius: 2px;
  cursor: pointer;
  background: transparent;
  border: 1px solid var(--accent-gold);
  color: var(--accent-deep);
}
.nat-btn:hover {
  background: rgba(212, 160, 23, 0.18);
}
.nat-btn-gold {
  background: var(--accent-gold);
  color: var(--accent-deep);
}
.nat-btn-gold:hover {
  background: var(--accent-gold-dim);
}
.nat-btn-danger {
  border-color: var(--accent-blood);
  color: var(--accent-blood);
}
.nat-btn-danger:hover {
  background: rgba(111, 29, 27, 0.12);
}

.footer-actions {
  display: flex;
  justify-content: center;
  margin-top: var(--space-3);
}
</style>
