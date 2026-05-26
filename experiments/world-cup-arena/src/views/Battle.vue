<script setup lang="ts">
/**
 * 对战界面: /battle?matchId=xxx&side=a|b
 *
 * 顶部 banner：双方国旗 + 回合 X/5 + 累计比分
 * 中部：AI 手牌（背面缩略） + 出牌区 + 我手牌（正面可选）
 * 选牌 → 高亮 → "出牌" → "裁判沉思中…" → 显示双方卡 + 评分 + 金句
 * 5 回合结束后跳 /battle/result/:id
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { loadSchedule, type MatchView } from '@/services/scheduleService';
import { useBattleStore } from '@/stores/battle';
import { useSettingsStore } from '@/stores/settings';
import CulturalCard from '@/components/CulturalCard.vue';

const route = useRoute();
const router = useRouter();
const battle = useBattleStore();
const settings = useSettingsStore();

const initializing = ref(true);
const initError = ref<string | null>(null);
const selectedCardId = ref<string | null>(null);

const matchId = String(route.query.matchId || '');
const side = (route.query.side as 'a' | 'b') || 'a';

onMounted(async () => {
  if (!matchId) {
    router.replace('/match-picker');
    return;
  }
  try {
    const all = await loadSchedule();
    const match: MatchView | undefined = all.find((m) => m.id === matchId);
    if (!match) {
      initError.value = `找不到赛程 ${matchId}`;
      return;
    }
    battle.reset();
    battle.start(match, side, settings.state.contentLevel);
  } catch (e: any) {
    initError.value = e?.message || '初始化失败';
  } finally {
    initializing.value = false;
  }
});

const state = computed(() => battle.state);
const judging = computed(() => battle.judging);

// 沉思计时（让用户知道 LLM 还在思考，不是卡死）
const judgingElapsedMs = ref(0);
let judgingTimer: number | null = null;
watch(judging, (nowJudging) => {
  if (nowJudging) {
    judgingElapsedMs.value = 0;
    const start = performance.now();
    judgingTimer = window.setInterval(() => {
      judgingElapsedMs.value = performance.now() - start;
    }, 200);
  } else {
    if (judgingTimer != null) {
      clearInterval(judgingTimer);
      judgingTimer = null;
    }
  }
});
const judgingElapsedSec = computed(() => (judgingElapsedMs.value / 1000).toFixed(1));
const judgingTimeoutSec = computed(() =>
  Math.round((settings.state.refereeTimeoutMs ?? 120000) / 1000)
);

const playerHand = computed(() => {
  if (!state.value) return [];
  return state.value.playerSide === 'a' ? state.value.aHand : state.value.bHand;
});
const aiHand = computed(() => {
  if (!state.value) return [];
  return state.value.playerSide === 'a' ? state.value.bHand : state.value.aHand;
});

const lastRound = computed(() => {
  if (!state.value || state.value.rounds.length === 0) return null;
  return state.value.rounds[state.value.rounds.length - 1];
});

const playerSideKey = computed(() => state.value?.playerSide || 'a');
const playerCountry = computed(() =>
  state.value ? (playerSideKey.value === 'a' ? state.value.aCountry : state.value.bCountry) : null
);
const aiCountry = computed(() =>
  state.value ? (playerSideKey.value === 'a' ? state.value.bCountry : state.value.aCountry) : null
);

function selectCard(cardId: string) {
  if (judging.value) return;
  selectedCardId.value = cardId;
}

async function playSelected() {
  if (!selectedCardId.value || judging.value) return;
  const cid = selectedCardId.value;
  selectedCardId.value = null;
  await battle.play(cid);
  // 5 回合打完 → 自动结算 → 跳结果页
  if (state.value && state.value.currentRound >= 5) {
    try {
      const finalState = await battle.finish();
      const id = finalState.savedBattleId;
      router.push(id ? `/battle/result/${id}` : '/match-picker');
    } catch (e) {
      console.error('结算失败', e);
    }
  }
}

function backToPicker() {
  if (state.value && state.value.currentRound > 0 && state.value.status !== 'finished') {
    if (!confirm('放弃当前对战？进度不会保存。')) return;
  }
  battle.reset();
  router.push('/match-picker');
}

// 切换路由参数时重置
watch(
  () => [route.query.matchId, route.query.side],
  () => {
    selectedCardId.value = null;
  }
);
</script>

<template>
  <div class="battle-page">
    <div v-if="initializing" class="loading mono">初始化对战…</div>
    <div v-else-if="initError" class="error mono">
      ⚠ {{ initError }}
      <button class="nat-btn" @click="router.push('/match-picker')">返回选场次</button>
    </div>

    <template v-else-if="state">
      <!-- 顶部 banner -->
      <header class="battle-banner">
        <button class="back-btn mono" @click="backToPicker">← 退出</button>

        <div class="banner-teams">
          <div class="team team-a" :class="{ 'is-player': state.playerSide === 'a' }">
            <span class="team-flag">{{ state.aCountry.flag }}</span>
            <span class="team-name title-cn">{{ state.aCountry.nameZh }}</span>
            <span class="team-tag mono">{{ state.playerSide === 'a' ? '你' : 'AI' }}</span>
          </div>
          <div class="scoreboard">
            <span class="score-num">{{ state.aWins }}</span>
            <span class="score-sep">:</span>
            <span class="score-num">{{ state.bWins }}</span>
          </div>
          <div class="team team-b" :class="{ 'is-player': state.playerSide === 'b' }">
            <span class="team-flag">{{ state.bCountry.flag }}</span>
            <span class="team-name title-cn">{{ state.bCountry.nameZh }}</span>
            <span class="team-tag mono">{{ state.playerSide === 'b' ? '你' : 'AI' }}</span>
          </div>
        </div>

        <div class="round-indicator mono">
          回合 {{ Math.min(state.currentRound + 1, 5) }} / 5
        </div>
      </header>

      <!-- 中部：AI 手牌（背面） -->
      <section class="ai-hand-zone">
        <div class="zone-label mono">{{ aiCountry?.nameZh }} 手牌（{{ aiHand.length }}）</div>
        <div class="ai-hand">
          <CulturalCard
            v-for="card in aiHand"
            :key="card.id"
            :card="card"
            :face-up="false"
            compact
          />
        </div>
      </section>

      <!-- 出牌区（上回合结果） -->
      <section class="play-zone" :class="{ 'is-judging': judging }">
        <div v-if="judging" class="judging-indicator mono">
          📜 裁判沉思中…
          <span class="judging-timer">{{ judgingElapsedSec }}s / {{ judgingTimeoutSec }}s</span>
          <span class="judging-hint">
            本地模型首次推理较慢，超时可在 /settings 调大
          </span>
        </div>
        <div v-else-if="lastRound" class="last-round-result">
          <div class="round-cards">
            <div class="round-card-wrap">
              <CulturalCard :card="lastRound.aCard" />
              <div class="round-score" :class="{ 'is-winner': lastRound.aScore > lastRound.bScore }">
                {{ lastRound.aScore }}
              </div>
            </div>
            <div class="round-verdict-block">
              <div class="matchup-pill mono" :class="`matchup-${lastRound.matchup}`">
                {{
                  lastRound.matchup === 'buff'
                    ? 'A 克 B'
                    : lastRound.matchup === 'debuff'
                      ? 'B 克 A'
                      : '中立'
                }}
              </div>
              <p class="verdict-text title-cn">{{ lastRound.verdict }}</p>
              <p class="fun-fact">💡 {{ lastRound.funFact }}</p>
              <p v-if="lastRound.fallback" class="fallback-note mono">
                （裁判离线，按属性计算）
              </p>
            </div>
            <div class="round-card-wrap">
              <CulturalCard :card="lastRound.bCard" />
              <div class="round-score" :class="{ 'is-winner': lastRound.bScore > lastRound.aScore }">
                {{ lastRound.bScore }}
              </div>
            </div>
          </div>
        </div>
        <div v-else class="play-zone-empty mono">
          从你的手牌里选一张，按 "出牌"
        </div>
      </section>

      <!-- 玩家手牌 -->
      <section class="player-hand-zone">
        <div class="zone-label mono">
          {{ playerCountry?.nameZh }} 手牌（{{ playerHand.length }}）
        </div>
        <div class="player-hand">
          <CulturalCard
            v-for="card in playerHand"
            :key="card.id"
            :card="card"
            selectable
            :selected="selectedCardId === card.id"
            @click="selectCard(card.id)"
          />
        </div>
        <div class="play-actions">
          <button
            class="nat-btn nat-btn-gold play-btn"
            :disabled="!selectedCardId || judging"
            @click="playSelected"
          >
            ⚔ 出牌
          </button>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.battle-page {
  max-width: 1280px;
  margin: 0 auto;
  padding: var(--space-4) var(--space-5) var(--space-7);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.loading,
.error {
  text-align: center;
  padding: var(--space-7) 0;
  color: var(--text-tertiary);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  align-items: center;
}
.error {
  color: var(--text-error);
}

.battle-banner {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: var(--space-4);
  padding: var(--space-3) var(--space-4);
  background: linear-gradient(
    180deg,
    rgba(26, 26, 46, 0.95) 0%,
    rgba(26, 26, 46, 0.82) 100%
  );
  color: var(--text-on-deep);
  border: 1px solid var(--accent-gold);
  border-radius: var(--radius-md);
  align-items: center;
}
.back-btn {
  background: transparent;
  border: 1px solid var(--accent-gold);
  color: var(--accent-gold);
  padding: 6px 12px;
  border-radius: 2px;
  font-size: 11px;
  cursor: pointer;
}
.back-btn:hover {
  background: var(--accent-gold);
  color: var(--accent-deep);
}

.banner-teams {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: var(--space-4);
}
.team {
  display: flex;
  align-items: center;
  gap: 10px;
}
.team-a {
  justify-content: flex-end;
}
.team-b {
  justify-content: flex-start;
}
.team-flag {
  font-size: 32px;
  line-height: 1;
}
.team-name {
  font-size: 17px;
  color: var(--bg-parchment);
}
.team-tag {
  font-size: 10px;
  padding: 2px 6px;
  background: var(--accent-gold);
  color: var(--accent-deep);
  border-radius: 2px;
  letter-spacing: 0.05em;
}
.team.is-player .team-tag {
  background: var(--accent-blood);
  color: var(--bg-parchment);
}

.scoreboard {
  display: flex;
  align-items: center;
  gap: 12px;
  font-family: var(--font-title);
}
.score-num {
  font-size: 38px;
  font-weight: 900;
  color: var(--accent-gold);
  min-width: 36px;
  text-align: center;
}
.score-sep {
  font-size: 28px;
  color: var(--accent-gold);
  opacity: 0.6;
}

.round-indicator {
  background: var(--accent-gold);
  color: var(--accent-deep);
  padding: 4px 12px;
  border-radius: 2px;
  font-size: 12px;
  letter-spacing: 0.1em;
}

/* AI 手牌区 */
.ai-hand-zone,
.player-hand-zone {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.zone-label {
  font-size: 11px;
  letter-spacing: 0.08em;
  color: var(--text-secondary);
  text-transform: uppercase;
}
.ai-hand,
.player-hand {
  display: flex;
  gap: var(--space-3);
  flex-wrap: wrap;
  justify-content: center;
}

/* 出牌区 */
.play-zone {
  min-height: 220px;
  padding: var(--space-4);
  background: rgba(244, 232, 208, 0.5);
  border: 1px dashed var(--accent-gold);
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
}
.play-zone.is-judging {
  background: rgba(212, 160, 23, 0.1);
}
.judging-indicator {
  font-size: 18px;
  color: var(--accent-deep);
  letter-spacing: 0.15em;
  animation: pulse 1.4s ease-in-out infinite;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}
.judging-timer {
  font-size: 12px;
  color: var(--accent-gold);
  letter-spacing: 0.08em;
  animation: none;
}
.judging-hint {
  font-size: 10px;
  color: var(--text-tertiary);
  letter-spacing: 0.04em;
  animation: none;
}
@keyframes pulse {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 1; }
}
.play-zone-empty {
  color: var(--text-tertiary);
  font-size: 13px;
}

