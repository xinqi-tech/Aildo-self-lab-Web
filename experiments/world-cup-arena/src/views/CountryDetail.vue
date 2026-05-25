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
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { COUNTRY_BY_ISO3, GROUP_COLORS } from '@/data/countries';
import { useSettingsStore } from '@/stores/settings';
import { loadCardsForCountry } from '@/services/cardPoolService';
import { getProvider } from '@/services/llmProviders';
import countryIntroTemplate from '@/prompts/countryIntro.txt?raw';
import CulturalCard from '@/components/CulturalCard.vue';

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

      <!-- 历史 / 文化 / 足球 占位 -->
      <section v-else-if="tab === 'history'" class="tab-panel nat-card placeholder">
        <p>历史时间轴 · 内容待补充</p>
        <p class="hint mono">建议：4-8 个重大事件，含具体年份 + 一句话评述</p>
      </section>
      <section v-else-if="tab === 'culture'" class="tab-panel nat-card placeholder">
        <p>艺术 / 音乐 / 文学 / 节日 / 习俗 · 内容待补充</p>
        <p class="hint mono">建议：每项 2-3 张图 + 100 字简介</p>
      </section>
      <section v-else-if="tab === 'football'" class="tab-panel nat-card placeholder">
        <p>本届阵容 · 历届世界杯成绩 · 传奇球星 · 内容待补充</p>
        <p class="hint mono">数据源建议：openfootball + Wikipedia</p>
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
.tab-panel.placeholder {
  text-align: center;
  color: var(--text-secondary);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  justify-content: center;
}
.tab-panel.placeholder .hint {
  font-size: 11px;
  color: var(--text-tertiary);
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
</style>
