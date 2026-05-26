<script setup lang="ts">
/**
 * AI vs AI 观战模式：/spectator?matchId=xxx
 *
 * 行为：
 * - 选定一场比赛，AI 全程出牌（playerSide='a' 仅作为 engine 占位），慢节奏自动跑 5 回合
 * - 每回合：随机出一张 → 调 LLM 评分 → 展示 4 秒（卡 + 评分 + 金句） → 进入下一回合
 * - 5 回合后自动 finalize（写入 Dexie + 落 verdicts，作为金句墙素材）
 * - 控制：⏸ 暂停 / ▶ 继续 / ⏭ 跳过当前等待 / ⏹ 退出
 * - 不打 matchId：默认选最近一场即将开始的比赛
 */
import { computed, onBeforeUnmount, onMounted, ref, h, defineComponent } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  loadSchedule,
  getUpcomingMatches,
  type MatchView,
} from '@/services/scheduleService';
import {
  initBattle,
  playRound,
  finalizeBattle,
  type BattleState,
} from '@/services/battleEngine';
import { useSettingsStore } from '@/stores/settings';
import CulturalCard from '@/components/CulturalCard.vue';

// 内联：维度条形图（复用 Battle.vue 风格，简化版）
const DimBar = defineComponent({
  props: { value: { type: Number, required: true } },
  setup(props) {
    return () =>
      h('div', { class: 'sp-dim-bar' }, [
        h('div', {
          class: 'sp-dim-bar-fill',
          style: { width: Math.min(100, (props.value / 25) * 100) + '%' },
        }),
        h('span', { class: 'sp-dim-bar-text' }, props.value),
      ]);
  },
});

const route = useRoute();
const router = useRouter();
const settings = useSettingsStore();

const loading = ref(true);
const initError = ref<string | null>(null);

const state = ref<BattleState | null>(null);
const judging = ref(false);
const paused = ref(false);
/** 自动播放节奏：每回合判分完成后停 4 秒，再进入下一回合 */
const PAUSE_BETWEEN_MS = 4000;
let pauseTimer: number | null = null;
let waitResolver: (() => void) | null = null;
const finishingRef = ref(false);
const exited = ref(false);

const elapsedMs = ref(0);
let judgingTimer: number | null = null;

/** 候选场次（无 matchId 时用第一场即将开始的） */
async function resolveMatch(): Promise<MatchView | null> {
  const all = await loadSchedule();
  const matchId = String(route.query.matchId || '');
  if (matchId) {
    return all.find((m) => m.id === matchId) || null;
  }
  // 默认：最近一场即将开始（含进行中）
  const upcoming = getUpcomingMatches(all, 1);
  return upcoming[0] || null;
}

/** 等待 ms 毫秒，可被 togglePause / skip / exit 提前唤醒 */
function waitWithControls(ms: number): Promise<void> {
  return new Promise((resolve) => {
    waitResolver = () => {
      if (pauseTimer != null) {
        clearTimeout(pauseTimer);
        pauseTimer = null;
      }
      waitResolver = null;
      resolve();
    };
    pauseTimer = window.setTimeout(() => {
      waitResolver?.();
    }, ms);
  });
}

/** 用于"暂停"时把当前 timer 取消（不 resolve），等"继续"重新启动一遍循环 */
function cancelWait() {
  if (pauseTimer != null) {
    clearTimeout(pauseTimer);
    pauseTimer = null;
  }
  waitResolver = null;
}

/** 让暂停的循环醒过来，让等待立即结束 */
function skipWait() {
  if (waitResolver) waitResolver();
}

/** AI 自动出一张牌：从对应 side 的手牌里随机选 id */
function aiPickId(state: BattleState, side: 'a' | 'b'): string | null {
  const hand = side === 'a' ? state.aHand : state.bHand;
  if (!hand.length) return null;
  return hand[Math.floor(Math.random() * hand.length)].id;
}

