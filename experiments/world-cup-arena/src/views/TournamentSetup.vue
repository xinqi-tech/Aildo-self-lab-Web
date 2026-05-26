<script setup lang="ts">
/**
 * 新建锦标赛：/tournament/new
 *
 * 步骤：选国家 → 输入存档名（可选）→ 选内容尺度 → 开始锦标赛。
 */
import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  COUNTRIES,
  GROUPS,
  countriesByGroup,
  type Country,
  type GroupKey,
} from '@/data/countries';
import { createTournament } from '@/services/tournamentEngine';
import { saveTournament } from '@/services/tournamentDb';
import { advanceTournament } from '@/services/tournamentEngine';
import { useSettingsStore } from '@/stores/settings';
import type { CardLevel } from '@/data/cards/types';

const router = useRouter();
const settings = useSettingsStore();

const selectedIso3 = ref<string | null>(null);
const customName = ref('');
const contentLevel = ref<CardLevel>(
  (String(settings.state.contentLevel).toLowerCase() as CardLevel) || 'x'
);
const creating = ref(false);
const error = ref<string | null>(null);

const grouped = computed(() => countriesByGroup());
const groupKeys = computed<GroupKey[]>(() => GROUPS);

const selectedCountry = computed<Country | null>(() =>
  selectedIso3.value ? COUNTRIES.find((c) => c.iso3 === selectedIso3.value) ?? null : null
);

const defaultName = computed(() =>
  selectedCountry.value ? `${selectedCountry.value.nameZh} 的 2026 征程` : ''
);

function pickCountry(iso3: string) {
  selectedIso3.value = iso3;
  if (!customName.value.trim()) {
    customName.value = '';
  }
}

async function start() {
  if (!selectedIso3.value) {
    error.value = '请先选一个国家';
    return;
  }
  creating.value = true;
  error.value = null;
  try {
    const t = createTournament(selectedIso3.value, contentLevel.value, customName.value || undefined);
    // 立即跑一次 advance（小组赛 R1 的非玩家场会被模拟）
    advanceTournament(t);
    const id = await saveTournament(t);
    router.replace(`/tournament/${id}`);
  } catch (e: any) {
    error.value = e?.message || '创建失败';
  } finally {
    creating.value = false;
  }
}

function cancel() {
  router.push('/tournament');
}
</script>

