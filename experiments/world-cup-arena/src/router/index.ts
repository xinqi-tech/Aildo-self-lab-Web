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
    path: '/country/:iso3',
    name: 'country',
    component: () => import('../views/CountryDetail.vue'),
    props: true,
    meta: { title: '国家详情' },
  },
  {
    path: '/match-picker',
    name: 'matchPicker',
    component: () => import('../views/MatchPicker.vue'),
    meta: { title: '选择对战' },
  },
  {
    path: '/battle',
    name: 'battle',
    // 缺 query 时回选场次
    beforeEnter: (to) => {
      if (!to.query.matchId || !to.query.side) {
        return { path: '/match-picker' };
      }
      return true;
    },
    component: () => import('../views/Battle.vue'),
    meta: { title: '文化对战' },
  },
  {
    path: '/battle/result/:id',
    name: 'battleResult',
    component: () => import('../views/BattleResult.vue'),
    props: true,
    meta: { title: '对战结果' },
  },
  {
    path: '/spectator',
    name: 'spectator',
    component: () => import('../views/Spectator.vue'),
    meta: { title: 'AI 观战' },
  },
  {
    path: '/wall',
    name: 'wall',
    component: () => import('../views/WallOfVerdicts.vue'),
    meta: { title: '金句墙' },
  },
  {
    path: '/daily',
    name: 'daily',
    component: () => import('../views/DailyFeature.vue'),
    meta: { title: '今日 NatGeo' },
  },
  {
    path: '/tournament',
    name: 'tournamentList',
    component: () => import('../views/TournamentList.vue'),
    meta: { title: '锦标赛存档' },
  },
  {
    path: '/tournament/new',
    name: 'tournamentNew',
    component: () => import('../views/TournamentSetup.vue'),
    meta: { title: '新建锦标赛' },
  },
  {
    path: '/tournament/:id',
    name: 'tournamentView',
    component: () => import('../views/TournamentView.vue'),
    props: true,
    meta: { title: '锦标赛' },
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
