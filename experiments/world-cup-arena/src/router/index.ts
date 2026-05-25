import { createRouter, createWebHashHistory, RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/globe' },
  {
    path: '/globe',
    name: 'globe',
    component: () => import('../views/Globe.vue'),
    meta: { title: '世界地图' },
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('../views/Settings.vue'),
    meta: { title: '设置' },
  },
  {
    path: '/country/:id',
    name: 'country',
    component: () => import('../views/PlaceholderView.vue'),
    props: (route) => ({ pageName: `国家 · ${route.params.id}`, stage: 2 }),
    meta: { title: '国家详情' },
  },
  {
    path: '/battle',
    name: 'battle',
    component: () => import('../views/PlaceholderView.vue'),
    props: { pageName: '文化对战', stage: 2 },
    meta: { title: '对战' },
  },
  {
    path: '/wall',
    name: 'wall',
    component: () => import('../views/PlaceholderView.vue'),
    props: { pageName: '裁判金句墙', stage: 3 },
    meta: { title: '金句墙' },
  },
  {
    path: '/daily',
    name: 'daily',
    component: () => import('../views/PlaceholderView.vue'),
    props: { pageName: '今日聚焦国家', stage: 3 },
    meta: { title: '今日 NatGeo' },
  },
  { path: '/:pathMatch(.*)*', redirect: '/globe' },
];

const router = createRouter({
  // hash 路由：dist 直接打开 file:// 或子路径部署都能跑
  history: createWebHashHistory(),
  routes,
});

router.afterEach((to) => {
  if (to.meta?.title) {
    document.title = `${to.meta.title} · World Cup Arena`;
  }
});

export default router;
