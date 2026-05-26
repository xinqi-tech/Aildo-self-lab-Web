<script setup lang="ts">
/**
 * 锦标赛主页：/tournament/:id
 *
 * - 顶部 banner：玩家国旗 + 名字 + 当前阶段 + 退出
 * - 小组赛阶段：玩家所在组积分榜 + 下一场 + 其他组进度（折叠）
 * - 淘汰赛阶段：bracket 图 + 下一场
 * - 已完成：大字结果 + 征程历史
 */
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  getTournament,
  saveTournament,
  type Tournament,
  type TournamentMatch,
  type GroupTableRow,
} from '@/services/tournamentDb';
import {
  stageLabel,
  stageLabelShort,
  playerGroupRank,
  getNextPlayerMatch,
  advanceTournament,
  playerSideOfMatch,
  resolveCountryOrPlaceholder,
} from '@/services/tournamentEngine';
import { COUNTRY_BY_ISO3, GROUPS } from '@/data/countries';

const route = useRoute();
const router = useRouter();
const tournament = ref<Tournament | null>(null);
const loading = ref(true);
const advancing = ref(false);

const showOtherGroups = ref(false);

const tournamentId = computed(() => Number(route.params.id));

async function load() {
  loading.value = true;
  const id = tournamentId.value;
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
}

onMounted(load);

const playerCountry = computed(() =>
  tournament.value ? COUNTRY_BY_ISO3[tournament.value.playerIso3] : undefined
);

const status = computed(() => tournament.value?.status ?? 'group');

const isGroupStage = computed(() => status.value === 'group');
const isKoStage = computed(() =>
  ['ro32', 'ro16', 'qf', 'sf', 'final'].includes(status.value)
);
const isFinished = computed(() => status.value === 'champion' || status.value === 'eliminated');

const groupRank = computed(() => {
  if (!tournament.value) return null;
  return playerGroupRank(tournament.value);
});

const nextMatch = computed<TournamentMatch | null>(() => {
  if (!tournament.value || isFinished.value) return null;
  return getNextPlayerMatch(tournament.value) ?? null;
});

const playerSideInNext = computed<'a' | 'b' | null>(() => {
  if (!nextMatch.value || !tournament.value) return null;
  return playerSideOfMatch(nextMatch.value, tournament.value.playerIso3);
});

const nextMatchOpponent = computed(() => {
  if (!nextMatch.value || !tournament.value) return null;
  const opp =
    nextMatch.value.aIso3 === tournament.value.playerIso3
      ? nextMatch.value.bIso3
      : nextMatch.value.aIso3;
  return COUNTRY_BY_ISO3[opp];
});

function goBattle() {
  if (!nextMatch.value || !tournament.value || !playerSideInNext.value) return;
  router.push({
    path: '/battle',
    query: {
      matchId: nextMatch.value.id,
      side: playerSideInNext.value,
      tournament: String(tournament.value.id),
      returnTo: `/tournament/${tournament.value.id}`,
    },
  });
}

function backToList() {
  router.push('/tournament');
}

function flagOf(iso3: string): string {
  return COUNTRY_BY_ISO3[iso3]?.flag ?? '🏳';
}

function nameOf(iso3: string): string {
  return COUNTRY_BY_ISO3[iso3]?.nameZh ?? iso3;
}

// 让玩家手动跳过本场（如果发现 advance 没跑完）
async function manualAdvance() {
  if (!tournament.value) return;
  advancing.value = true;
  try {
    advanceTournament(tournament.value);
    await saveTournament(tournament.value);
  } finally {
    advancing.value = false;
  }
}

// 其他 11 组状态
const otherGroups = computed(() => {
  if (!tournament.value || !playerCountry.value) return [];
  return GROUPS.filter((g) => g !== playerCountry.value!.group).map((g) => {
    const rows = [...(tournament.value!.groupTables[g] ?? [])].sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.diff !== a.diff) return b.diff - a.diff;
      return b.goalsFor - a.goalsFor;
    });
    return { g, rows };
  });
});

