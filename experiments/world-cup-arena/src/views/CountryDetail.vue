<script setup lang="ts">
/**
 * 国家详情页: /country/:iso3
 *
 * 6 tab：
 *   - 概览（必做）：国旗、中英名、洲、所属小组、是否主办
 *   - 历史 / 文化 / 足球（占位）
 *   - 本届卡牌（必做）：按 contentLevel 列出该国所有卡
 *   - AI 解说（必做）：调当前 LLM provider 介绍该国
 */
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { COUNTRY_BY_ISO3, GROUP_COLORS } from '@/data/countries';
import { useSettingsStore } from '@/stores/settings';
import { loadCardsForCountry } from '@/services/cardPoolService';
import { getProvider } from '@/services/llmProviders';
import countryIntroTemplate from '@/prompts/countryIntro.txt?raw';
import CulturalCard from '@/components/CulturalCard.vue';
import {
  getBrief,
  type BriefKind,
  type HistoryContent,
  type CultureContent,
  type FootballContent,
  type BriefResult,
} from '@/services/countryBriefService';

const route = useRoute();
const router = useRouter();
const settings = useSettingsStore();

const iso3 = computed(() => String(route.params.iso3 || '').toUpperCase());
const country = computed(() => COUNTRY_BY_ISO3[iso3.value]);

type TabKey = 'overview' | 'history' | 'culture' | 'football' | 'cards' | 'ai';
const tab = ref<TabKey>('overview');
const TABS: { key: TabKey; label: string }[] = [
  { key: 'overview', label: '概览' },
  { key: 'history', label: '历史' },
  { key: 'culture', label: '文化' },
  { key: 'football', label: '足球' },
  { key: 'cards', label: '本届卡牌' },
  { key: 'ai', label: 'AI 解说' },
];

const cards = computed(() => {
  if (!country.value) return [];
  return loadCardsForCountry(country.value.iso3, settings.state.contentLevel);
});

// AI 解说状态
const aiText = ref<string>('');
const aiLoading = ref(false);
const aiError = ref<string | null>(null);

function fillIntroPrompt(): string {
  if (!country.value) return '';
  const c = country.value;
  const hostLine = c.isHost ? '（本届承办国）' : '';
  return countryIntroTemplate
    .split('{nameZh}').join(c.nameZh)
    .split('{nameEn}').join(c.nameEn)
    .split('{flag}').join(c.flag)
    .split('{confederation}').join(c.confederation)
    .split('{group}').join(c.group)
    .split('{hostLine}').join(hostLine)
    .split('{level}').join(String(settings.state.contentLevel).toLowerCase());
}

async function generateIntro() {
  if (aiLoading.value) return;
  aiText.value = '';
  aiError.value = null;
  aiLoading.value = true;
  try {
    const providerId = settings.state.activeProvider;
    const cfg = settings.state.providers[providerId];
    const provider = getProvider(providerId);
    if (provider.requiresApiKey && !cfg?.apiKey) {
      aiError.value = `请先在设置里配置 ${provider.displayName} 的 API Key`;
      return;
    }
    const prompt = fillIntroPrompt();
    const res = await provider.chat(
      [
        { role: 'system', content: '你是 NatGeo 风格旅行作家，输出纯文字，不要 markdown。' },
        { role: 'user', content: prompt },
      ],
      cfg,
      { temperature: 0.7, maxTokens: 700 }
    );
    aiText.value = (res.content || '').trim();
    if (!aiText.value) aiError.value = 'LLM 返回为空';
  } catch (e: any) {
    aiError.value = e?.message || 'LLM 调用失败';
  } finally {
    aiLoading.value = false;
  }
}

// ── 历史 / 文化 / 足球 brief 状态 ─────────────────────
interface BriefSlot<T> {
  data: T | null;
  raw: string | null;
  loading: boolean;
  error: string | null;
  cached: boolean;
  generatedAt: number | null;
  provider: string | null;
  model: string | null;
}