<template>
  <div class="setup-page">
    <header class="page-header">
      <h1 class="page-title">开始 2026 征程</h1>
      <p class="page-sub mono">选你的国家 · 决定文化对抗的尺度</p>
    </header>

    <!-- 步骤 1：选国家 -->
    <section class="step nat-card">
      <h2 class="step-title">
        <span class="step-num">1</span>
        选择你的国家
        <span v-if="selectedCountry" class="step-hint mono">
          已选：{{ selectedCountry.flag }} {{ selectedCountry.nameZh }}（{{ selectedCountry.group }} 组）
        </span>
      </h2>
      <div class="group-list">
        <div v-for="g in groupKeys" :key="g" class="group-block">
          <div class="group-label mono">{{ g }} 组</div>
          <div class="country-grid">
            <button
              v-for="c in grouped[g]"
              :key="c.iso3"
              class="country-card"
              :class="{ 'is-selected': c.iso3 === selectedIso3 }"
              @click="pickCountry(c.iso3)"
            >
              <span class="cc-flag">{{ c.flag }}</span>
              <span class="cc-name title-cn">{{ c.nameZh }}</span>
              <span v-if="c.isHost" class="cc-host mono">东道主</span>
            </button>
          </div>
        </div>
      </div>
    </section>

    <!-- 步骤 2：存档名 -->
    <section class="step nat-card">
      <h2 class="step-title">
        <span class="step-num">2</span>
        存档名
        <span class="step-hint mono">（留空使用默认）</span>
      </h2>
      <input
        v-model="customName"
        class="text-input"
        :placeholder="defaultName || '<国家名> 的 2026 征程'"
        maxlength="40"
      />
    </section>

    <!-- 步骤 3：尺度 -->
    <section class="step nat-card">
      <h2 class="step-title">
        <span class="step-num">3</span>
        内容尺度
      </h2>
      <div class="level-row">
        <label v-for="lv in ['pg', 'r', 'x'] as const" :key="lv" class="level-card" :class="{ 'is-selected': contentLevel === lv }">
          <input type="radio" v-model="contentLevel" :value="lv" />
          <span class="lv-name title-cn">{{ lv === 'pg' ? 'PG · 安全' : lv === 'r' ? 'R · 暗黑' : 'X · 无下限' }}</span>
          <span class="lv-desc mono">
            {{
              lv === 'pg'
                ? '艺术 / 历史 / 生活 / 科技'
                : lv === 'r'
                  ? '殖民 / 战争 / 真实历史阴暗面'
                  : '荒诞 / 猎奇 / 政治讽刺 / 都市传说'
            }}
          </span>
        </label>
      </div>
    </section>

    <div v-if="error" class="error-row mono">⚠ {{ error }}</div>

    <div class="actions">
      <button class="nat-btn" @click="cancel">取消</button>
      <button
        class="nat-btn nat-btn-gold start-btn"
        :disabled="!selectedIso3 || creating"
        @click="start"
      >
        <span v-if="creating">⏳ 启程中…</span>
        <span v-else>⚔ 开始锦标赛</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.setup-page {
  max-width: 1080px;
  margin: 0 auto;
  padding: var(--space-5) var(--space-5) var(--space-7);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.page-header {
  text-align: center;
}
.page-title {
  font-family: var(--font-title);
  font-size: 28px;
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

.step {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding: var(--space-4);
  background: var(--bg-parchment);
  border: 1px solid var(--accent-gold);
  border-radius: var(--radius-md);
}
.step-title {
  font-family: var(--font-title);
  font-size: 16px;
  color: var(--accent-deep);
  display: flex;
  align-items: center;
  gap: 8px;
  letter-spacing: 0.05em;
}
.step-num {
  display: inline-flex;
  width: 22px;
  height: 22px;
  background: var(--accent-gold);
  color: var(--accent-deep);
  border-radius: 50%;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 900;
}
.step-hint {
  margin-left: auto;
  font-size: 11px;
  color: var(--text-secondary);
  font-weight: normal;
  letter-spacing: 0.05em;
}

.group-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--space-3);
}
.group-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.group-label {
  font-size: 10px;
  letter-spacing: 0.12em;
  color: var(--text-secondary);
  text-transform: uppercase;
  padding-bottom: 4px;
  border-bottom: 1px dashed var(--border-thin);
}
.country-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px;
}
.country-card {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: rgba(244, 232, 208, 0.6);
  border: 1px solid var(--border-thin);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.15s;
  text-align: left;
  font-family: var(--font-body);
}
.country-card:hover {
  background: rgba(212, 160, 23, 0.12);
  border-color: var(--accent-gold);
}
.country-card.is-selected {
  background: var(--accent-gold);
  border-color: var(--accent-deep);
  box-shadow: 0 0 8px rgba(212, 160, 23, 0.4);
}
.cc-flag {
  font-size: 18px;
  line-height: 1;
}
.cc-name {
  flex: 1;
  font-size: 12px;
  color: var(--accent-deep);
}
.cc-host {
  font-size: 9px;
  background: var(--accent-blood);
  color: var(--bg-parchment);
  padding: 1px 4px;
  border-radius: 2px;
  letter-spacing: 0.04em;
}

.text-input {
  width: 100%;
  padding: 10px 14px;
  font-family: var(--font-serif-cn);
  font-size: 14px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: rgba(255, 255, 255, 0.5);
  color: var(--accent-deep);
}
.text-input:focus {
  outline: none;
  border-color: var(--accent-gold);
  box-shadow: 0 0 0 3px rgba(212, 160, 23, 0.18);
}

.level-row {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: var(--space-3);
}
.level-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: var(--space-3);
  background: rgba(244, 232, 208, 0.6);
  border: 1px solid var(--border-thin);
  border-radius: var(--radius-sm);
  cursor: pointer;
}
.level-card.is-selected {
  background: rgba(212, 160, 23, 0.18);
  border-color: var(--accent-gold);
}
.level-card input {
  display: none;
}
.lv-name {
  font-size: 14px;
  color: var(--accent-deep);
  font-weight: 700;
}
.lv-desc {
  font-size: 10px;
  color: var(--text-secondary);
  letter-spacing: 0.04em;
}

.error-row {
  background: rgba(139, 0, 0, 0.1);
  border-left: 3px solid var(--text-error);
  padding: 8px 12px;
  color: var(--text-error);
  font-size: 12px;
  letter-spacing: 0.04em;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-3);
}
.nat-btn {
  font-family: var(--font-title);
  letter-spacing: 0.1em;
  font-size: 12px;
  padding: 8px 16px;
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
.nat-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.start-btn {
  padding: 10px 24px;
  font-size: 13px;
}
</style>
