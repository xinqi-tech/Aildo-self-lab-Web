<script setup lang="ts">
import { RouterLink } from 'vue-router';
</script>

<template>
  <header class="app-header">
    <div class="brand">
      <RouterLink to="/globe" class="brand-link">
        <span class="brand-mark">⚽</span>
        <span class="brand-text">
          <span class="brand-title">World Cup Arena</span>
          <span class="brand-sub">世界杯文化对战 · 2026</span>
        </span>
      </RouterLink>
    </div>

    <nav class="nav">
      <RouterLink to="/globe" class="nav-link" active-class="is-active">地图</RouterLink>
      <RouterLink to="/match-picker" class="nav-link" active-class="is-active">对战</RouterLink>
      <span class="nav-divider" aria-hidden="true">·</span>
      <RouterLink
        to="/daily"
        class="nav-link nav-link-feature"
        active-class="is-active"
        title="今日聚焦国家 — NatGeo 开屏"
      >
        <span class="nav-icon">🌅</span> 今日
      </RouterLink>
      <RouterLink
        to="/wall"
        class="nav-link nav-link-feature"
        active-class="is-active"
        title="裁判金句墙 — 你的文化笔记"
      >
        <span class="nav-icon">📜</span> 金句墙
      </RouterLink>
      <RouterLink
        to="/spectator"
        class="nav-link nav-link-feature"
        active-class="is-active"
        title="AI vs AI 观战模式"
      >
        <span class="nav-icon">👁</span> 观战
      </RouterLink>
      <span class="nav-divider" aria-hidden="true">·</span>
      <RouterLink to="/settings" class="nav-link nav-link-icon" active-class="is-active">
        ⚙ 设置
      </RouterLink>
    </nav>
  </header>
</template>

<style scoped>
.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 28px;
  border-bottom: 1px solid var(--accent-gold);
  background: linear-gradient(
    180deg,
    rgba(244, 232, 208, 0.96) 0%,
    rgba(244, 232, 208, 0.85) 100%
  );
  backdrop-filter: blur(6px);
  position: sticky;
  top: 0;
  z-index: 10;
}

.brand-link {
  display: flex;
  align-items: center;
  gap: 12px;
  color: inherit;
}

.brand-mark {
  font-size: 22px;
  line-height: 1;
}

.brand-text {
  display: flex;
  flex-direction: column;
}

.brand-title {
  font-family: var(--font-title);
  font-size: 17px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--accent-deep);
}

.brand-sub {
  font-family: var(--font-serif-cn);
  font-size: 10.5px;
  color: var(--text-secondary);
  letter-spacing: 0.1em;
  margin-top: 1px;
}

.nav {
  display: flex;
  align-items: center;
  gap: 4px;
}

.nav-link {
  padding: 6px 14px;
  font-family: var(--font-title);
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-secondary);
  border-radius: var(--radius-sm);
  transition: all 0.15s ease;
}

.nav-link:hover {
  color: var(--accent-deep);
  background: rgba(212, 160, 23, 0.12);
}

.nav-link.is-active {
  color: var(--accent-deep);
  background: rgba(212, 160, 23, 0.22);
  border-bottom: 2px solid var(--accent-gold);
  border-radius: var(--radius-sm) var(--radius-sm) 0 0;
}

.nav-link-icon {
  font-family: var(--font-body);
  font-weight: 600;
}

.nav-divider {
  color: var(--text-tertiary);
  opacity: 0.4;
  user-select: none;
  margin: 0 2px;
}

.nav-link-feature {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.nav-icon {
  font-size: 13px;
  line-height: 1;
}
</style>