function emptySlot<T>(): BriefSlot<T> {
  return {
    data: null,
    raw: null,
    loading: false,
    error: null,
    cached: false,
    generatedAt: null,
    provider: null,
    model: null,
  };
}

const historySlot = ref<BriefSlot<HistoryContent>>(emptySlot());
const cultureSlot = ref<BriefSlot<CultureContent>>(emptySlot());
const footballSlot = ref<BriefSlot<FootballContent>>(emptySlot());

function slotOf(kind: BriefKind) {
  if (kind === 'history') return historySlot;
  if (kind === 'culture') return cultureSlot;
  return footballSlot;
}

async function loadBrief(kind: BriefKind, force = false) {
  if (!country.value) return;
  const slotRef = slotOf(kind);
  if (slotRef.value.loading) return;
  if (slotRef.value.data && !force) return; // 已有数据 + 非强制 → 跳过
  slotRef.value = { ...slotRef.value, loading: true, error: null };
  const res = (await getBrief(country.value, kind, force)) as BriefResult<any>;
  slotRef.value = {
    data: res.content,
    raw: res.raw || null,
    loading: false,
    error: res.error || null,
    cached: res.cached,
    generatedAt: res.generatedAt || null,
    provider: res.provider || null,
    model: res.model || null,
  };
}

/** 切到 history/culture/football tab 时自动触发首次加载 */
watch(
  [tab, iso3, () => settings.state.contentLevel],
  ([t, _iso, _lvl], [oldT, oldIso, oldLvl]) => {
    if (t === 'history' || t === 'culture' || t === 'football') {
      // 国家或尺度变了 → 清掉旧数据
      if (oldIso !== _iso || oldLvl !== _lvl) {
        historySlot.value = emptySlot();
        cultureSlot.value = emptySlot();
        footballSlot.value = emptySlot();
      }
      loadBrief(t as BriefKind);
    }
  },
  { immediate: true }
);

