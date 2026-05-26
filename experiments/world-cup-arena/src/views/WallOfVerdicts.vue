<script setup lang="ts">
/**
 * 裁判金句墙：/wall
 *
 * 数据：Dexie `verdicts` 表（按 savedAt 倒序）
 *
 * Tab：
 *   - 全部     — 所有金句
 *   - 最近 7 天 — savedAt >= now - 7d
 *   - 传奇出场 — 含 rarity='legendary' 卡的回合
 *
 * 右上搜索框：按关键字过滤 verdict / funFact / 卡名
 * 每条右上删除按钮：确认后从 Dexie 删
 * 空状态引导去 /match-picker 打几局
 */

import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
  queryVerdicts,
  queryLegendaryVerdicts,
  deleteVerdict,
  type SavedVerdict,
} from '@/services/db';
import { COUNTRY_BY_ISO3 } from '@/data/countries';

const router = useRouter();

type TabKey = 'all' | 'recent' | 'legendary';
const tab = ref<TabKey>('all');

const search = ref('');
const loading = ref(true);
const error = ref<string | null>(null);
const items = ref<SavedVerdict[]>([]);
const counts = ref({ all: 0, recent: 0, legendary: 0 });

async function refresh() {
  loading.value = true;
  try {
    const all = await queryVerdicts({});
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recent = all.filter((v) => v.savedAt >= sevenDaysAgo);
    const legendary = await queryLegendaryVerdicts();
    counts.value = {
      all: all.length,
      recent: recent.length,
      legendary: legendary.length,
    };
    if (tab.value === 'recent') items.value = recent;
    else if (tab.value === 'legendary') items.value = legendary;
    else items.value = all;
  } catch (e: any) {
    error.value = e?.message || '读取金句失败';
  } finally {
    loading.value = false;
  }
}

watch(tab, refresh);

onMounted(refresh);

const visible = computed(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) return items.value;
  return items.value.filter(
    (v) =>
      v.verdict.toLowerCase().includes(q) ||
      v.funFact.toLowerCase().includes(q) ||
      v.aCardName.toLowerCase().includes(q) ||
      v.bCardName.toLowerCase().includes(q)
  );
});

function flagOf(iso3: string): string {
  return COUNTRY_BY_ISO3[iso3]?.flag || '🏳️';
}
function nameOf(iso3: string): string {
  return COUNTRY_BY_ISO3[iso3]?.nameZh || iso3;
}

async function onDelete(v: SavedVerdict) {
  if (!v.id) return;
  if (!confirm(`删除这条金句？\n\n"${v.verdict.slice(0, 60)}…"`)) return;
  try {
    await deleteVerdict(v.id);
    await refresh();
  } catch (e) {
    alert('删除失败：' + (e as any)?.message);
  }
}

function fmtDate(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const isEmpty = computed(() => !loading.value && visible.value.length === 0);
</script>

<template>
  <div class="wall-page">
    <header class="wall-header">
      <h1 class="title-natgeo">裁判金句墙</h1>
      <p class="wall-sub">
        每局裁判评分的犀利结论与冷知识，自动入库。<br />
        <span class="wall-sub-hint">这是你的"世界杯文化笔记"。</span>
      </p>
    </header>

    <div class="wall-controls">
      <div class="wall-tabs mono">
        <button
          v-for="t in (['all', 'recent', 'legendary'] as const)"
          :key="t"
          class="tab-btn"
          :class="{ 'is-active': tab === t }"
          @click="tab = t"
        >
          {{
            t === 'all' ? '全部' : t === 'recent' ? '最近 7 天' : '传奇出场'
          }}
          <span class="tab-count">{{ counts[t] }}</span>
        </button>
      </div>

      <div class="wall-search">
        <input
          v-model="search"
          class="search-input mono"
          placeholder="搜索金句 / 冷知识 / 卡名…"
          type="search"
        />
      </div>
    </div>

    <div v-if="loading" class="wall-loading mono">读取金句中…</div>
    <div v-else-if="error" class="wall-error mono">⚠ {{ error }}</div>

    <div v-else-if="isEmpty" class="wall-empty">
      <p class="empty-line title-cn">
        {{ counts.all === 0 ? '还没有金句' : '当前筛选下没有结果' }}
      </p>
      <p class="empty-hint mono">
        {{
          counts.all === 0
            ? '去 /match-picker 打几局，每回合的裁判金句会自动入库。'
            : '换个 tab 或者清空搜索试试。'
        }}
      </p>
      <button
        v-if="counts.all === 0"
        class="nat-btn nat-btn-gold"
        @click="router.push('/match-picker')"
      >
        ⚔ 去对战
      </button>
    </div>

    <ul v-else class="wall-list">
      <li v-for="v in visible" :key="v.id" class="wall-card nat-card">
        <button
          class="card-delete"
          title="删除这条金句"
          @click="onDelete(v)"
        >
          ✕
        </button>

        <div class="card-header">
          <div class="card-flags">
            <span class="card-flag">{{ flagOf(v.aIso3) }}</span>
            <span class="card-vs mono">VS</span>
            <span class="card-flag">{{ flagOf(v.bIso3) }}</span>
          </div>
          <div class="card-cards title-cn">
            <span class="card-name">{{ v.aCardName }}</span>
            <span class="card-name-sep">·</span>
            <span class="card-name">{{ v.bCardName }}</span>
          </div>
          <div class="card-context mono">
            {{ nameOf(v.aIso3) }} 对 {{ nameOf(v.bIso3) }} · 第 {{ v.roundIndex + 1 }} 回合
          </div>
        </div>

        <blockquote class="card-verdict title-cn">"{{ v.verdict }}"</blockquote>

        <p class="card-funfact">💡 {{ v.funFact }}</p>

        <div class="card-tags mono">
          <span class="tag tag-date">{{ fmtDate(v.savedAt) }}</span>
          <span class="tag tag-level">{{ v.contentLevel.toUpperCase() }}</span>
        </div>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.wall-page {
  max-width: 980px;
  margin: 0 auto;
  padding: var(--space-5) var(--space-5) var(--space-7);
}

.wall-header {
  text-align: center;
  margin-bottom: var(--space-5);
}
.wall-header h1 {
  font-size: 28px;
  margin-bottom: var(--space-2);
}
.wall-sub {
  font-family: var(--font-serif-cn);
  color: var(--text-secondary);
  font-size: 14px;
}
.wall-sub-hint {
  color: var(--text-tertiary);
  font-size: 12px;
}

.wall-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-4);
  justify-content: space-between;
  margin-bottom: var(--space-4);
  border-bottom: 1px solid var(--border-thin);
  padding-bottom: var(--space-3);
}
.wall-tabs {
  display: flex;
  gap: var(--space-2);
}
.tab-btn {
  padding: 8px 18px;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  color: var(--text-secondary);
  font-size: 12px;
  letter-spacing: 0.08em;
  transition: all 0.15s;
}
.tab-btn:hover {
  color: var(--accent-deep);
}
.tab-btn.is-active {
  color: var(--accent-deep);
  border-bottom-color: var(--accent-gold);
}
.tab-count {
  display: inline-block;
  margin-left: 6px;
  font-size: 10px;
  padding: 1px 6px;
  background: var(--accent-gold);
  color: var(--accent-deep);
  border-radius: 8px;
}