.last-round-result {
  width: 100%;
}
.round-cards {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: var(--space-4);
  align-items: start;
}
@media (max-width: 900px) {
  .round-cards {
    grid-template-columns: 1fr;
  }
}
.round-card-wrap {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.round-score {
  background: var(--accent-deep);
  color: var(--bg-parchment);
  font-family: var(--font-title);
  font-size: 22px;
  padding: 4px 16px;
  border-radius: 2px;
  font-weight: 900;
}
.round-score.is-winner {
  background: var(--accent-gold);
  color: var(--accent-deep);
  box-shadow: 0 0 12px rgba(212, 160, 23, 0.5);
}

.round-verdict-block {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  padding: var(--space-3);
  background: var(--bg-parchment);
  border: 1px solid var(--accent-gold);
  border-radius: var(--radius-sm);
}
.matchup-pill {
  align-self: flex-start;
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 2px;
  letter-spacing: 0.08em;
}
.matchup-pill.matchup-buff {
  background: var(--accent-gold);
  color: var(--accent-deep);
}
.matchup-pill.matchup-debuff {
  background: var(--accent-blood);
  color: var(--bg-parchment);
}
.matchup-pill.matchup-neutral {
  background: var(--text-tertiary);
  color: var(--bg-parchment);
}
.verdict-text {
  font-size: 15px;
  color: var(--accent-deep);
  line-height: 1.6;
}
.fun-fact {
  font-family: var(--font-serif-cn);
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.6;
  padding: var(--space-2);
  background: rgba(212, 160, 23, 0.08);
  border-left: 2px solid var(--accent-gold);
}
.fallback-note {
  font-size: 10px;
  color: var(--text-tertiary);
  font-style: italic;
}

.play-actions {
  display: flex;
  justify-content: center;
  margin-top: var(--space-2);
}
.play-btn {
  min-width: 180px;
  font-size: 14px;
  padding: 12px 24px;
}
</style>