// 淘汰赛 bracket（按 stage 分列）
const bracket = computed(() => {
  if (!tournament.value) return null;
  const t = tournament.value;
  return {
    ro32: t.matches.filter((m) => m.stage === 'ro32'),
    ro16: t.matches.filter((m) => m.stage === 'ro16'),
    qf: t.matches.filter((m) => m.stage === 'qf'),
    sf: t.matches.filter((m) => m.stage === 'sf'),
    third: t.matches.find((m) => m.id === 'third'),
    final: t.matches.find((m) => m.id === 'final'),
  };
});

// 玩家征程历史的中文摘要
function stageLabelLong(stage: TournamentMatch['stage']): string {
  return stageLabelShort(stage);
}

const placementText = computed(() => {
  const p = tournament.value?.finalPlacement;
  if (!p) return '';
  if (p === 1) return '🏆 冠军';
  if (p === 2) return '🥈 亚军';
  if (p === 3) return '🥉 季军';
  if (p === 4) return '4 强';
  if (p <= 8) return '8 强出局';
  if (p <= 16) return '16 强出局';
  if (p <= 32) return '32 强出局';
  return '小组赛出局';
});

// 路由变化时重新加载（从 battle 返回会触发）
import { watch, onActivated } from 'vue';
watch(
  () => route.params.id,
  () => {
    if (route.params.id) load();
  }
);
// 每次焦点回来都 reload 一次（玩家刚打完 battle 回来必须看到新数据）
onActivated(load);

// ── bracket UI helpers ───────────────────────────────
function bkMatchClass(m: TournamentMatch | undefined): Record<string, boolean> {
  if (!m) return {};
  return {
    'is-played': !!m.result,
    'is-player': m.involvesPlayer === true,
  };
}
function bkWinClass(m: TournamentMatch, side: 'a' | 'b'): Record<string, boolean> {
  if (!m.result) return {};
  return {
    'is-winner': m.result.winner === side,
    'is-loser': m.result.winner !== side && m.result.winner !== 'draw',
  };
}
function shortPlaceholder(iso3: string): string {
  // 真实国家直接返回中文名
  const c = COUNTRY_BY_ISO3[iso3];
  if (c) return c.nameZh;
  if (iso3.startsWith('W-')) return '胜者';
  if (iso3.startsWith('L-')) return '负者';
  if (iso3.startsWith('R32-')) return '待定';
  return iso3;
}
</script>

