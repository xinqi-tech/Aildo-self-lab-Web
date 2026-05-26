<script setup lang="ts">
/**
 * 今日 NatGeo 开屏：/daily
 *
 * 全屏黑底 + 大字 Cinzel 国名 + 国旗 emoji + LLM 80-120 字侧切短文。
 *
 * 选国规则：day-of-year 取模 48，今日聚焦谁是固定的，所有客户端结果一致。
 *
 * 缓存：dailyService 走 Dexie，同一天同一国不重复调 LLM；
 *      "刷新"按钮可强制重写一次（覆盖缓存）。
 *
 * 强弹规则：App.vue 不接管，组件自己用 isFirstVisitToday() 在 onMounted 时 markSeenToday。
 */

import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  todayCountry,
  getDailyBrief,
  regenerateDailyBrief,
  markSeenToday,
  todayYmd,
} from '@/services/dailyService';
import { useSettingsStore } from '@/stores/settings';

const router = useRouter();
const settings = useSettingsStore();

const country = ref(todayCountry());
const brief = ref('');
const error = ref<string | null>(null);
const loading = ref(true);
const cached = ref(false);
const ymd = ref(todayYmd());

async function load() {
  loading.value = true;
  error.value = null;
  try {
    const res = await getDailyBrief(country.value, settings.state.contentLevel);
    brief.value = res.text;
    cached.value = res.cached;
    if (res.error) error.value = res.error;
  } finally {
    loading.value = false;
  }
}

async function refresh() {
  loading.value = true;
  error.value = null;
  try {
    const res = await regenerateDailyBrief(country.value, settings.state.contentLevel);
    brief.value = res.text;
    cached.value = res.cached;
    if (res.error) error.value = res.error;
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  markSeenToday();
  await load();
});

const goToCountry = () => router.push(`/country/${country.value.iso3}`);
const goToGlobe = () => router.push('/globe');

// 大字国旗在小屏上太挤，放一个动态 size
const flagSize = computed(() => 'clamp(80px, 18vw, 220px)');
</script>

<template>
  <div class="daily-page">
    <!-- 角标 -->
    <div class="daily-corner">
      <span class="daily-mark mono">NAT/GEO · {{ ymd }}</span>
    </div>

    <!-- 主体 -->
    <main class="daily-main">
      <header class="daily-header">
        <p class="daily-eyebrow mono">今日聚焦 · DAILY FEATURE</p>
        <div class="daily-flag" :style="{ fontSize: flagSize }">{{ country.flag }}</div>
        <h1 class="daily-name-en">{{ country.nameEn }}</h1>
        <h2 class="daily-name-zh title-cn">{{ country.nameZh }}</h2>
        <p class="daily-meta mono">
          {{ country.confederation }} · Group {{ country.group }}
          <span v-if="country.isHost"> · 东道主 HOST</span>
        </p>
      </header>

      <div class="daily-divider">
        <span class="divider-dot">◆</span>
      </div>

      <section class="daily-brief">
        <p v-if="loading" class="brief-loading mono">裁判 LLM 撰写中…</p>
        <p v-else-if="error" class="brief-error mono">
          ⚠ {{ error }}<br />
          <span class="brief-error-hint">去 /settings 配 Provider，刷新后重试。</span>
        </p>
        <p v-else-if="brief" class="brief-text title-cn">{{ brief }}</p>
        <p v-else class="brief-empty mono">（无内容）</p>

        <p v-if="!loading && cached" class="brief-cached mono">
          缓存命中 · 同日不重复调 LLM
        </p>
      </section>

      <footer class="daily-actions">
        <button class="daily-btn daily-btn-primary mono" @click="goToCountry">
          看 {{ country.nameZh }} 详情 →
        </button>
        <button class="daily-btn mono" @click="goToGlobe">进入主地图</button>
        <button
          class="daily-btn daily-btn-ghost mono"
          :disabled="loading"
          @click="refresh"
        >
          ↻ 重新生成
        </button>
      </footer>
    </main>
  </div>
</template>

<style scoped>
.daily-page {
  position: relative;
  min-height: calc(100vh - 64px);
  background: radial-gradient(
      ellipse at 50% 30%,
      #1a1a2e 0%,
      #0a0a18 60%,
      #000000 100%
    );
  color: var(--bg-parchment);
  padding: var(--space-6) var(--space-5);
  overflow: hidden;
}
/* 模拟胶片颗粒 + 微弱金线辉光 */
.daily-page::before {
  content: '';
  position: absolute;
  inset: 0;
  background:
    repeating-linear-gradient(
      0deg,
      rgba(212, 160, 23, 0.02) 0px,
      rgba(212, 160, 23, 0.02) 1px,
      transparent 1px,
      transparent 3px
    ),
    radial-gradient(
      ellipse at 50% 50%,
      transparent 40%,
      rgba(0, 0, 0, 0.5) 100%
    );
  pointer-events: none;
}