async function runLoop() {
  if (!state.value) return;
  // 每回合：A 出牌 → playRound 内部 AI 出 B → 评分 → 等待 → 进入下一回合
  while (state.value && state.value.currentRound < 5 && !exited.value) {
    // 暂停时挂起，直到 togglePause 把 paused 设为 false 后续 loop 继续
    while (paused.value && !exited.value) {
      await new Promise((r) => setTimeout(r, 200));
    }
    if (exited.value) break;

    // playerSide 是 'a'，所以"玩家出牌"= A 出，playRound 内部 AI 随机出 B
    const playerCardId = aiPickId(state.value, 'a');
    if (!playerCardId) break;

    judging.value = true;
    elapsedMs.value = 0;
    const judgeStart = performance.now();
    judgingTimer = window.setInterval(() => {
      elapsedMs.value = performance.now() - judgeStart;
    }, 200);

    try {
      const { state: next } = await playRound(state.value, playerCardId);
      state.value = { ...next };
    } catch (e) {
      console.error('[spectator] playRound 出错', e);
    } finally {
      judging.value = false;
      if (judgingTimer != null) {
        clearInterval(judgingTimer);
        judgingTimer = null;
      }
    }

    if (exited.value) break;

    // 慢节奏：展示 4 秒
    if (state.value && state.value.currentRound < 5) {
      await waitWithControls(PAUSE_BETWEEN_MS);
    }
  }

  // 5 回合跑完 → finalize（落 Dexie + verdicts 表，金句墙就有素材）
  if (state.value && state.value.currentRound >= 5 && !exited.value && !finishingRef.value) {
    finishingRef.value = true;
    try {
      const final = await finalizeBattle(state.value);
      state.value = { ...final };
    } catch (e) {
      console.error('[spectator] finalize 失败', e);
    } finally {
      finishingRef.value = false;
    }
  }
}

async function bootstrap() {
  loading.value = true;
  try {
    const match = await resolveMatch();
    if (!match) {
      initError.value = '找不到可观战的赛程，去 /match-picker 看看吧';
      return;
    }
    if (!match.team1 || !match.team2) {
      initError.value = `赛程国家映射缺失：${match.team1Name} vs ${match.team2Name}`;
      return;
    }
    const s = initBattle(match, 'a', settings.state.contentLevel);
    state.value = s;
  } catch (e: any) {
    initError.value = e?.message || '观战初始化失败';
  } finally {
    loading.value = false;
  }
  if (state.value) {
    runLoop();
  }
}

function togglePause() {
  paused.value = !paused.value;
  if (paused.value) {
    // 取消当前正在 wait 的 timer（避免到点强行进入下回合）
    cancelWait();
  }
}

function skipNow() {
  // 立即结束当前等待（继续下一回合）
  skipWait();
}

function exitSpectator() {
  if (state.value && state.value.currentRound > 0 && state.value.status !== 'finished') {
    if (!confirm('退出观战？已经评分的回合金句已经保存。')) return;
  }
  exited.value = true;
  cancelWait();
  if (judgingTimer != null) {
    clearInterval(judgingTimer);
    judgingTimer = null;
  }
  router.push('/match-picker');
}

onBeforeUnmount(() => {
  exited.value = true;
  cancelWait();
  if (judgingTimer != null) clearInterval(judgingTimer);
});

onMounted(bootstrap);

const lastRound = computed(() => {
  if (!state.value || state.value.rounds.length === 0) return null;
  return state.value.rounds[state.value.rounds.length - 1];
});
const elapsedSec = computed(() => (elapsedMs.value / 1000).toFixed(1));
const timeoutSec = computed(() =>
  Math.round((settings.state.refereeTimeoutMs ?? 120000) / 1000)
);

const isFinished = computed(() => state.value?.status === 'finished');
const winnerLabel = computed(() => {
  const s = state.value;
  if (!s || !isFinished.value) return '';
  if (s.winner === 'a') return `${s.aCountry.nameZh} 胜`;
  if (s.winner === 'b') return `${s.bCountry.nameZh} 胜`;
  return '平局';
});
</script>