<template>
  <div class="tv-page">
    <div v-if="loading" class="loading mono">读取存档…</div>

    <template v-else-if="tournament && playerCountry">
      <!-- ── 顶部 banner ────────────────────────────── -->
      <header class="tv-banner">
        <button class="back-btn mono" @click="backToList">← 列表</button>
        <div class="player-block">
          <span class="player-flag">{{ playerCountry.flag }}</span>
          <div class="player-text">
            <div class="player-name title-cn">{{ playerCountry.nameZh }}</div>
            <div class="player-tournament mono">{{ tournament.name }}</div>
          </div>
        </div>
        <div class="stage-badge" :class="`stage-${status}`">
          {{ stageLabel(status) }}
        </div>
      </header>

      <!-- ── 已完成态 ───────────────────────────────── -->
      <section v-if="isFinished" class="finished-block nat-card">
        <div class="finished-headline" :class="status === 'champion' ? 'is-champ' : 'is-out'">
          {{ placementText }}
        </div>
        <p class="finished-sub mono">
          {{ tournament.name }} · 共 {{ tournament.playerStageHistory.length }} 场亲征
        </p>

        <ul class="history-list">
          <li
            v-for="(h, i) in tournament.playerStageHistory"
            :key="i"
            class="history-item"
            :class="`outcome-${h.outcome}`"
          >
            <span class="hist-stage mono">{{ stageLabelLong(h.stage) }}</span>
            <span class="hist-vs">vs {{ flagOf(h.opponent) }} {{ nameOf(h.opponent) }}</span>
            <span class="hist-outcome mono">
              {{ h.outcome === 'win' ? '✓ 胜' : h.outcome === 'lose' ? '✗ 负' : '◐ 平' }}
            </span>
          </li>
        </ul>

        <div class="finished-actions">
          <button class="nat-btn nat-btn-gold" @click="router.push('/tournament/new')">⚔ 再来一届</button>
          <button class="nat-btn" @click="backToList">← 回存档列表</button>
        </div>
      </section>

      <!-- ── 进行中：下一场 banner ──────────────────── -->
      <section v-else-if="nextMatch && nextMatchOpponent" class="next-match-block nat-card">
        <div class="next-stage mono">{{ stageLabelShort(nextMatch.stage) }} · 下一场</div>
        <div class="next-cards">
          <div class="nm-team" :class="{ 'is-player': playerSideInNext === 'a' }">
            <span class="nm-flag">{{ flagOf(nextMatch.aIso3) }}</span>
            <span class="nm-name title-cn">{{ nameOf(nextMatch.aIso3) }}</span>
            <span v-if="playerSideInNext === 'a'" class="nm-you mono">你</span>
          </div>
          <div class="nm-vs mono">VS</div>
          <div class="nm-team" :class="{ 'is-player': playerSideInNext === 'b' }">
            <span class="nm-flag">{{ flagOf(nextMatch.bIso3) }}</span>
            <span class="nm-name title-cn">{{ nameOf(nextMatch.bIso3) }}</span>
            <span v-if="playerSideInNext === 'b'" class="nm-you mono">你</span>
          </div>
        </div>
        <button class="nat-btn nat-btn-gold go-battle-btn" @click="goBattle">⚔ 开战</button>
      </section>

      <!-- 下一场没有但还没结束 → 引擎需要 advance 一下 -->
      <section v-else-if="!isFinished" class="empty-next-block nat-card">
        <p class="mono">当前阶段已无玩家场次，引擎推进中…</p>
        <button class="nat-btn nat-btn-gold" :disabled="advancing" @click="manualAdvance">
          {{ advancing ? '推进中…' : '推进到下一阶段' }}
        </button>
      </section>

      <!-- ── 小组赛：玩家所在组积分榜 ──────────────── -->
      <section v-if="isGroupStage && groupRank" class="group-table-block">
        <h2 class="block-title title-natgeo">
          {{ groupRank.group }} 组 积分榜
          <span v-if="groupRank.playerRank" class="block-hint mono">
            （你当前排第 {{ groupRank.playerRank }}）
          </span>
        </h2>
        <table class="standings-table">
          <thead>
            <tr>
              <th>#</th>
              <th>队伍</th>
              <th>赛</th>
              <th>胜</th>
              <th>平</th>
              <th>负</th>
              <th>进</th>
              <th>失</th>
              <th>净</th>
              <th>分</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(r, i) in groupRank.rows"
              :key="r.iso3"
              :class="{ 'is-player': r.iso3 === tournament.playerIso3 }"
            >
              <td class="rank-col">{{ i + 1 }}</td>
              <td class="team-col">
                <span class="row-flag">{{ flagOf(r.iso3) }}</span>
                <span class="title-cn">{{ nameOf(r.iso3) }}</span>
              </td>
              <td>{{ r.played }}</td>
              <td>{{ r.wins }}</td>
              <td>{{ r.draws }}</td>
              <td>{{ r.losses }}</td>
              <td>{{ r.goalsFor }}</td>
              <td>{{ r.goalsAgainst }}</td>
              <td>{{ r.diff > 0 ? '+' + r.diff : r.diff }}</td>
              <td class="pts">{{ r.points }}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <!-- ── 小组赛：其他 11 组（折叠） ────────────── -->
      <section v-if="isGroupStage" class="other-groups-block">
        <button class="toggle-btn mono" @click="showOtherGroups = !showOtherGroups">
          {{ showOtherGroups ? '▾ 隐藏' : '▸ 展开' }} 其他 11 组进度
        </button>
        <div v-if="showOtherGroups" class="other-grid">
          <div v-for="og in otherGroups" :key="og.g" class="og-block">
            <div class="og-head mono">{{ og.g }} 组</div>
            <ol class="og-list">
              <li v-for="r in og.rows" :key="r.iso3" class="og-item">
                <span class="og-flag">{{ flagOf(r.iso3) }}</span>
                <span class="og-name title-cn">{{ nameOf(r.iso3) }}</span>
                <span class="og-pts mono">{{ r.points }}分</span>
              </li>
            </ol>
          </div>
        </div>
      </section>

      <!-- ── 淘汰赛 bracket ────────────────────────── -->
      <section v-if="isKoStage && bracket" class="bracket-block">
        <h2 class="block-title title-natgeo">淘汰赛对阵</h2>
        <div class="bracket-grid">
          <div class="bracket-col">
            <div class="col-head mono">32 强</div>
            <div
              v-for="m in bracket.ro32"
              :key="m.id"
              class="bk-match"
              :class="bkMatchClass(m)"
            >
              <div class="bk-team" :class="bkWinClass(m, 'a')">
                <span class="bk-flag">{{ flagOf(m.aIso3) }}</span>
                <span class="bk-name">{{ nameOf(m.aIso3) }}</span>
                <span v-if="m.result" class="bk-score mono">{{ m.result.aGoals }}</span>
              </div>
              <div class="bk-team" :class="bkWinClass(m, 'b')">
                <span class="bk-flag">{{ flagOf(m.bIso3) }}</span>
                <span class="bk-name">{{ nameOf(m.bIso3) }}</span>
                <span v-if="m.result" class="bk-score mono">{{ m.result.bGoals }}</span>
              </div>
            </div>
          </div>

          <div class="bracket-col">
            <div class="col-head mono">16 强</div>
            <div
              v-for="m in bracket.ro16"
              :key="m.id"
              class="bk-match bk-match-spaced"
              :class="bkMatchClass(m)"
            >
              <div class="bk-team" :class="bkWinClass(m, 'a')">
                <span class="bk-flag">{{ flagOf(m.aIso3) }}</span>
                <span class="bk-name">{{ shortPlaceholder(m.aIso3) }}</span>
                <span v-if="m.result" class="bk-score mono">{{ m.result.aGoals }}</span>
              </div>
              <div class="bk-team" :class="bkWinClass(m, 'b')">
                <span class="bk-flag">{{ flagOf(m.bIso3) }}</span>
                <span class="bk-name">{{ shortPlaceholder(m.bIso3) }}</span>
                <span v-if="m.result" class="bk-score mono">{{ m.result.bGoals }}</span>
              </div>
            </div>
          </div>

          <div class="bracket-col">
            <div class="col-head mono">8 强</div>
            <div
              v-for="m in bracket.qf"
              :key="m.id"
              class="bk-match bk-match-spaced-xl"
              :class="bkMatchClass(m)"
            >
              <div class="bk-team" :class="bkWinClass(m, 'a')">
                <span class="bk-flag">{{ flagOf(m.aIso3) }}</span>
                <span class="bk-name">{{ shortPlaceholder(m.aIso3) }}</span>
                <span v-if="m.result" class="bk-score mono">{{ m.result.aGoals }}</span>
              </div>
              <div class="bk-team" :class="bkWinClass(m, 'b')">
                <span class="bk-flag">{{ flagOf(m.bIso3) }}</span>
                <span class="bk-name">{{ shortPlaceholder(m.bIso3) }}</span>
                <span v-if="m.result" class="bk-score mono">{{ m.result.bGoals }}</span>
              </div>
            </div>
          </div>

          <div class="bracket-col">
            <div class="col-head mono">4 强</div>
            <div
              v-for="m in bracket.sf"
              :key="m.id"
              class="bk-match bk-match-spaced-2xl"
              :class="bkMatchClass(m)"
            >
              <div class="bk-team" :class="bkWinClass(m, 'a')">
                <span class="bk-flag">{{ flagOf(m.aIso3) }}</span>
                <span class="bk-name">{{ shortPlaceholder(m.aIso3) }}</span>
                <span v-if="m.result" class="bk-score mono">{{ m.result.aGoals }}</span>
              </div>
              <div class="bk-team" :class="bkWinClass(m, 'b')">
                <span class="bk-flag">{{ flagOf(m.bIso3) }}</span>
                <span class="bk-name">{{ shortPlaceholder(m.bIso3) }}</span>
                <span v-if="m.result" class="bk-score mono">{{ m.result.bGoals }}</span>
              </div>
            </div>
          </div>

          <div class="bracket-col">
            <div class="col-head mono">决赛</div>
            <div v-if="bracket.final" class="bk-match bk-match-final" :class="bkMatchClass(bracket.final)">
              <div class="bk-team" :class="bkWinClass(bracket.final, 'a')">
                <span class="bk-flag">{{ flagOf(bracket.final.aIso3) }}</span>
                <span class="bk-name">{{ shortPlaceholder(bracket.final.aIso3) }}</span>
                <span v-if="bracket.final.result" class="bk-score mono">{{ bracket.final.result.aGoals }}</span>
              </div>
              <div class="bk-team" :class="bkWinClass(bracket.final, 'b')">
                <span class="bk-flag">{{ flagOf(bracket.final.bIso3) }}</span>
                <span class="bk-name">{{ shortPlaceholder(bracket.final.bIso3) }}</span>
                <span v-if="bracket.final.result" class="bk-score mono">{{ bracket.final.result.bGoals }}</span>
              </div>
            </div>
            <div v-if="bracket.third" class="bk-match bk-match-third" :class="bkMatchClass(bracket.third)">
              <div class="bk-third-label mono">3/4 名</div>
              <div class="bk-team" :class="bkWinClass(bracket.third, 'a')">
                <span class="bk-flag">{{ flagOf(bracket.third.aIso3) }}</span>
                <span class="bk-name">{{ shortPlaceholder(bracket.third.aIso3) }}</span>
                <span v-if="bracket.third.result" class="bk-score mono">{{ bracket.third.result.aGoals }}</span>
              </div>
              <div class="bk-team" :class="bkWinClass(bracket.third, 'b')">
                <span class="bk-flag">{{ flagOf(bracket.third.bIso3) }}</span>
                <span class="bk-name">{{ shortPlaceholder(bracket.third.bIso3) }}</span>
                <span v-if="bracket.third.result" class="bk-score mono">{{ bracket.third.result.bGoals }}</span>
              </div>
            </div>
          </div>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.tv-page {
  max-width: 1280px;
  margin: 0 auto;
  padding: var(--space-4) var(--space-5) var(--space-7);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.loading {
  text-align: center;
  padding: var(--space-7);
  color: var(--text-tertiary);
}

/* ── Banner ── */
.tv-banner {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: var(--space-4);
  padding: var(--space-3) var(--space-4);
  background: linear-gradient(180deg, rgba(26, 26, 46, 0.95) 0%, rgba(26, 26, 46, 0.85) 100%);
  border: 1px solid var(--accent-gold);
  border-radius: var(--radius-md);
  color: var(--text-on-deep);
}
.back-btn {
  background: transparent;
  border: 1px solid var(--accent-gold);
  color: var(--accent-gold);
  padding: 6px 12px;
  border-radius: 2px;
  font-size: 11px;
  cursor: pointer;
}
.back-btn:hover {
  background: var(--accent-gold);
  color: var(--accent-deep);
}
.player-block {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}
.player-flag {
  font-size: 32px;
}
.player-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.player-name {
  font-size: 18px;
  color: var(--bg-parchment);
}
.player-tournament {
  font-size: 11px;
  color: var(--accent-gold);
  letter-spacing: 0.05em;
}
.stage-badge {
  background: var(--accent-gold);
  color: var(--accent-deep);
  font-family: var(--font-title);
  letter-spacing: 0.12em;
  font-size: 12px;
  padding: 5px 12px;
  border-radius: 2px;
  font-weight: 700;
}
.stage-champion {
  background: var(--accent-blood);
  color: var(--bg-parchment);
}
.stage-eliminated {
  background: var(--text-tertiary);
  color: var(--bg-parchment);
}

/* ── 下一场 ── */
.next-match-block {
  background: var(--bg-parchment);
  border: 1px solid var(--accent-gold);
  border-radius: var(--radius-md);
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
}
.next-stage {
  font-size: 11px;
  letter-spacing: 0.12em;
  color: var(--accent-deep);
  background: var(--accent-gold);
  padding: 3px 10px;
  border-radius: 2px;
}
.next-cards {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: var(--space-4);
  align-items: center;
}
.nm-team {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: var(--space-3);
  border: 1px solid var(--border-thin);
  border-radius: var(--radius-sm);
  min-width: 160px;
}
.nm-team.is-player {
  background: rgba(212, 160, 23, 0.18);
  border-color: var(--accent-gold);
  box-shadow: 0 0 8px rgba(212, 160, 23, 0.4);
}
.nm-flag {
  font-size: 32px;
}
.nm-name {
  font-size: 16px;
  color: var(--accent-deep);
}
.nm-you {
  font-size: 9px;
  background: var(--accent-blood);
  color: var(--bg-parchment);
  padding: 1px 6px;
  border-radius: 2px;
}
.nm-vs {
  font-family: var(--font-title);
  font-size: 18px;
  color: var(--accent-gold);
  letter-spacing: 0.2em;
}
.go-battle-btn {
  font-size: 14px;
  padding: 10px 32px;
  min-width: 180px;
}

.empty-next-block {
  background: var(--bg-parchment);
  border: 1px dashed var(--accent-gold);
  border-radius: var(--radius-md);
  padding: var(--space-5);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
}

/* ── 完成态 ── */
.finished-block {
  background: var(--bg-parchment);
  border: 1px solid var(--accent-gold);
  border-radius: var(--radius-md);
  padding: var(--space-5);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-3);
  text-align: center;
}
.finished-headline {
  font-family: var(--font-title);
  font-size: 48px;
  font-weight: 900;
  letter-spacing: 0.1em;
}
.finished-headline.is-champ {
  color: var(--accent-gold);
  text-shadow: 0 0 16px rgba(212, 160, 23, 0.5);
}
.finished-headline.is-out {
  color: var(--text-secondary);
}
.finished-sub {
  font-size: 12px;
  color: var(--text-secondary);
  letter-spacing: 0.08em;
}
.history-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  max-width: 480px;
  margin-top: var(--space-3);
}
.history-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  background: rgba(244, 232, 208, 0.6);
  border-left: 3px solid var(--text-tertiary);
}
.history-item.outcome-win {
  border-left-color: var(--accent-gold);
}
.history-item.outcome-lose {
  border-left-color: var(--accent-blood);
}
.hist-stage {
  font-size: 11px;
  letter-spacing: 0.06em;
  color: var(--accent-deep);
  width: 64px;
}
.hist-vs {
  flex: 1;
  font-family: var(--font-serif-cn);
  font-size: 13px;
  color: var(--text-primary);
}
.hist-outcome {
  font-size: 11px;
  letter-spacing: 0.08em;
}
.finished-actions {
  display: flex;
  gap: var(--space-3);
  margin-top: var(--space-3);
}