.search-input {
  padding: 6px 12px;
  background: var(--bg-parchment);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  font-size: 12px;
  color: var(--text-primary);
  min-width: 220px;
  font-family: var(--font-mono);
}
.search-input:focus {
  outline: none;
  border-color: var(--accent-gold);
}

.wall-loading,
.wall-error,
.wall-empty {
  text-align: center;
  padding: var(--space-7) 0;
  color: var(--text-tertiary);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  align-items: center;
}
.wall-error { color: var(--text-error); }
.empty-line {
  font-size: 18px;
  color: var(--text-secondary);
}
.empty-hint {
  font-size: 12px;
  color: var(--text-tertiary);
}

.wall-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
  gap: var(--space-4);
}

.wall-card {
  position: relative;
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  background: var(--bg-parchment);
  border: 1px solid var(--accent-gold);
  border-radius: var(--radius-md);
  transition: transform 0.15s, box-shadow 0.15s;
}
.wall-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-elevated);
}

.card-delete {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 24px;
  height: 24px;
  background: transparent;
  border: 1px solid var(--text-tertiary);
  color: var(--text-tertiary);
  border-radius: 50%;
  cursor: pointer;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
  font-family: var(--font-mono);
  line-height: 1;
}
.card-delete:hover {
  background: var(--accent-blood);
  color: var(--bg-parchment);
  border-color: var(--accent-blood);
}

.card-header {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-right: 32px;
}
.card-flags {
  display: flex;
  align-items: center;
  gap: 8px;
}
.card-flag {
  font-size: 22px;
  line-height: 1;
}
.card-vs {
  font-size: 10px;
  letter-spacing: 0.1em;
  color: var(--accent-gold);
}
.card-cards {
  font-size: 13px;
  color: var(--accent-deep);
  font-weight: 600;
}
.card-name-sep {
  color: var(--text-tertiary);
  margin: 0 6px;
}
.card-context {
  font-size: 10px;
  color: var(--text-tertiary);
  letter-spacing: 0.04em;
}

.card-verdict {
  font-family: var(--font-serif-cn);
  font-size: 17px;
  line-height: 1.55;
  color: var(--accent-deep);
  margin: 0;
  padding: var(--space-3) 0;
  border-top: 1px dashed var(--border-thin);
  border-bottom: 1px dashed var(--border-thin);
  font-style: italic;
}

.card-funfact {
  font-family: var(--font-serif-cn);
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.6;
  padding: 6px 10px;
  background: rgba(212, 160, 23, 0.08);
  border-left: 2px solid var(--accent-gold);
  margin: 0;
}

.card-tags {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.tag {
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 2px;
  letter-spacing: 0.06em;
}
.tag-date {
  background: rgba(42, 36, 25, 0.08);
  color: var(--text-secondary);
}
.tag-level {
  background: var(--accent-deep);
  color: var(--bg-parchment);
}
</style>
