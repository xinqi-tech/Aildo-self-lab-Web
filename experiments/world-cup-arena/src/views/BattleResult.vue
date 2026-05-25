<script setup lang="ts">
/**
 * 对战结果页: /battle/result/:id
 *
 * 大字胜/负/平 + 5 回合 LLM 总分
 * 5 条裁判金句列表
 * 默认勾选 "保存到金句墙"（实际数据已写入 Dexie verdicts 表，这里只是 UI 提示）
 * 再来一局 / 回主地图
 */
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { getBattle, db, type SavedBattle } from '@/services/db';
import { COUNTRY_BY_ISO3 } from '@/data/countries';
import { LEVEL_LABELS, type CardLevel } from '@/data/cards/types';

const route = useRoute();
const router = useRouter();
const battle = ref<SavedBattle | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);

// 默认勾选"保存到金句墙"——勾掉则从 verdicts 表删除本局金句
const saveToWall = ref(true);

onMounted(async () => {
  const idParam = Number(route.params.id);
  if (!Number.isFinite(idParam)) {
    error.value = '路径参数缺失';
    loading.value = false;
    return;
  }
  try {
    const b = await getBattle(idParam);
    if (!b) {
      error.value = `找不到对局 ${idParam}`;
    } else {
      battle.value = b;
    }
  } catch (e: any) {
    error.value = e?.message || '加载对局失败';
  } finally {
    loading.value = false;
  }
});

const aCountry = computed(() =>
  battle.value ? COUNTRY_BY_ISO3[battle.value.aIso3] : undefined
);
const bCountry = computed(() =>
  battle.value ? COUNTRY_BY_ISO3[battle.value.bIso3] : undefined
);

const playerWon = computed(() => {
  if (!battle.value) return null;
  if (battle.value.winner === 'draw') return null;
  return battle.value.winner === battle.value.playerSide;
});
const isDraw = computed(() => battle.value?.winner === 'draw');

const titleText = computed(() => {
  if (isDraw.value) return '平局 / DRAW';
  if (playerWon.value === true) return '胜利 / VICTORY';
  if (playerWon.value === false) return '失败 / DEFEAT';
  return '';
});

const titleClass = computed(() => {
  if (isDraw.value) return 'is-draw';
  if (playerWon.value) return 'is-win';
  return 'is-lose';
});

const levelLabel = computed(() => {
  if (!battle.value) return '';
  const lv = (battle.value.contentLevel || 'x') as CardLevel;
  return LEVEL_LABELS[lv] || lv;
});

async function toggleSaveWall() {
  if (!battle.value) return;
  if (!saveToWall.value) {
    // 用户取消保存 → 从 verdicts 表删除本局
    try {
      await db.verdicts.where('battleId').equals(battle.value.id!).delete();
    } catch (e) {
      console.warn('删除金句失败', e);
    }
  } else {
    // 用户重新勾选 → 重新插入
    try {
      const exists = await db.verdicts.where('battleId').equals(battle.value.id!).count();
      if (exists === 0) {
        const records = battle.value.rounds.map((r) => ({
          battleId: battle.value!.id!,
          roundIndex: r.index,
          aIso3: battle.value!.aIso3,
          bIso3: battle.value!.bIso3,
          aCardName: r.aCard.name,
          bCardName: r.bCard.name,
          verdict: r.verdict,
          funFact: r.funFact,
          contentLevel: battle.value!.contentLevel,
          savedAt: Date.now(),
        }));
        await db.verdicts.bulkAdd(records);
      }
    } catch (e) {
      console.warn('重新保存金句失败', e);
    }
  }
}

function playAgain() {
  router.push('/match-picker');
}
function backToGlobe() {
  router.push('/globe');
}
</script>