/* ── 积分榜 ── */
.block-title {
  font-family: var(--font-title);
  font-size: 18px;
  color: var(--accent-deep);
  letter-spacing: 0.06em;
  margin-bottom: var(--space-3);
  display: flex;
  align-items: center;
  gap: 8px;
}
.block-hint {
  font-size: 11px;
  color: var(--text-secondary);
  font-weight: normal;
  letter-spacing: 0.05em;
}
.standings-table {
  width: 100%;
  border-collapse: collapse;
  border: 2px solid var(--accent-gold);
  background: var(--bg-parchment);
  font-family: var(--font-body);
}
.standings-table th {
  background: var(--accent-deep);
  color: var(--accent-gold);
  font-family: var(--font-title);
  font-size: 10px;
  letter-spacing: 0.1em;
  padding: 6px 8px;
  text-align: center;
}
.standings-table th:nth-child(2) {
  text-align: left;
  padding-left: 12px;
}
.standings-table td {
  padding: 8px 6px;
  text-align: center;
  font-size: 12px;
  color: var(--text-primary);
  border-top: 1px solid var(--border-thin);
}
.standings-table tr.is-player {
  background: rgba(212, 160, 23, 0.18);
  font-weight: 700;
}
.standings-table tr:nth-child(1) td,
.standings-table tr:nth-child(2) td {
  background: rgba(85, 107, 47, 0.08); /* 出线绿 */
}
.standings-table tr:nth-child(3) td {
  background: rgba(212, 160, 23, 0.08); /* 待定（看最佳第 3） */
}
.standings-table .rank-col {
  font-family: var(--font-title);
  font-weight: 700;
  color: var(--accent-deep);
  width: 32px;
}
.standings-table .team-col {
  text-align: left;
  padding-left: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.standings-table .row-flag {
  font-size: 18px;
}
.standings-table .pts {
  font-family: var(--font-title);
  font-weight: 900;
  color: var(--accent-deep);
}

/* ── 其他组 ── */
.other-groups-block {
  margin-top: var(--space-2);
}
.toggle-btn {
  background: transparent;
  border: 1px dashed var(--accent-gold);
  color: var(--accent-deep);
  padding: 6px 12px;
  border-radius: 2px;
  font-size: 11px;
  cursor: pointer;
  letter-spacing: 0.05em;
}
.toggle-btn:hover {
  background: rgba(212, 160, 23, 0.12);
}
.other-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: var(--space-3);
  margin-top: var(--space-3);
}
.og-block {
  background: rgba(244, 232, 208, 0.6);
  border: 1px solid var(--border-thin);
  border-radius: var(--radius-sm);
  padding: 8px 10px;
}
.og-head {
  font-size: 10px;
  letter-spacing: 0.1em;
  color: var(--text-secondary);
  margin-bottom: 4px;
  border-bottom: 1px dashed var(--border-thin);
  padding-bottom: 3px;
}
.og-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: 11px;
}
.og-item {
  display: flex;
  align-items: center;
  gap: 6px;
}
.og-flag {
  font-size: 12px;
}
.og-name {
  flex: 1;
  color: var(--text-primary);
}
.og-pts {
  color: var(--accent-gold);
  font-weight: 700;
}