<template>
  <div class="spectator-page">
    <div v-if="loading" class="sp-loading mono">加载赛程…</div>
    <div v-else-if="initError" class="sp-error mono">
      ⚠ {{ initError }}
      <button class="nat-btn" @click="router.push('/match-picker')">去选场次</button>
    </div>

    <template v-else-if="state">
      <!-- 顶部 banner -->
      <header class="sp-banner">
        <div class="sp-teams">
          <div class="sp-team sp-team-a">
            <span class="sp-flag">{{ state.aCountry.flag }}</span>
            <span class="sp-team-name title-cn">{{ state.aCountry.nameZh }}</span>
            <span class="sp-tag mono">AI</span>
          </div>
          <div class="sp-scoreboard">
            <span class="sp-num">{{ state.aWins }}</span>
            <span class="sp-sep">:</span>
            <span class="sp-num">{{ state.bWins }}</span>
          </div>
          <div class="sp-team sp-team-b">
            <span class="sp-flag">{{ state.bCountry.flag }}</span>
            <span class="sp-team-name title-cn">{{ state.bCountry.nameZh }}</span>
            <span class="sp-tag mono">AI</span>
          </div>
        </div>

        <div class="sp-meta mono">
          <span class="sp-round">回合 {{ Math.min(state.currentRound + 1, 5) }} / 5</span>
          <span v-if="state.match.group" class="sp-group">{{ state.match.group }}</span>
          <span class="sp-date">{{ state.match.date }}</span>
        </div>

        <div class="sp-controls">
          <button class="sp-ctrl" :disabled="isFinished" @click="togglePause">
            {{ paused ? '▶ 继续' : '⏸ 暂停' }}
          </button>
          <button class="sp-ctrl" :disabled="isFinished || judging" @click="skipNow">
            ⏭ 跳过这回合等待
          </button>
          <button class="sp-ctrl sp-ctrl-exit" @click="exitSpectator">⏹ 退出</button>
        </div>
      </header>

      <!-- 中部：当前回合 -->
      <section class="sp-stage" :class="{ 'is-judging': judging }">
        <div v-if="judging" class="sp-judging mono">
          🧑‍⚖️ 裁判沉思中…
          <span class="sp-timer">{{ elapsedSec }}s / {{ timeoutSec }}s</span>
        </div>
        <div v-else-if="lastRound" class="sp-round-block">
          <div class="sp-round-cards">
            <div class="sp-card-wrap">
              <CulturalCard :card="lastRound.aCard" />
              <div
                class="sp-score"
                :class="{ 'is-winner': lastRound.aScore > lastRound.bScore }"
              >
                {{ lastRound.aScore }}
              </div>
            </div>

            <div class="sp-verdict-block">
              <div class="sp-matchup mono" :class="`matchup-${lastRound.matchup}`">
                {{
                  lastRound.matchup === 'buff'
                    ? 'A 克 B'
                    : lastRound.matchup === 'debuff'
                      ? 'B 克 A'
                      : '中立'
                }}
              </div>
              <p class="sp-verdict title-cn">{{ lastRound.verdict }}</p>
              <p class="sp-funfact">💡 {{ lastRound.funFact }}</p>
              <p v-if="lastRound.reasoning" class="sp-reasoning title-cn">
                🔍 {{ lastRound.reasoning }}
              </p>
              <p v-if="lastRound.fallback" class="sp-fallback mono">
                （裁判离线，按属性计算）
              </p>

              <div
                v-if="lastRound.aDims && lastRound.bDims"
                class="sp-dims"
              >
                <div class="sp-dim-row">
                  <span class="sp-dim-side sp-dim-a mono">A</span>
                  <DimBar :value="lastRound.aDims.hist" />
                  <DimBar :value="lastRound.aDims.art" />
                  <DimBar :value="lastRound.aDims.infl" />
                  <DimBar :value="lastRound.aDims.uniq" />
                </div>
                <div class="sp-dim-row">
                  <span class="sp-dim-side sp-dim-b mono">B</span>
                  <DimBar :value="lastRound.bDims.hist" />
                  <DimBar :value="lastRound.bDims.art" />
                  <DimBar :value="lastRound.bDims.infl" />
                  <DimBar :value="lastRound.bDims.uniq" />
                </div>
                <div class="sp-dim-legend mono">
                  历史 · 艺术 · 影响 · 独特（各 0-25）
                </div>
              </div>
            </div>

            <div class="sp-card-wrap">
              <CulturalCard :card="lastRound.bCard" />
              <div
                class="sp-score"
                :class="{ 'is-winner': lastRound.bScore > lastRound.aScore }"
              >
                {{ lastRound.bScore }}
              </div>
            </div>
          </div>
        </div>
        <div v-else class="sp-waiting mono">
          准备开战…
        </div>
      </section>

      <!-- 完赛总结 -->
      <section v-if="isFinished" class="sp-summary">
        <h2 class="title-natgeo sp-summary-title">{{ winnerLabel }}</h2>
        <div class="sp-summary-actions">
          <button
            v-if="state.savedBattleId"
            class="nat-btn nat-btn-gold"
            @click="router.push(`/battle/result/${state.savedBattleId}`)"
          >
            看完整对战回放
          </button>
          <button class="nat-btn" @click="router.push('/wall')">去金句墙</button>
          <button class="nat-btn" @click="router.push('/match-picker')">再观战一场</button>
        </div>
      </section>

      <!-- 已完成回合缩略时间线 -->
      <section v-if="state.rounds.length > 0" class="sp-timeline">
        <div class="sp-timeline-label mono">回合时间线</div>
        <ol class="sp-timeline-list">
          <li
            v-for="(r, i) in state.rounds"
            :key="i"
            class="sp-timeline-item mono"
            :class="{
              'is-a': r.aScore > r.bScore,
              'is-b': r.bScore > r.aScore,
              'is-draw': r.aScore === r.bScore,
            }"
          >
            <span class="sp-tl-idx">R{{ i + 1 }}</span>
            <span class="sp-tl-cards">
              {{ r.aCard.name }} <span class="sp-vs">vs</span> {{ r.bCard.name }}
            </span>
            <span class="sp-tl-score">{{ r.aScore }} : {{ r.bScore }}</span>
          </li>
        </ol>
      </section>
    </template>
  </div>
