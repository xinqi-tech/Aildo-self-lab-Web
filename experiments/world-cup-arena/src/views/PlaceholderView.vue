<script setup lang="ts">
import { defineProps } from 'vue';

defineProps<{
  pageName: string;
  stage: number;
}>();
</script>

<template>
  <div class="placeholder">
    <div class="placeholder-inner nat-card">
      <div class="stage-tag">阶段 {{ stage }}</div>
      <h2 class="title-natgeo placeholder-title">{{ pageName }}</h2>
      <p class="placeholder-desc">该页面将在阶段 {{ stage }} 完成。</p>
      <hr class="nat-divider" />
      <p class="placeholder-back"><router-link to="/globe">← 返回世界地图</router-link></p>
    </div>
  </div>
</template>

<style scoped>
.placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: calc(100vh - 200px);
  padding: var(--space-6);
}
.placeholder-inner {
  max-width: 480px;
  padding: var(--space-6);
  text-align: center;
}
.stage-tag {
  display: inline-block;
  padding: 2px 10px;
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  background: var(--accent-gold);
  color: var(--accent-deep);
  border-radius: var(--radius-sm);
  margin-bottom: var(--space-3);
}
.placeholder-title {
  font-size: 26px;
  margin-bottom: var(--space-3);
}
.placeholder-desc {
  color: var(--text-secondary);
  font-family: var(--font-serif-cn);
}
.placeholder-back {
  margin-top: var(--space-4);
  font-size: 13px;
}
</style>