<template>
  <div class="result-page">
    <div v-if="loading" class="loading mono">读取对局…</div>
    <div v-else-if="error" class="error mono">
      ⚠ {{ error }}
      <button class="nat-btn" @click="router.push('/match-picker')">返回选场次</button>
    </div>

    <template v-else-if="battle">
      <header class="result-header">
        <div class="title-row" :class="titleClass">
          <h1 class="result-title">{{ titleText }}</h1>
        </div>
        <p class="result-sub mono">
          {{ aCountry?.nameZh }} vs {{ bCountry?.nameZh }} · {{ battle.matchDate }} ·
          {{ levelLabel }}
        </p>
      </header>

      <div class="totals nat-card">
        <div class="total-side">
          <span class="total-flag">{{ aCountry?.flag }}</span>
          <span class="total-name title-cn">{{ aCountry?.nameZh }}</span>
          <span class="total-num" :class="{ 'is-leader': battle.aTotal > battle.bTotal }">
            {{ battle.aTotal }}
          </span>
          <span class="total-wins mono">{{
            battle.rounds.filter((r) => r.aScore > r.bScore).length
          }} 回合胜</span>
        </div>
        <div class="total-sep">vs</div>
        <div class="total-side">
          <span class="total-flag">{{ bCountry?.flag }}</span>
          <span class="total-name title-cn">{{ bCountry?.nameZh }}</span>
          <span class="total-num" :class="{ 'is-leader': battle.bTotal > battle.aTotal }">
            {{ battle.bTotal }}
          </span>
          <span class="total-wins mono">{{
            battle.rounds.filter((r) => r.bScore > r.aScore).length
          }} 回合胜</span>
        </div>
      </div>

      <section class="verdicts-section">
        <div class="section-header">
          <h2 class="title-natgeo">5 回合金句</h2>
          <label class="save-wall mono">
            <input type="checkbox" v-model="saveToWall" @change="toggleSaveWall" />
            📜 保存到金句墙
          </label>
        </div>

        <ul class="verdict-list">
          <li
            v-for="r in battle.rounds"
            :key="r.index"
            class="verdict-item nat-card"
          >
            <div class="verdict-header">
              <span class="round-label mono">回合 {{ r.index + 1 }}</span>
              <span class="cards-vs">
                <span class="card-mini">{{ r.aCard.emoji }} {{ r.aCard.name }}</span>
                <span class="mini-score" :class="{ leader: r.aScore > r.bScore }">
                  {{ r.aScore }}
                </span>
                <span class="mini-vs mono">vs</span>
                <span class="mini-score" :class="{ leader: r.bScore > r.aScore }">
                  {{ r.bScore }}
                </span>
                <span class="card-mini">{{ r.bCard.emoji }} {{ r.bCard.name }}</span>
              </span>
            </div>
            <p class="verdict-text title-cn">"{{ r.verdict }}"</p>
            <p class="verdict-fact">💡 {{ r.funFact }}</p>
            <p v-if="r.fallback" class="fallback-note mono">（裁判离线，按属性计算）</p>
          </li>
        </ul>
      </section>

      <div class="result-actions">
        <button class="nat-btn nat-btn-gold" @click="playAgain">⚔ 再来一局</button>
        <button class="nat-btn" @click="backToGlobe">🌍 回主地图</button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.result-page {
  max-width: 880px;
  margin: 0 auto;
  padding: var(--space-5) var(--space-5) var(--space-7);
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
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

.result-header {
  text-align: center;
}
.title-row {
  display: inline-block;
  padding: var(--space-3) var(--space-5);
  border-radius: var(--radius-sm);
}
.title-row.is-win {
  background: var(--accent-gold);
}
.title-row.is-lose {
  background: var(--accent-blood);
}
.title-row.is-draw {
  background: var(--text-tertiary);
}
.result-title {
  font-family: var(--font-title);
  font-size: 36px;
  font-weight: 900;
  letter-spacing: 0.12em;
  color: var(--accent-deep);
}
.title-row.is-lose .result-title,
.title-row.is-draw .result-title {
  color: var(--bg-parchment);
}
.result-sub {
  margin-top: var(--space-3);
  font-size: 12px;
  color: var(--text-secondary);
  letter-spacing: 0.06em;
}

.totals {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: var(--space-4);
  padding: var(--space-5);
  align-items: center;
}
.total-side {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.total-flag {
  font-size: 40px;
}
.total-name {
  font-size: 16px;
  color: var(--accent-deep);
}
.total-num {
  font-family: var(--font-title);
  font-size: 44px;
  font-weight: 900;
  color: var(--text-secondary);
}
.total-num.is-leader {
  color: var(--accent-gold);
  text-shadow: 0 0 8px rgba(212, 160, 23, 0.4);
}
.total-wins {
  font-size: 10px;
  color: var(--text-tertiary);
  letter-spacing: 0.08em;
}
.total-sep {
  font-family: var(--font-title);
  font-size: 24px;
  color: var(--accent-gold);
  letter-spacing: 0.1em;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--space-3);
}
.section-header h2 {
  font-size: 18px;
}
.save-wall {
  font-size: 12px;
  display: flex;
  gap: 6px;
  align-items: center;
  cursor: pointer;
  color: var(--text-secondary);
}
.save-wall input {
  accent-color: var(--accent-gold);
}

.verdict-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.verdict-item {
  padding: var(--space-3) var(--space-4);
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.verdict-header {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  font-size: 11px;
}
.round-label {
  background: var(--accent-deep);
  color: var(--bg-parchment);
  padding: 2px 8px;
  border-radius: 2px;
  letter-spacing: 0.05em;
}
.cards-vs {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  align-items: center;
  color: var(--text-secondary);
}
.card-mini {
  font-family: var(--font-serif-cn);
  font-size: 12px;
}
.mini-score {
  font-family: var(--font-mono);
  background: rgba(42, 36, 25, 0.1);
  padding: 1px 6px;
  border-radius: 2px;
  font-weight: 600;
  color: var(--text-secondary);
}
.mini-score.leader {
  background: var(--accent-gold);
  color: var(--accent-deep);
}
.mini-vs {
  color: var(--text-tertiary);
  font-size: 9px;
}
.verdict-text {
  font-size: 15px;
  line-height: 1.6;
  color: var(--accent-deep);
  margin-top: 4px;
}
.verdict-fact {
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

.result-actions {
  display: flex;
  justify-content: center;
  gap: var(--space-4);
}
</style>
