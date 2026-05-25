<script setup lang="ts">
import AppHeader from './components/AppHeader.vue';
import ScheduleBanner from './components/ScheduleBanner.vue';
import { useRoute } from 'vue-router';
import { computed } from 'vue';

const route = useRoute();
// settings 页面不显示比赛 banner，节省视觉
const showBanner = computed(() => route.name !== 'settings');
</script>

<template>
  <div class="app-root">
    <AppHeader />
    <ScheduleBanner v-if="showBanner" />
    <main class="app-main">
      <router-view />
    </main>
  </div>
</template>

<style scoped>
.app-root {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.app-main {
  flex: 1;
  position: relative;
}
</style>