.daily-corner {
  position: absolute;
  top: var(--space-4);
  right: var(--space-5);
  z-index: 2;
}
.daily-mark {
  font-size: 10px;
  letter-spacing: 0.2em;
  color: var(--accent-gold);
  padding: 4px 10px;
  border: 1px solid var(--accent-gold);
  border-radius: 2px;
}

.daily-main {
  position: relative;
  z-index: 1;
  max-width: 720px;
  margin: 0 auto;
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  padding-top: var(--space-5);
}

.daily-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
}
.daily-eyebrow {
  font-size: 11px;
  letter-spacing: 0.3em;
  color: var(--accent-gold);
  text-transform: uppercase;
}
.daily-flag {
  line-height: 1;
  filter: drop-shadow(0 4px 12px rgba(212, 160, 23, 0.3));
  margin: var(--space-3) 0;
}
.daily-name-en {
  font-family: var(--font-title);
  font-size: clamp(28px, 5vw, 56px);
  font-weight: 700;
  letter-spacing: 0.12em;
  color: var(--bg-parchment);
  margin: 0;
  text-transform: uppercase;
  /* 1px 金线描边致敬 NatGeo */
  text-shadow:
    0 0 1px var(--accent-gold),
    0 2px 8px rgba(0, 0, 0, 0.5);
}
.daily-name-zh {
  font-family: var(--font-serif-cn);
  font-size: clamp(20px, 3vw, 28px);
  font-weight: 700;
  color: var(--accent-gold);
  margin: 0;
  letter-spacing: 0.15em;
}
.daily-meta {
  font-size: 11px;
  color: var(--text-tertiary);
  letter-spacing: 0.15em;
  margin-top: var(--space-2);
}

.daily-divider {
  position: relative;
  width: 100%;
  text-align: center;
}
.daily-divider::before,
.daily-divider::after {
  content: '';
  position: absolute;
  top: 50%;
  width: 40%;
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent 0%,
    var(--accent-gold) 50%,
    transparent 100%
  );
  opacity: 0.5;
}
.daily-divider::before { left: 0; }
.daily-divider::after { right: 0; }
.divider-dot {
  color: var(--accent-gold);
  font-size: 12px;
  background: transparent;
  position: relative;
  z-index: 1;
}

.daily-brief {
  padding: var(--space-5) var(--space-4);
  background: rgba(212, 160, 23, 0.04);
  border-left: 2px solid var(--accent-gold);
  border-right: 2px solid var(--accent-gold);
  text-align: left;
}
.brief-text {
  font-family: var(--font-serif-cn);
  font-size: clamp(15px, 1.6vw, 17px);
  line-height: 1.85;
  color: var(--bg-parchment);
  margin: 0;
  /* 段首缩进，模拟 NatGeo 杂志正文 */
  text-indent: 2em;
}
.brief-loading,
.brief-error,
.brief-empty,
.brief-cached {
  text-align: center;
  font-size: 12px;
  color: var(--text-tertiary);
  letter-spacing: 0.08em;
}
.brief-error {
  color: var(--accent-blood);
}
.brief-error-hint {
  font-size: 10px;
  color: var(--text-tertiary);
}
.brief-cached {
  margin-top: var(--space-3);
  color: var(--accent-gold);
  opacity: 0.5;
  font-size: 10px;
}
.brief-loading {
  animation: pulse 1.4s ease-in-out infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 1; }
}

.daily-actions {
  display: flex;
  justify-content: center;
  gap: var(--space-3);
  flex-wrap: wrap;
  margin-top: var(--space-5);
}
.daily-btn {
  padding: 10px 22px;
  background: transparent;
  border: 1px solid var(--accent-gold);
  color: var(--accent-gold);
  border-radius: var(--radius-sm);
  font-size: 12px;
  letter-spacing: 0.12em;
  cursor: pointer;
  transition: all 0.2s ease;
  font-family: var(--font-mono);
  text-transform: uppercase;
}
.daily-btn:hover:not(:disabled) {
  background: var(--accent-gold);
  color: var(--accent-deep);
}
.daily-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.daily-btn-primary {
  background: var(--accent-gold);
  color: var(--accent-deep);
}
.daily-btn-primary:hover:not(:disabled) {
  background: var(--bg-parchment);
  border-color: var(--bg-parchment);
}
.daily-btn-ghost {
  border-color: var(--text-tertiary);
  color: var(--text-tertiary);
}
.daily-btn-ghost:hover:not(:disabled) {
  background: var(--text-tertiary);
  color: var(--accent-deep);
}
</style>
