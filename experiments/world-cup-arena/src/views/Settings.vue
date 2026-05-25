<script setup lang="ts">
import { ref, reactive } from 'vue';
import { useSettingsStore } from '@/stores/settings';
import { PROVIDERS, type ProviderId, type PingResult } from '@/services/llmProviders';

const settings = useSettingsStore();

// 每个 provider 的 ping 状态
const pingState = reactive<Record<ProviderId, { loading: boolean; result?: PingResult }>>(
  {} as any
);
for (const p of PROVIDERS) pingState[p.id] = { loading: false };

async function testProvider(id: ProviderId) {
  pingState[id].loading = true;
  pingState[id].result = undefined;
  try {
    const provider = PROVIDERS.find((p) => p.id === id)!;
    const result = await provider.ping(settings.state.providers[id]);
    pingState[id].result = result;
  } catch (e: any) {
    pingState[id].result = { ok: false, latencyMs: 0, error: e?.message || '未知错误' };
  } finally {
    pingState[id].loading = false;
  }
}

function maskKey(key?: string): string {
  if (!key) return '';
  if (key.length <= 12) return '*'.repeat(key.length);
  return `${key.slice(0, 6)}${'*'.repeat(Math.min(20, key.length - 10))}${key.slice(-4)}`;
}

const revealKey = ref<Record<ProviderId, boolean>>({} as any);
for (const p of PROVIDERS) revealKey.value[p.id] = false;

function onReset() {
  if (confirm('确定重置所有设置？所有 API Key 会被清空。')) {
    settings.reset();
    for (const p of PROVIDERS) pingState[p.id] = { loading: false };
  }
}
</script>

<template>
  <div class="settings-page">
    <header class="settings-header">
      <h1 class="title-natgeo settings-title">Settings</h1>
      <p class="settings-sub title-cn">配置 LLM Provider · 内容尺度 · 音效</p>
    </header>

    <!-- 当前 Provider 切换 -->
    <section class="nat-card settings-section">
      <h2 class="section-title">当前 Provider</h2>
      <div class="row">
        <label class="row-label">活动 Provider</label>
        <select
          class="nat-select"
          :value="settings.state.activeProvider"
          @change="settings.setActive(($event.target as HTMLSelectElement).value as ProviderId)"
        >
          <option v-for="p in PROVIDERS" :key="p.id" :value="p.id">{{ p.displayName }}</option>
        </select>
      </div>
    </section>

    <!-- 各 provider 详细配置 -->
    <section v-for="p in PROVIDERS" :key="p.id" class="nat-card settings-section">
      <div class="provider-header">
        <h2 class="section-title">
          {{ p.displayName }}
          <span v-if="settings.state.activeProvider === p.id" class="active-badge">使用中</span>
          <span v-if="!p.requiresApiKey" class="info-badge">无需 Key</span>
        </h2>
      </div>

      <div class="row">
        <label class="row-label">Base URL</label>
        <input
          class="nat-input"
          type="text"
          :value="settings.state.providers[p.id].baseUrl"
          :placeholder="p.defaultBaseUrl"
          @input="settings.updateProviderConfig(p.id, { baseUrl: ($event.target as HTMLInputElement).value })"
        />
      </div>

      <div v-if="p.requiresApiKey" class="row">
        <label class="row-label">API Key</label>
        <div class="key-row">
          <input
            class="nat-input key-input"
            :type="revealKey[p.id] ? 'text' : 'password'"
            :value="
              revealKey[p.id]
                ? settings.state.providers[p.id].apiKey
                : maskKey(settings.state.providers[p.id].apiKey)
            "
            placeholder="sk-..."
            @focus="revealKey[p.id] = true"
            @blur="revealKey[p.id] = false"
            @input="settings.updateProviderConfig(p.id, { apiKey: ($event.target as HTMLInputElement).value })"
          />
          <button
            class="nat-btn key-toggle"
            type="button"
            @click="revealKey[p.id] = !revealKey[p.id]"
          >
            {{ revealKey[p.id] ? '隐藏' : '显示' }}
          </button>
        </div>
      </div>

      <div class="row">
        <label class="row-label">Model</label>
        <input
          class="nat-input"
          type="text"
          list="suggested-models-${p.id}"
          :value="settings.state.providers[p.id].model"
          :placeholder="p.defaultModel"
          @input="settings.updateProviderConfig(p.id, { model: ($event.target as HTMLInputElement).value })"
        />
        <datalist :id="`suggested-models-${p.id}`">
          <option v-for="m in p.suggestedModels" :key="m" :value="m" />
        </datalist>
      </div>

      <div class="ping-row">
        <button class="nat-btn nat-btn-gold" :disabled="pingState[p.id].loading" @click="testProvider(p.id)">
          {{ pingState[p.id].loading ? '测试中…' : '测试连接' }}
        </button>
        <span v-if="pingState[p.id].result" class="ping-result">
          <span v-if="pingState[p.id].result!.ok" class="ping-ok mono">
            ✓ {{ pingState[p.id].result!.latencyMs.toFixed(0) }} ms
            <span v-if="pingState[p.id].result!.models?.length" class="ping-models">
              · {{ pingState[p.id].result!.models!.length }} 个模型可用
            </span>
          </span>
          <span v-else class="ping-err mono">✗ {{ pingState[p.id].result!.error }}</span>
        </span>
      </div>
    </section>

    <!-- 通用设置 -->
    <section class="nat-card settings-section">
      <h2 class="section-title">通用</h2>

      <div class="row">
        <label class="row-label">裁判 Temperature</label>
        <input
          class="nat-input mono small-input"
          type="number"
          min="0"
          max="1.5"
          step="0.05"
          v-model.number="settings.state.refereeTemperature"
        />
      </div>

      <div class="row">
        <label class="row-label">内容尺度</label>
        <div class="seg-control">
          <label
            v-for="lvl in (['PG', 'R', 'X'] as const)"
            :key="lvl"
            class="seg-option"
            :class="{ 'is-active': settings.state.contentLevel === lvl }"
          >
            <input
              type="radio"
              name="contentLevel"
              :value="lvl"
              v-model="settings.state.contentLevel"
            />
            <span class="seg-mark">{{ lvl }}</span>
            <span class="seg-desc">
              {{ lvl === 'PG' ? '安全' : lvl === 'R' ? '暗黑' : '无下限' }}
            </span>
          </label>
        </div>
      </div>

      <div class="row">
        <label class="row-label">音效</label>
        <label class="checkbox">
          <input type="checkbox" v-model="settings.state.audioEnabled" />
          <span>启用各国 ambient 音乐（阶段 3 接入）</span>
        </label>
      </div>
    </section>

    <!-- 操作 -->
    <section class="settings-actions">
      <button class="nat-btn" @click="settings.clearAllKeys()">清空所有 Key</button>
      <button class="nat-btn" @click="onReset">重置</button>
      <span class="storage-note mono">配置自动保存在 localStorage</span>
    </section>
  </div>
