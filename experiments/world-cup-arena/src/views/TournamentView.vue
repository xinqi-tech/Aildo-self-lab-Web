<script setup lang="ts">
/**
 * 锦标赛主页占位（下一 commit 实装）
 */
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { getTournament, type Tournament } from '@/services/tournamentDb';

const route = useRoute();
const router = useRouter();
const tournament = ref<Tournament | null>(null);
const loading = ref(true);

onMounted(async () => {
  const id = Number(route.params.id);
  if (!Number.isFinite(id)) {
    router.replace('/tournament');
    return;
  }
  const t = await getTournament(id);
  if (!t) {
    router.replace('/tournament');
    return;
  }
  tournament.value = t;
  loading.value = false;
});
</script>

<template>
  <div class="tv-page">
    <div v-if="loading" class="loading mono">读取存档…</div>
    <div v-else-if="tournament" class="placeholder">
      <h1>{{ tournament.name }}</h1>
      <p class="mono">存档已加载（{{ tournament.matches.length }} 场）— 主页 UI 下一步实装</p>
      <button class="nat-btn" @click="router.push('/tournament')">← 返回存档列表</button>
    </div>
  </div>
</template>

<style scoped>
.tv-page {
  max-width: 960px;
  margin: 0 auto;
  padding: var(--space-5);
  text-align: center;
}
.loading {
  color: var(--text-tertiary);
  padding: var(--space-7);
}
.placeholder {
  padding: var(--space-7) var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  align-items: center;
}
.nat-btn {
  font-family: var(--font-title);
  letter-spacing: 0.1em;
  font-size: 12px;
  padding: 8px 16px;
  border-radius: 2px;
  cursor: pointer;
  background: var(--accent-gold);
  color: var(--accent-deep);
  border: 1px solid var(--accent-gold);
}
</style>
