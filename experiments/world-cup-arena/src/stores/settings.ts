import { defineStore } from 'pinia';
import { computed, reactive, watch } from 'vue';
import { PROVIDERS, getProvider, type ProviderConfig, type ProviderId } from '@/services/llmProviders';

const STORAGE_KEY = 'wca:settings:v1';

export type ContentLevel = 'PG' | 'R' | 'X';

export interface SettingsState {
  activeProvider: ProviderId;
  providers: Record<ProviderId, ProviderConfig>;
  refereeTemperature: number;
  /** 裁判 LLM 调用超时（毫秒）。本地 Ollama 8B 模型 Mac CPU 首次可能 60-90s */
  refereeTimeoutMs: number;
  contentLevel: ContentLevel; // 默认 X，无下限
  audioEnabled: boolean;
}

function defaultState(): SettingsState {
  return {
    activeProvider: 'ollama',
    providers: Object.fromEntries(
      PROVIDERS.map((p) => [
        p.id,
        {
          baseUrl: p.defaultBaseUrl,
          apiKey: '',
          model: p.defaultModel,
          extra: {},
        } as ProviderConfig,
      ])
    ) as Record<ProviderId, ProviderConfig>,
    refereeTemperature: 0.3,
    refereeTimeoutMs: 120_000, // 2 分钟，覆盖本地大模型冷启动
    contentLevel: 'X',
    audioEnabled: false,
  };
}

function loadFromStorage(): SettingsState {
  if (typeof localStorage === 'undefined') return defaultState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    // 浅合并，避免 schema 升级时丢失新字段默认值
    const def = defaultState();
    return {
      ...def,
      ...parsed,
      providers: {
        ...def.providers,
        ...(parsed.providers || {}),
      },
    };
  } catch (e) {
    console.warn('[settings] localStorage 解析失败，使用默认值', e);
    return defaultState();
  }
}

export const useSettingsStore = defineStore('settings', () => {
  const state = reactive<SettingsState>(loadFromStorage());

  // 持久化：state 变化 → localStorage
  watch(
    state,
    (val) => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(val));
      } catch (e) {
        console.warn('[settings] localStorage 写入失败', e);
      }
    },
    { deep: true }
  );

  const activeProviderConfig = computed(() => state.providers[state.activeProvider]);
  const activeProvider = computed(() => getProvider(state.activeProvider));

  function setActive(id: ProviderId) {
    state.activeProvider = id;
  }

  function updateProviderConfig(id: ProviderId, patch: Partial<ProviderConfig>) {
    state.providers[id] = { ...state.providers[id], ...patch };
  }

  function reset() {
    Object.assign(state, defaultState());
  }

  function clearAllKeys() {
    for (const id of Object.keys(state.providers) as ProviderId[]) {
      state.providers[id].apiKey = '';
    }
  }

  return {
    state,
    activeProvider,
    activeProviderConfig,
    setActive,
    updateProviderConfig,
    reset,
    clearAllKeys,
  };
});