/** 相对时间显示 */
function formatAgo(ts: number | null): string {
  if (!ts) return '';
  const ms = Date.now() - ts;
  const min = Math.floor(ms / 60_000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour} 小时前`;
  const day = Math.floor(hour / 24);
  return `${day} 天前`;
}
</script>

<template>
  <div class="country-page">
    <div v-if="!country" class="not-found mono">
      未知国家代码：{{ iso3 }}
      <button class="nat-btn" @click="router.push('/globe')">返回世界地图</button>
    </div>

    <template v-else>
      <header class="country-header">
        <button class="back-btn mono" @click="router.push('/globe')">← 世界地图</button>
        <div class="country-id">
          <span class="country-flag">{{ country.flag }}</span>
          <div class="country-names">
            <h1 class="country-zh title-cn">{{ country.nameZh }}</h1>
            <span class="country-en mono">{{ country.nameEn }} · {{ country.iso3 }}</span>
          </div>
          <div class="country-tags">
            <span
              class="group-tag mono"
              :style="{ background: GROUP_COLORS[country.group] }"
            >
              Group {{ country.group }}
            </span>
            <span class="conf-tag mono">{{ country.confederation }}</span>
            <span v-if="country.isHost" class="host-tag mono">本届主办国</span>
          </div>
        </div>
      </header>

      <nav class="tab-nav">
        <button
          v-for="t in TABS"
          :key="t.key"
          class="tab-btn"
          :class="{ 'is-active': tab === t.key }"
          @click="tab = t.key"
        >
          {{ t.label }}
        </button>
      </nav>

      <!-- 概览 -->
      <section v-if="tab === 'overview'" class="tab-panel nat-card">
        <div class="overview-grid">
          <div class="info-block">
            <span class="info-label mono">中文名</span>
            <span class="info-value title-cn">{{ country.nameZh }}</span>
          </div>
          <div class="info-block">
            <span class="info-label mono">英文名</span>
            <span class="info-value">{{ country.nameEn }}</span>
          </div>
          <div class="info-block">
            <span class="info-label mono">ISO 代码</span>
            <span class="info-value mono">{{ country.iso3 }} / {{ country.iso2.toUpperCase() }}</span>
          </div>
          <div class="info-block">
            <span class="info-label mono">大洲组织</span>
            <span class="info-value">{{ country.confederation }}</span>
          </div>
          <div class="info-block">
            <span class="info-label mono">本届小组</span>
            <span
              class="info-value group-chip"
              :style="{ background: GROUP_COLORS[country.group], color: 'var(--bg-parchment)' }"
            >
              Group {{ country.group }}
            </span>
          </div>
          <div class="info-block">
            <span class="info-label mono">承办国</span>
            <span class="info-value">{{ country.isHost ? '是（2026 三国合办）' : '否' }}</span>
          </div>
        </div>
      </section>

      <!-- 历史 ───────────────────────────────────────── -->
      <section v-else-if="tab === 'history'" class="tab-panel nat-card brief-panel">
        <header class="brief-header">
          <h3 class="brief-title title-natgeo">🕰 历史时间轴</h3>
          <div class="brief-meta">
            <span v-if="historySlot.generatedAt" class="brief-meta-item mono">
              ⏱ {{ formatAgo(historySlot.generatedAt) }}
              <span v-if="historySlot.model">· {{ historySlot.model }}</span>
              <span v-if="historySlot.cached" class="brief-cached">· 缓存</span>
            </span>
            <button
              class="nat-btn brief-regen"
              :disabled="historySlot.loading"
              @click="loadBrief('history', true)"
            >
              🔄 {{ historySlot.loading ? '撰写中…' : historySlot.data ? '重新生成' : '生成历史' }}
            </button>
          </div>
        </header>

        <div v-if="historySlot.loading" class="brief-loading">
          📜 LLM 正在撰写 {{ country.nameZh }} 的历史时间轴…
          <p class="brief-loading-hint mono">首次冷启动可能 30s+</p>
        </div>
        <div v-else-if="historySlot.error" class="brief-error">
          <p class="brief-error-msg mono">⚠ {{ historySlot.error }}</p>
          <button class="nat-btn nat-btn-gold" @click="loadBrief('history', true)">重试</button>
          <details v-if="historySlot.raw" class="brief-raw">
            <summary class="mono">原始返回</summary>
            <pre class="brief-raw-pre mono">{{ historySlot.raw }}</pre>
          </details>
        </div>
        <template v-else-if="historySlot.data">
          <p class="brief-summary">{{ historySlot.data.summary }}</p>
          <ol class="timeline">
            <li v-for="(ev, i) in historySlot.data.timeline" :key="i" class="timeline-item">
              <div class="timeline-marker">
                <span class="timeline-dot"></span>
                <span v-if="i < historySlot.data.timeline.length - 1" class="timeline-line"></span>
              </div>
              <div class="timeline-body">
                <span class="timeline-year mono">{{ ev.year }}</span>
                <h4 class="timeline-event">{{ ev.event }}</h4>
                <p class="timeline-detail">{{ ev.detail }}</p>
              </div>
            </li>
          </ol>
        </template>
      </section>

      <!-- 文化 ───────────────────────────────────────── -->
      <section v-else-if="tab === 'culture'" class="tab-panel nat-card brief-panel">
        <header class="brief-header">
          <h3 class="brief-title title-natgeo">🎭 文化全景</h3>
          <div class="brief-meta">
            <span v-if="cultureSlot.generatedAt" class="brief-meta-item mono">
              ⏱ {{ formatAgo(cultureSlot.generatedAt) }}
              <span v-if="cultureSlot.model">· {{ cultureSlot.model }}</span>
              <span v-if="cultureSlot.cached" class="brief-cached">· 缓存</span>
            </span>
            <button
              class="nat-btn brief-regen"
              :disabled="cultureSlot.loading"
              @click="loadBrief('culture', true)"
            >
              🔄 {{ cultureSlot.loading ? '撰写中…' : cultureSlot.data ? '重新生成' : '生成文化' }}
            </button>
          </div>
        </header>

        <div v-if="cultureSlot.loading" class="brief-loading">
          🎨 LLM 正在描绘 {{ country.nameZh }} 的文化景观…
          <p class="brief-loading-hint mono">首次冷启动可能 30s+</p>
        </div>
        <div v-else-if="cultureSlot.error" class="brief-error">
          <p class="brief-error-msg mono">⚠ {{ cultureSlot.error }}</p>
          <button class="nat-btn nat-btn-gold" @click="loadBrief('culture', true)">重试</button>
          <details v-if="cultureSlot.raw" class="brief-raw">
            <summary class="mono">原始返回</summary>
            <pre class="brief-raw-pre mono">{{ cultureSlot.raw }}</pre>
          </details>
        </div>
        <template v-else-if="cultureSlot.data">
          <p class="brief-summary">{{ cultureSlot.data.summary }}</p>
          <div class="culture-grid">
            <article class="culture-card">
              <h4 class="culture-card-title">🎨 艺术</h4>
              <p class="culture-card-body">{{ cultureSlot.data.art }}</p>
            </article>
            <article class="culture-card">
              <h4 class="culture-card-title">📖 文学</h4>
              <p class="culture-card-body">{{ cultureSlot.data.literature }}</p>
            </article>
            <article class="culture-card">
              <h4 class="culture-card-title">🎊 节日</h4>
              <p class="culture-card-body">{{ cultureSlot.data.festival }}</p>
            </article>
            <article class="culture-card">
              <h4 class="culture-card-title">🍜 饮食</h4>
              <p class="culture-card-body">{{ cultureSlot.data.cuisine }}</p>
            </article>
            <article class="culture-card culture-card-wide">
              <h4 class="culture-card-title">🧠 哲学 / 信仰</h4>
              <p class="culture-card-body">{{ cultureSlot.data.philosophy }}</p>
            </article>
          </div>
        </template>
      </section>

      <!-- 足球 ───────────────────────────────────────── -->
      <section v-else-if="tab === 'football'" class="tab-panel nat-card brief-panel">
        <header class="brief-header">
          <h3 class="brief-title title-natgeo">⚽ 足球篇</h3>
          <div class="brief-meta">
            <span v-if="footballSlot.generatedAt" class="brief-meta-item mono">
              ⏱ {{ formatAgo(footballSlot.generatedAt) }}
              <span v-if="footballSlot.model">· {{ footballSlot.model }}</span>
              <span v-if="footballSlot.cached" class="brief-cached">· 缓存</span>
            </span>
            <button
              class="nat-btn brief-regen"
              :disabled="footballSlot.loading"
              @click="loadBrief('football', true)"
            >
              🔄 {{ footballSlot.loading ? '撰写中…' : footballSlot.data ? '重新生成' : '生成足球' }}
            </button>
          </div>
        </header>

        <div v-if="footballSlot.loading" class="brief-loading">
          ⚽ LLM 正在整理 {{ country.nameZh }} 的世界杯档案…
          <p class="brief-loading-hint mono">首次冷启动可能 30s+</p>
        </div>
        <div v-else-if="footballSlot.error" class="brief-error">
          <p class="brief-error-msg mono">⚠ {{ footballSlot.error }}</p>
          <button class="nat-btn nat-btn-gold" @click="loadBrief('football', true)">重试</button>
          <details v-if="footballSlot.raw" class="brief-raw">
            <summary class="mono">原始返回</summary>
            <pre class="brief-raw-pre mono">{{ footballSlot.raw }}</pre>
          </details>
        </div>
        <template v-else-if="footballSlot.data">
          <p class="brief-summary">{{ footballSlot.data.summary }}</p>

          <div class="football-section">
            <h4 class="football-section-title">🏆 世界杯历届成绩</h4>
            <div v-if="footballSlot.data.world_cup_history.length === 0" class="football-empty mono">
              迄今未踢过世界杯正赛
            </div>
            <ol v-else class="wc-list">
              <li v-for="r in footballSlot.data.world_cup_history" :key="r.year" class="wc-row">
                <span class="wc-year mono">{{ r.year }}</span>
                <span class="wc-result">{{ r.result }}</span>
              </li>
            </ol>
          </div>

          <div v-if="footballSlot.data.legends.length" class="football-section">
            <h4 class="football-section-title">⭐ 传奇球星</h4>
            <ul class="legends-list">
              <li v-for="(l, i) in footballSlot.data.legends" :key="i" class="legend-item">
                {{ l }}
              </li>
            </ul>
          </div>

          <div class="football-section">
            <h4 class="football-section-title">🎯 风格</h4>
            <p class="football-prose">{{ footballSlot.data.style }}</p>
          </div>

          <div class="football-section football-current">
            <h4 class="football-section-title">⚡ 2026 本届展望</h4>
            <p class="football-prose">{{ footballSlot.data.current_2026 }}</p>
          </div>
        </template>
      </section>

      <!-- 本届卡牌 -->
      <section v-else-if="tab === 'cards'" class="tab-panel">
        <div class="cards-header">
          <p class="cards-count">
            当前内容尺度：<strong>{{ settings.state.contentLevel }}</strong> · 可用 {{ cards.length }} 张卡
          </p>
          <p class="cards-hint mono">在设置里切换 PG / R / X 可显示更多卡</p>
        </div>
        <div v-if="cards.length === 0" class="cards-empty mono">
          该国当前尺度下无可用卡
        </div>
        <div v-else class="cards-grid">
          <CulturalCard v-for="c in cards" :key="c.id" :card="c" />
        </div>
      </section>

      <!-- AI 解说 -->
      <section v-else-if="tab === 'ai'" class="tab-panel nat-card">
        <div class="ai-header">
          <h3 class="title-natgeo">让 AI 介绍这个国家</h3>
          <p class="ai-sub">
            尺度 <strong>{{ settings.state.contentLevel }}</strong> · Provider
            <strong>{{ settings.state.activeProvider }}</strong>
          </p>
        </div>
        <button class="nat-btn nat-btn-gold ai-btn" :disabled="aiLoading" @click="generateIntro">
          {{ aiLoading ? '生成中…' : aiText ? '重新生成' : '🪶 让 AI 写一段' }}
        </button>
        <div v-if="aiError" class="ai-error mono">⚠ {{ aiError }}</div>
        <article v-if="aiText" class="ai-text">{{ aiText }}</article>
      </section>
    </template>
  </div>
</template>

<style scoped>
.country-page {
  max-width: 1100px;
  margin: 0 auto;
  padding: var(--space-4) var(--space-5) var(--space-7);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.not-found {
  text-align: center;
  padding: var(--space-7) 0;
  color: var(--text-tertiary);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  align-items: center;
}

.country-header {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.back-btn {
  align-self: flex-start;
  background: transparent;
  border: 1px solid var(--accent-deep);
  color: var(--accent-deep);
  padding: 4px 12px;
  border-radius: 2px;
  font-size: 11px;
  cursor: pointer;
}
.back-btn:hover {
  background: var(--accent-deep);
  color: var(--bg-parchment);
}
.country-id {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: var(--space-4);
  align-items: center;
}
@media (max-width: 720px) {
  .country-id {
    grid-template-columns: 1fr;
    text-align: center;
  }
}
.country-flag {
  font-size: 64px;
  line-height: 1;
}
.country-zh {
  font-size: 28px;
  color: var(--accent-deep);
  margin-bottom: 2px;
}
.country-en {
  font-size: 11px;
  color: var(--text-tertiary);
  letter-spacing: 0.08em;
}
.country-tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.group-tag,
.conf-tag,
.host-tag {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 2px;
  letter-spacing: 0.05em;
}
.group-tag {
  color: var(--bg-parchment);
}
.conf-tag {
  border: 1px solid var(--accent-gold);
  color: var(--accent-gold);
}
.host-tag {
  background: var(--accent-gold);
  color: var(--accent-deep);
  font-weight: 600;
}

/* Tab */
.tab-nav {
  display: flex;
  gap: var(--space-2);
  border-bottom: 1px solid var(--border-thin);
  flex-wrap: wrap;
}
.tab-btn {
  padding: 8px 16px;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  color: var(--text-secondary);
  font-family: var(--font-title);
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.tab-btn:hover {
  color: var(--accent-deep);
}
.tab-btn.is-active {
  color: var(--accent-deep);
  border-bottom-color: var(--accent-gold);
}

.tab-panel {
  padding: var(--space-5);
  min-height: 280px;
}
.overview-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: var(--space-4);
}
.info-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: var(--space-3);
  background: rgba(244, 232, 208, 0.4);
  border-radius: var(--radius-sm);
}
.info-label {
  font-size: 10px;
  color: var(--accent-gold);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.info-value {
  font-size: 15px;
  color: var(--accent-deep);
  font-weight: 600;
}
.info-value.group-chip {
  align-self: flex-start;
  padding: 2px 10px;
  border-radius: 2px;
  font-family: var(--font-mono);
  font-size: 12px;
}

.cards-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-bottom: var(--space-3);
}
.cards-count {
  font-size: 13px;
  color: var(--text-secondary);
}
.cards-count strong {
  color: var(--accent-deep);
}
.cards-hint {
  font-size: 11px;
  color: var(--text-tertiary);
}
.cards-empty {
  text-align: center;
  padding: var(--space-7) 0;
  color: var(--text-tertiary);
}
.cards-grid {
  display: flex;
  gap: var(--space-4);
  flex-wrap: wrap;
  justify-content: center;
}

.ai-header {
  margin-bottom: var(--space-3);
}
.ai-header h3 {
  font-size: 18px;
  margin-bottom: 4px;
}
.ai-sub {
  font-size: 12px;
  color: var(--text-secondary);
}
.ai-sub strong {
  color: var(--accent-deep);
}
.ai-btn {
  margin: var(--space-3) 0;
}
.ai-error {
  color: var(--text-error);
  font-size: 12px;
  margin-top: var(--space-2);
}
.ai-text {
  margin-top: var(--space-3);
  padding: var(--space-4);
  background: rgba(212, 160, 23, 0.06);
  border-left: 3px solid var(--accent-gold);
  font-family: var(--font-serif-cn);
  font-size: 15px;
  line-height: 1.8;
  color: var(--text-primary);
  white-space: pre-wrap;
}

/* ── Brief 通用 ─────────────────────────────────── */
.brief-panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
.brief-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--space-3);
  border-bottom: 1px solid var(--border-thin);
  padding-bottom: var(--space-3);
  flex-wrap: wrap;
}
.brief-title {
  font-size: 22px;
  color: var(--accent-deep);
  margin: 0;
}
.brief-meta {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
}
.brief-meta-item {
  font-size: 10px;
  color: var(--text-tertiary);
  letter-spacing: 0.04em;
}
.brief-cached {
  color: var(--accent-gold);
}
.brief-regen {
  font-size: 11px;
  padding: 4px 12px;
}

.brief-summary {
  font-family: var(--font-serif-cn);
  font-size: 16px;
  line-height: 1.85;
  color: var(--text-primary);
  padding: var(--space-3) var(--space-4);
  background: rgba(212, 160, 23, 0.06);
  border-left: 3px solid var(--accent-gold);
  margin: 0;
}

.brief-loading {
  text-align: center;
  padding: var(--space-7) var(--space-4);
  color: var(--text-secondary);
  font-family: var(--font-serif-cn);
  font-size: 15px;
}
.brief-loading-hint {
  font-size: 11px;
  color: var(--text-tertiary);
  margin-top: var(--space-2);
}
.brief-error {
  text-align: center;
  padding: var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  align-items: center;
}
.brief-error-msg {
  color: var(--text-error);
  font-size: 12px;
  max-width: 480px;
  word-break: break-word;
}
.brief-raw {
  width: 100%;
  text-align: left;
  margin-top: var(--space-2);
}
.brief-raw summary {
  cursor: pointer;
  font-size: 10px;
  color: var(--text-tertiary);
}
.brief-raw-pre {
  max-height: 240px;
  overflow: auto;
  font-size: 10px;
  background: rgba(0, 0, 0, 0.04);
  padding: var(--space-2);
  margin-top: var(--space-2);
  white-space: pre-wrap;
  word-break: break-word;
}

/* ── 历史 timeline ─────────────────────────────── */
.timeline {
  list-style: none;
  padding: 0;
  margin: var(--space-3) 0 0 0;
  display: flex;
  flex-direction: column;
}
.timeline-item {
  display: grid;
  grid-template-columns: 24px 1fr;
  gap: var(--space-3);
  padding-bottom: var(--space-4);
}
.timeline-marker {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 6px;
}
.timeline-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--accent-gold);
  border: 2px solid var(--bg-parchment);
  box-shadow: 0 0 0 1px var(--accent-gold);
  flex-shrink: 0;
  z-index: 1;
}
.timeline-line {
  position: absolute;
  top: 18px;
  bottom: -16px;
  left: 50%;
  width: 2px;
  background: var(--accent-gold);
  opacity: 0.4;
  transform: translateX(-50%);
}
.timeline-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-top: 2px;
}
.timeline-year {
  font-size: 11px;
  color: var(--accent-gold);
  font-weight: 700;
  letter-spacing: 0.06em;
}
.timeline-event {
  margin: 0;
  font-family: var(--font-title);
  font-size: 15px;
  color: var(--accent-deep);
  font-weight: 600;
}
.timeline-detail {
  margin: 0;
  font-family: var(--font-serif-cn);
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-secondary);
}

/* ── 文化 grid ──────────────────────────────────── */
.culture-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: var(--space-3);
}
.culture-card {
  background: rgba(244, 232, 208, 0.4);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-sm);
  border-top: 2px solid var(--accent-gold);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.culture-card-wide {
  grid-column: 1 / -1;
}
.culture-card-title {
  margin: 0;
  font-family: var(--font-title);
  font-size: 13px;
  color: var(--accent-deep);
  letter-spacing: 0.04em;
}
.culture-card-body {
  margin: 0;
  font-family: var(--font-serif-cn);
  font-size: 13px;
  line-height: 1.75;
  color: var(--text-primary);
}

/* ── 足球 ────────────────────────────────────────── */
.football-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.football-section-title {
  margin: 0;
  font-family: var(--font-title);
  font-size: 14px;
  color: var(--accent-deep);
  letter-spacing: 0.05em;
  border-bottom: 1px dashed var(--border-thin);
  padding-bottom: 4px;
}
.football-prose {
  margin: 0;
  font-family: var(--font-serif-cn);
  font-size: 14px;
  line-height: 1.8;
  color: var(--text-primary);
}
.football-current {
  padding: var(--space-3) var(--space-4);
  background: rgba(212, 160, 23, 0.08);
  border-radius: var(--radius-sm);
  border: 1px solid var(--accent-gold);
}
.football-current .football-section-title {
  border-bottom: none;
  color: var(--accent-deep);
}
.wc-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 6px;
}
.wc-row {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  padding: 4px 10px;
  background: rgba(244, 232, 208, 0.4);
  border-radius: var(--radius-sm);
  border-left: 2px solid var(--accent-gold);
}
.wc-year {
  font-size: 12px;
  color: var(--accent-gold);
  font-weight: 700;
  min-width: 48px;
}
.wc-result {
  font-family: var(--font-serif-cn);
  font-size: 12px;
  color: var(--text-primary);
}
.football-empty {
  font-size: 12px;
  color: var(--text-tertiary);
  padding: var(--space-3);
  text-align: center;
}
.legends-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.legend-item {
  padding: 8px 12px;
  background: rgba(244, 232, 208, 0.4);
  border-left: 3px solid var(--accent-gold);
  font-family: var(--font-serif-cn);
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-primary);
}
</style>