</template>

<style scoped>
.spectator-page {
  max-width: 1180px;
  margin: 0 auto;
  padding: var(--space-4) var(--space-5) var(--space-7);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.sp-loading,
.sp-error {
  text-align: center;
  padding: var(--space-7) 0;
  color: var(--text-tertiary);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  align-items: center;
}
.sp-error { color: var(--text-error); }

/* 顶部 banner */
.sp-banner {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  background: linear-gradient(
    180deg,
    rgba(26, 26, 46, 0.96) 0%,
    rgba(26, 26, 46, 0.82) 100%
  );
  color: var(--text-on-deep);
  border: 1px solid var(--accent-gold);
  border-radius: var(--radius-md);
}
.sp-teams {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: var(--space-4);
  align-items: center;
}
.sp-team {
  display: flex;
  align-items: center;
  gap: 10px;
}
.sp-team-a { justify-content: flex-end; }
.sp-team-b { justify-content: flex-start; }
.sp-flag { font-size: 32px; line-height: 1; }
.sp-team-name { font-size: 17px; color: var(--bg-parchment); }
.sp-tag {
  font-size: 10px;
  padding: 2px 6px;
  background: var(--accent-gold);
  color: var(--accent-deep);
  border-radius: 2px;
  letter-spacing: 0.05em;
}
.sp-scoreboard {
  display: flex;
  align-items: center;
  gap: 12px;
  font-family: var(--font-title);
}
.sp-num {
  font-size: 38px;
  font-weight: 900;
  color: var(--accent-gold);
  min-width: 36px;
  text-align: center;
}
.sp-sep { font-size: 28px; color: var(--accent-gold); opacity: 0.6; }

.sp-meta {
  display: flex;
  gap: var(--space-3);
  justify-content: center;
  font-size: 11px;
  letter-spacing: 0.08em;
  color: var(--text-on-deep);
  opacity: 0.85;
}
.sp-round {
  background: var(--accent-gold);
  color: var(--accent-deep);
  padding: 2px 10px;
  border-radius: 2px;
}

.sp-controls {
  display: flex;
  gap: 8px;
  justify-content: center;
}
.sp-ctrl {
  background: transparent;
  border: 1px solid var(--accent-gold);
  color: var(--accent-gold);
  padding: 4px 12px;
  border-radius: 2px;
  font-size: 11px;
  letter-spacing: 0.08em;
  cursor: pointer;
  font-family: var(--font-mono);
}
.sp-ctrl:hover:not(:disabled) {
  background: var(--accent-gold);
  color: var(--accent-deep);
}
.sp-ctrl:disabled { opacity: 0.4; cursor: not-allowed; }
.sp-ctrl-exit {
  border-color: var(--accent-blood);
  color: var(--accent-blood);
}
.sp-ctrl-exit:hover {
  background: var(--accent-blood);
  color: var(--bg-parchment);
}

/* 主舞台 */
.sp-stage {
  min-height: 280px;
  padding: var(--space-4);
  background: rgba(244, 232, 208, 0.5);
  border: 1px dashed var(--accent-gold);
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
}
.sp-stage.is-judging {
  background: rgba(212, 160, 23, 0.1);
}
.sp-judging {
  font-size: 18px;
  color: var(--accent-deep);
  letter-spacing: 0.15em;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  animation: pulse 1.4s ease-in-out infinite;
}
.sp-timer {
  font-size: 12px;
  color: var(--accent-gold);
  letter-spacing: 0.08em;
  animation: none;
}
@keyframes pulse {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 1; }
}
.sp-waiting {
  color: var(--text-tertiary);
  font-size: 13px;
}

.sp-round-block { width: 100%; }
.sp-round-cards {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: var(--space-4);
  align-items: start;
}
@media (max-width: 900px) {
  .sp-round-cards { grid-template-columns: 1fr; }
}
.sp-card-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.sp-score {
  background: var(--accent-deep);
  color: var(--bg-parchment);
  font-family: var(--font-title);
  font-size: 22px;
  padding: 4px 16px;
  border-radius: 2px;
  font-weight: 900;
}
.sp-score.is-winner {
  background: var(--accent-gold);
  color: var(--accent-deep);
  box-shadow: 0 0 12px rgba(212, 160, 23, 0.5);
}