</template>

<style scoped>
.settings-page {
  max-width: 760px;
  margin: 0 auto;
  padding: var(--space-6) var(--space-5) 120px;
}

.settings-header {
  margin-bottom: var(--space-6);
  padding-bottom: var(--space-4);
  border-bottom: 1px solid var(--accent-gold);
}
.settings-title {
  font-size: 32px;
}
.settings-sub {
  color: var(--text-secondary);
  font-size: 13px;
  margin-top: var(--space-2);
}

.settings-section {
  padding: var(--space-5);
  margin-bottom: var(--space-4);
}
.section-title {
  font-family: var(--font-title);
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--accent-deep);
  margin-bottom: var(--space-4);
  padding-bottom: var(--space-2);
  border-bottom: 1px solid var(--border-thin);
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

.provider-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.active-badge {
  display: inline-block;
  padding: 1px 8px;
  font-family: var(--font-mono);
  font-size: 10px;
  letter-spacing: 0.06em;
  color: var(--accent-deep);
  background: var(--accent-gold);
  border-radius: var(--radius-sm);
  text-transform: none;
}

.info-badge {
  display: inline-block;
  padding: 1px 8px;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--text-secondary);
  border: 1px solid var(--border-thin);
  border-radius: var(--radius-sm);
  text-transform: none;
}

.row {
  display: grid;
  grid-template-columns: 140px 1fr;
  align-items: center;
  gap: var(--space-4);
  margin-bottom: var(--space-3);
}
.row-label {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--text-secondary);
  letter-spacing: 0.04em;
}

.key-row {
  display: flex;
  gap: var(--space-2);
}
.key-input {
  flex: 1;
}
.key-toggle {
  flex-shrink: 0;
  padding: 6px 12px;
  font-size: 11px;
}

.small-input {
  max-width: 100px;
}

.ping-row {
  margin-top: var(--space-3);
  padding-top: var(--space-3);
  border-top: 1px dashed var(--border-thin);
  display: flex;
  align-items: center;
  gap: var(--space-4);
  flex-wrap: wrap;
}
.ping-result {
  font-size: 13px;
}
.ping-ok {
  color: var(--text-ok);
}
.ping-err {
  color: var(--text-error);
}
.ping-models {
  color: var(--text-tertiary);
  font-size: 11px;
}

.seg-control {
  display: flex;
  gap: 0;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  overflow: hidden;
  width: fit-content;
}
.seg-option {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 18px;
  background: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  border-right: 1px solid var(--border-thin);
  transition: all 0.15s ease;
}
.seg-option:last-child {
  border-right: none;
}
.seg-option input {
  display: none;
}
.seg-option.is-active {
  background: var(--accent-deep);
  color: var(--text-on-deep);
}
.seg-mark {
  font-family: var(--font-title);
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 0.08em;
}
.seg-desc {
  font-size: 11px;
  margin-top: 2px;
  font-family: var(--font-serif-cn);
  opacity: 0.85;
}

.checkbox {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.settings-actions {
  margin-top: var(--space-6);
  display: flex;
  gap: var(--space-3);
  align-items: center;
}
.storage-note {
  margin-left: auto;
  font-size: 11px;
  color: var(--text-tertiary);
}
</style>
