<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import { loadSchedule, getFeaturedMatch, type MatchView } from '@/services/scheduleService';

const router = useRouter();

const loading = ref(true);
const error = ref<string | null>(null);
const featured = ref<MatchView | null>(null);

const now = new Date();
const localTzLabel = computed(() => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local';
  } catch {
    return 'Local';
  }
});

onMounted(async () => {
  loading.value = true;
  try {
    const all = await loadSchedule();
    featured.value = getFeaturedMatch(all);
  } catch (e: any) {
    error.value = e?.message || '赛程加载失败';
  } finally {
    loading.value = false;
  }
});

const venueLocalLabel = computed(() => {
  if (!featured.value) return '';
  const off = featured.value.utcOffsetMin;
  const sign = off >= 0 ? '+' : '-';
  const h = Math.floor(Math.abs(off) / 60);
  return `${featured.value.localTime} (UTC${sign}${h})`;
});

const userLocalLabel = computed(() => {
  if (!featured.value) return '';
  return featured.value.kickoffUtc.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
});

const isToday = computed(() => {
  if (!featured.value) return false;
  const today = new Date().toISOString().slice(0, 10);
  return featured.value.date === today;
});

const statusLabel = computed(() => {
  if (!featured.value) return '';
  switch (featured.value.status) {
    case 'live':
      return '⚡ 正在进行';
    case 'finished':
      return '✅ 已结束';
    default:
      return isToday.value ? '📅 今日大戏' : '⏳ 即将开始';
  }
});
</script>

<template>
  <div class="banner" :class="`banner-${featured?.status ?? 'loading'}`">
    <div v-if="loading" class="banner-inner banner-loading mono">
      <span>加载赛程中…</span>
    </div>

    <div v-else-if="error" class="banner-inner banner-error mono">
      <span>⚠ {{ error }}</span>
    </div>

    <div v-else-if="!featured" class="banner-inner mono">
      <span>暂无即将到来的比赛</span>
    </div>

    <div v-else class="banner-inner">
      <div class="banner-status">
        <span class="status-pill">{{ statusLabel }}</span>
        <span class="banner-date mono">{{ featured.date }}</span>
      </div>

      <div class="banner-matchup">
        <div class="team team-left">
          <span class="team-flag">{{ featured.team1?.flag ?? '🏳️' }}</span>
          <span class="team-name title-cn">{{ featured.team1?.nameZh ?? featured.team1Name }}</span>
          <span class="team-name-en mono">{{ featured.team1Name }}</span>
        </div>

        <div class="vs-block">
          <span class="vs-text">VS</span>
        </div>

        <div class="team team-right">
          <span class="team-flag">{{ featured.team2?.flag ?? '🏳️' }}</span>
          <span class="team-name title-cn">{{ featured.team2?.nameZh ?? featured.team2Name }}</span>
          <span class="team-name-en mono">{{ featured.team2Name }}</span>
        </div>
      </div>

      <div class="banner-meta">
        <div class="meta-block">
          <span class="meta-label mono">当地</span>
          <span class="meta-value mono">{{ venueLocalLabel }}</span>
        </div>
        <div class="meta-block">
          <span class="meta-label mono">{{ localTzLabel }}</span>
          <span class="meta-value mono">{{ userLocalLabel }}</span>
        </div>
        <div v-if="featured.ground" class="meta-block">
          <span class="meta-label mono">场地</span>
          <span class="meta-value">{{ featured.ground }}</span>
        </div>
        <div v-if="featured.group || featured.round" class="meta-block">
          <span class="meta-label mono">赛段</span>
          <span class="meta-value">{{ featured.group || featured.round }}</span>
        </div>
      </div>

      <div class="banner-actions">
        <button
          class="nat-btn nat-btn-gold"
          @click="router.push('/match-picker')"
        >
          ⚔ 进入对战
        </button>
        <button class="nat-btn" disabled title="阶段 3 开放">👁 AI 观战</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.banner {
  position: relative;
  padding: 12px 28px;
  background: linear-gradient(
    180deg,
    rgba(26, 26, 46, 0.92) 0%,
    rgba(26, 26, 46, 0.78) 100%
  );
  color: var(--text-on-deep);
  border-bottom: 1px solid var(--accent-gold);
}

.banner-live {
  background: linear-gradient(
    180deg,
    rgba(111, 29, 27, 0.95) 0%,
    rgba(26, 26, 46, 0.85) 100%
  );
}

.banner-inner {
  display: grid;
  grid-template-columns: auto 1fr auto auto;
  align-items: center;
  gap: var(--space-5);
  max-width: 1400px;
  margin: 0 auto;
}

.banner-loading,
.banner-error {
  display: flex;
  justify-content: center;
  padding: 4px 0;
  color: var(--text-tertiary);
  font-size: 12px;
}
.banner-error {
  color: #ffb4a2;
}

.banner-status {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 110px;
}

.status-pill {
  display: inline-block;
  padding: 2px 10px;
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.08em;
  background: var(--accent-gold);
  color: var(--accent-deep);
  border-radius: var(--radius-sm);
  width: fit-content;
}

.banner-date {
  font-size: 11px;
  opacity: 0.7;
}

.banner-matchup {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-5);
}

.team {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 0;
}
.team-left {
  align-items: flex-end;
  text-align: right;
}
.team-right {
  align-items: flex-start;
  text-align: left;
}
.team-flag {
  font-size: 28px;
  line-height: 1;
  margin-bottom: 2px;
}
.team-name {
  font-family: var(--font-serif-cn);
  font-size: 17px;
  font-weight: 700;
  letter-spacing: 0.04em;
  color: var(--bg-parchment);
}
.team-name-en {
  font-size: 10px;
  opacity: 0.6;
  letter-spacing: 0.06em;
}

.vs-block {
  display: flex;
  align-items: center;
  justify-content: center;
}
.vs-text {
  font-family: var(--font-title);
  font-size: 22px;
  font-weight: 900;
  letter-spacing: 0.1em;
  color: var(--accent-gold);
  padding: 0 10px;
  border-left: 1px solid var(--accent-gold);
  border-right: 1px solid var(--accent-gold);
}

.banner-meta {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 240px;
  max-width: 360px;
  padding-left: var(--space-4);
  border-left: 1px dashed rgba(212, 160, 23, 0.4);
}
.meta-block {
  display: flex;
  gap: 10px;
  font-size: 11px;
  align-items: baseline;
  min-width: 0;
}
.meta-label {
  color: var(--accent-gold);
  letter-spacing: 0.06em;
  flex-shrink: 0;
  white-space: nowrap;
  text-align: right;
  /* width 自适应，最长用例 Asia/Shanghai 也不挤压 value */
}
.meta-value {
  opacity: 0.92;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.banner-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.banner-actions .nat-btn {
  font-size: 11px;
  padding: 6px 12px;
  min-width: 120px;
  justify-content: center;
}

@media (max-width: 900px) {
  .banner-inner {
    grid-template-columns: 1fr;
    gap: var(--space-3);
  }
  .banner-meta {
    border-left: none;
    padding-left: 0;
    border-top: 1px dashed rgba(212, 160, 23, 0.4);
    padding-top: var(--space-2);
  }
  .banner-actions {
    flex-direction: row;
  }
}
</style>