.sp-verdict-block {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3);
  background: var(--bg-parchment);
  border: 1px solid var(--accent-gold);
  border-radius: var(--radius-sm);
}
.sp-matchup {
  align-self: flex-start;
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 2px;
  letter-spacing: 0.08em;
}
.sp-matchup.matchup-buff {
  background: var(--accent-gold);
  color: var(--accent-deep);
}
.sp-matchup.matchup-debuff {
  background: var(--accent-blood);
  color: var(--bg-parchment);
}
.sp-matchup.matchup-neutral {
  background: var(--text-tertiary);
  color: var(--bg-parchment);
}
.sp-verdict {
  font-size: 15px;
  color: var(--accent-deep);
  line-height: 1.6;
  font-family: var(--font-serif-cn);
}
.sp-funfact {
  font-family: var(--font-serif-cn);
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.6;
  padding: 6px 10px;
  background: rgba(212, 160, 23, 0.08);
  border-left: 2px solid var(--accent-gold);
}
.sp-reasoning {
  font-family: var(--font-serif-cn);
  font-size: 12px;
  color: var(--text-primary);
  line-height: 1.6;
  margin: 0;
  padding: 6px 10px;
  background: rgba(26, 26, 46, 0.04);
  border-left: 2px solid var(--accent-deep);
}
.sp-fallback {
  font-size: 10px;
  color: var(--text-tertiary);
  font-style: italic;
}

.sp-dims {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.sp-dim-row {
  display: grid;
  grid-template-columns: 22px repeat(4, 1fr);
  gap: 4px;
  align-items: center;
}
.sp-dim-side {
  text-align: center;
  font-weight: 700;
  font-size: 10px;
  color: var(--bg-parchment);
  padding: 1px 4px;
  border-radius: 2px;
}
.sp-dim-a { background: var(--accent-deep); }
.sp-dim-b { background: var(--accent-gold); color: var(--accent-deep); }
.sp-dim-bar {
  position: relative;
  height: 12px;
  background: rgba(42, 36, 25, 0.1);
  border-radius: 2px;
  overflow: hidden;
}
.sp-dim-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--accent-gold), #d4a017aa);
  transition: width 0.4s ease;
}
.sp-dim-bar-text {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  color: var(--accent-deep);
  font-weight: 700;
}
.sp-dim-legend {
  font-size: 9px;
  color: var(--text-tertiary);
  text-align: right;
  letter-spacing: 0.04em;
}

/* 总结 */
.sp-summary {
  padding: var(--space-4);
  background: rgba(26, 26, 46, 0.9);
  border: 1px solid var(--accent-gold);
  border-radius: var(--radius-md);
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.sp-summary-title {
  font-size: 28px;
  color: var(--accent-gold);
}
.sp-summary-actions {
  display: flex;
  justify-content: center;
  gap: var(--space-3);
  flex-wrap: wrap;
}

/* 时间线 */
.sp-timeline {
  padding: var(--space-3) var(--space-4);
  background: rgba(244, 232, 208, 0.55);
  border: 1px solid var(--border-thin);
  border-radius: var(--radius-md);
}
.sp-timeline-label {
  font-size: 11px;
  color: var(--text-tertiary);
  letter-spacing: 0.08em;
  margin-bottom: var(--space-2);
}
.sp-timeline-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.sp-timeline-item {
  display: grid;
  grid-template-columns: 32px 1fr auto;
  gap: var(--space-3);
  font-size: 11px;
  padding: 4px 8px;
  border-left: 3px solid var(--text-tertiary);
  align-items: center;
  background: rgba(255, 255, 255, 0.4);
}
.sp-timeline-item.is-a { border-left-color: var(--accent-deep); }
.sp-timeline-item.is-b { border-left-color: var(--accent-gold); }
.sp-timeline-item.is-draw { border-left-color: var(--text-tertiary); }
.sp-tl-idx {
  color: var(--accent-gold);
  font-weight: 700;
  letter-spacing: 0.08em;
}
.sp-tl-cards {
  color: var(--text-primary);
  font-family: var(--font-serif-cn);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sp-vs {
  color: var(--text-tertiary);
  margin: 0 4px;
}
.sp-tl-score {
  color: var(--accent-deep);
  font-weight: 700;
}
</style>
