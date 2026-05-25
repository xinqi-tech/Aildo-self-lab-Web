/**
 * 对战状态 store。
 *
 * 单局对战的全局状态：当前 BattleState、加载中、错误。
 * 主要负责包装 battleEngine 的纯函数，让 Vue 组件可以 reactive 订阅。
 */

import { defineStore } from 'pinia';
import { ref, shallowRef } from 'vue';
import type { MatchView } from '@/services/scheduleService';
import {
  initBattle,
  playRound,
  finalizeBattle,
  type BattleSide,
  type BattleState,
} from '@/services/battleEngine';
import type { AnyContentLevel } from '@/services/cardPoolService';

export const useBattleStore = defineStore('battle', () => {
  // 用 shallowRef 因为 BattleState 内部对象引用稳定，深度响应没必要
  const state = shallowRef<BattleState | null>(null);
  const judging = ref(false);
  const error = ref<string | null>(null);

  function start(match: MatchView, side: BattleSide, level: AnyContentLevel) {
    try {
      error.value = null;
      const s = initBattle(match, side, level);
      state.value = s;
    } catch (e: any) {
      error.value = e?.message || '初始化失败';
      throw e;
    }
  }

  async function play(playerCardId: string) {
    if (!state.value) throw new Error('对战未初始化');
    if (judging.value) return;
    judging.value = true;
    try {
      const { state: next } = await playRound(state.value, playerCardId);
      // 触发 shallowRef 更新（同对象引用，所以浅替换一个新引用让 Vue 知道）
      state.value = { ...next };
    } catch (e: any) {
      error.value = e?.message || '出牌失败';
    } finally {
      judging.value = false;
    }
  }

  async function finish() {
    if (!state.value) throw new Error('对战未初始化');
    try {
      const next = await finalizeBattle(state.value);
      state.value = { ...next };
      return next;
    } catch (e: any) {
      error.value = e?.message || '结算失败';
      throw e;
    }
  }

  function reset() {
    state.value = null;
    judging.value = false;
    error.value = null;
  }

  return { state, judging, error, start, play, finish, reset };
});