/* ── 淘汰赛 bracket ── */
.bracket-block {
  margin-top: var(--space-3);
}
.bracket-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: var(--space-3);
  overflow-x: auto;
  padding-bottom: var(--space-3);
}
.bracket-col {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 140px;
}
.col-head {
  font-size: 10px;
  letter-spacing: 0.12em;
  color: var(--text-secondary);
  text-align: center;
  background: var(--accent-deep);
  color: var(--accent-gold);
  padding: 4px 8px;
  border-radius: 2px;
  margin-bottom: 4px;
}
.bk-match {
  background: var(--bg-parchment);
  border: 1px solid var(--border-thin);
  border-radius: var(--radius-sm);
  padding: 4px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 11px;
}
.bk-match.is-player {
  border-color: var(--accent-gold);
  box-shadow: 0 0 6px rgba(212, 160, 23, 0.3);
  background: rgba(212, 160, 23, 0.1);
}
.bk-match-spaced { margin-top: 14px; margin-bottom: 14px; }
.bk-match-spaced-xl { margin-top: 40px; margin-bottom: 40px; }
.bk-match-spaced-2xl { margin-top: 90px; margin-bottom: 90px; }
.bk-match-final {
  border: 2px solid var(--accent-blood);
  padding: 6px;
  margin-bottom: 30px;
}
.bk-match-third {
  border: 1px dashed var(--text-tertiary);
  padding: 6px;
  background: rgba(244, 232, 208, 0.4);
}
.bk-third-label {
  font-size: 9px;
  color: var(--text-tertiary);
  letter-spacing: 0.1em;
  margin-bottom: 2px;
}
.bk-team {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 4px;
  border-radius: 2px;
  background: rgba(244, 232, 208, 0.4);
}
.bk-team.is-winner {
  background: rgba(212, 160, 23, 0.25);
  font-weight: 700;
}
.bk-team.is-loser {
  opacity: 0.55;
}
.bk-flag {
  font-size: 14px;
  line-height: 1;
}
.bk-name {
  flex: 1;
  font-size: 10.5px;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: var(--font-serif-cn);
}
.bk-score {
  font-weight: 700;
  color: var(--accent-deep);
  font-size: 11px;
  background: var(--accent-gold);
  padding: 0 6px;
  border-radius: 2px;
}

.nat-btn {
  font-family: var(--font-title);
  letter-spacing: 0.1em;
  font-size: 12px;
  padding: 8px 16px;
  border-radius: 2px;
  cursor: pointer;
  background: transparent;
  border: 1px solid var(--accent-gold);
  color: var(--accent-deep);
}
.nat-btn:hover {
  background: rgba(212, 160, 23, 0.18);
}
.nat-btn-gold {
  background: var(--accent-gold);
  color: var(--accent-deep);
}
.nat-btn-gold:hover {
  background: var(--accent-gold-dim);
}
.nat-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
