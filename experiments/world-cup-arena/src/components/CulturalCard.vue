<script setup lang="ts">
/**
 * 文化卡牌：NatGeo 邮票齿孔风格。
 *
 * props:
 *   card        - 卡数据
 *   faceUp      - 默认 true，false 显示背面金色花纹底
 *   selectable  - 是否可点击
 *   selected    - 高亮选中态（金色发光描边）
 *   compact     - 紧凑模式（用于 AI 手牌缩小展示）
 *
 * emits:
 *   click       - 选中 / 点击事件
 */
import { computed, ref } from 'vue';
import {
  CATEGORY_LABELS,
  CATEGORY_EMOJI,
  CATEGORY_COLORS,
  RARITY_COLORS,
  LEVEL_LABELS,
  type CulturalCard,
} from '@/data/cards/types';

const props = withDefaults(
  defineProps<{
    card: CulturalCard;
    faceUp?: boolean;
    selectable?: boolean;
    selected?: boolean;
    compact?: boolean;
  }>(),
  { faceUp: true, selectable: false, selected: false, compact: false }
);

const emit = defineEmits<{ click: [card: CulturalCard] }>();

const categoryColor = computed(() => CATEGORY_COLORS[props.card.category]);
const categoryEmoji = computed(() => CATEGORY_EMOJI[props.card.category]);
const categoryLabel = computed(() => CATEGORY_LABELS[props.card.category]);
const rarityColor = computed(() => RARITY_COLORS[props.card.rarity]);
const levelLabel = computed(() => LEVEL_LABELS[props.card.level]);
/**
 * 球星彩蛋（design.md §3.6 ②）专属高亮，而非所有 rarity=legendary 的文化卡。
 * 文化卡如"探戈 / 大航海时代"等 rarity 也是 legendary 但不属彩蛋传奇。
 * 用 id 含 `_legend_` 作为稳定标识（_legend/ 目录所有卡 id 格式 `<ISO3>_legend_NNN`）。
 */
const isLegendary = computed(() => props.card.id.includes('_legend_'));

const attrItems = computed(() => [
  { key: 'historical', label: '历史', value: props.card.attributes.historical },
  { key: 'artistic', label: '艺术', value: props.card.attributes.artistic },
  { key: 'influence', label: '影响', value: props.card.attributes.influence },
  { key: 'uniqueness', label: '独特', value: props.card.attributes.uniqueness },
]);

function onClick() {
  if (!props.selectable) return;
  emit('click', props.card);
}

// ─── Hover tooltip ──────────────────────────────────
// 卡牌用了 mask 邮票齿孔，会裁掉所有越界子元素，所以 tooltip
// 必须 Teleport 到 body。位置基于鼠标进入时的卡牌矩形计算。
const hovered = ref(false);
const tipPos = ref<{ left: number; top: number }>({ left: 0, top: 0 });
const TIP_WIDTH = 320;
const TIP_MARGIN = 12;

function onEnter(e: MouseEvent) {
  if (!props.faceUp || props.compact) return;
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  // 默认弹右侧；右侧不够弹左侧
  let left = rect.right + TIP_MARGIN;
  if (left + TIP_WIDTH > window.innerWidth - 8) {
    left = rect.left - TIP_WIDTH - TIP_MARGIN;
  }
  // 顶部对齐卡牌；如果会超出底部，向上挪
  let top = rect.top;
  const estimatedHeight = 360;
  if (top + estimatedHeight > window.innerHeight - 8) {
    top = Math.max(8, window.innerHeight - estimatedHeight - 8);
  }
  tipPos.value = { left, top };
  hovered.value = true;
}
function onLeave() {
  hovered.value = false;
}
</script>

<template>
  <div
    class="cul-card"
    :class="{
      'is-face-up': faceUp,
      'is-face-down': !faceUp,
      'is-selectable': selectable,
      'is-selected': selected,
      'is-compact': compact,
      'is-legendary': isLegendary,
    }"
    :style="{ '--cat-color': categoryColor, '--rar-color': rarityColor }"
    @click="onClick"
    @mouseenter="onEnter"
    @mouseleave="onLeave"
    role="button"
    :tabindex="selectable ? 0 : -1"
  >
    <!-- 背面 -->
    <div v-if="!faceUp" class="card-back">
      <div class="back-pattern"></div>
      <div class="back-mark mono">FIFA · 2026</div>
    </div>

    <!-- 正面 -->
    <template v-else>
      <!-- 顶部条：类别 + 稀有度 -->
      <div class="card-header">
        <span class="cat-badge mono" :style="{ background: categoryColor }">
          {{ categoryEmoji }} {{ categoryLabel }}
        </span>
        <span class="rar-pip" :style="{ background: rarityColor }" :title="card.rarity"></span>
      </div>

      <!-- 大 emoji 区 -->
      <div class="card-art">
        <span class="art-emoji">{{ card.emoji }}</span>
      </div>

      <!-- 名字 -->
      <div class="card-name title-cn">{{ card.name }}</div>
      <div class="card-name-en mono">{{ card.nameEn }}</div>

      <!-- 时代 -->
      <div class="card-era mono">{{ card.era }}</div>

      <!-- 简介（compact 模式隐藏） -->
      <p v-if="!compact" class="card-desc">{{ card.description }}</p>

      <!-- 属性条 -->
      <div class="card-attrs">
        <div v-for="attr in attrItems" :key="attr.key" class="attr-row">
          <span class="attr-label mono">{{ attr.label }}</span>
          <div class="attr-bar">
            <div
              class="attr-fill"
              :style="{ width: attr.value + '%', background: categoryColor }"
            ></div>
          </div>
          <span class="attr-val mono">{{ attr.value }}</span>
        </div>
      </div>

      <!-- 标签 -->
      <div v-if="!compact && card.tags?.length" class="card-tags">
        <span v-for="t in card.tags" :key="t" class="tag mono">#{{ t }}</span>
      </div>

      <!-- 角标：传奇卡显示 ⭐ LEGEND，否则显示内容尺度 -->
      <div class="level-corner mono">{{ isLegendary ? '⭐ LEGEND' : levelLabel }}</div>
    </template>
  </div>

  <!-- Hover tooltip — Teleport 到 body 避开卡牌 mask 裁剪 -->
  <Teleport to="body">
    <Transition name="tip-fade">
      <div
        v-if="hovered && faceUp && !compact"
        class="cul-card-tooltip"
        :style="{ left: tipPos.left + 'px', top: tipPos.top + 'px' }"
        role="tooltip"
      >
        <header class="tip-header">
          <span class="tip-emoji">{{ card.emoji }}</span>
          <div class="tip-titles">
            <div class="tip-name">{{ card.name }}</div>
            <div class="tip-name-en">{{ card.nameEn }}</div>
          </div>
          <span class="tip-cat-badge" :style="{ background: categoryColor }">
            {{ categoryEmoji }} {{ categoryLabel }}
          </span>
        </header>
        <div class="tip-meta">
          <span>{{ card.era }}</span>
          <span class="tip-sep">·</span>
          <span :style="{ color: rarityColor }">{{ card.rarity }}</span>
          <span class="tip-sep">·</span>
          <span>{{ levelLabel }}</span>
        </div>
        <p class="tip-desc">{{ card.description }}</p>
        <div v-if="card.tags?.length" class="tip-tags">
          <span v-for="t in card.tags" :key="t" class="tip-tag">#{{ t }}</span>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.cul-card {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 240px;
  min-height: 380px;
  padding: 18px 16px 16px;
  background: var(--bg-parchment);
  border: 1px solid var(--accent-deep);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-card);
  /* 邮票齿孔 mask：用 radial-gradient 在边缘打孔 */
  --hole: 6px;
  --gap: 14px;
  mask:
    radial-gradient(circle var(--hole) at var(--gap) 0, transparent 99%, #000 100%) repeat-x top,
    radial-gradient(circle var(--hole) at var(--gap) 100%, transparent 99%, #000 100%) repeat-x bottom,
    radial-gradient(circle var(--hole) at 0 var(--gap), transparent 99%, #000 100%) repeat-y left,
    radial-gradient(circle var(--hole) at 100% var(--gap), transparent 99%, #000 100%) repeat-y right,
    linear-gradient(#000, #000);
  mask-composite: source-over, source-over, source-over, source-over, source-over;
  mask-size: var(--gap) calc(var(--hole) * 2), var(--gap) calc(var(--hole) * 2),
    calc(var(--hole) * 2) var(--gap), calc(var(--hole) * 2) var(--gap), 100% 100%;
  /* 纸张噪点 */
  background-image:
    radial-gradient(rgba(139, 69, 19, 0.04) 1px, transparent 1px),
    var(--bg-parchment-gradient);
  background-size: 4px 4px, auto;
  transition: transform 0.18s ease, box-shadow 0.18s ease;
}

.cul-card.is-compact {
  width: 110px;
  min-height: 140px;
  padding: 8px 6px;
}
.cul-card.is-compact .card-art {
  height: 50px;
}
.cul-card.is-compact .art-emoji {
  font-size: 36px;
}
.cul-card.is-compact .card-name {
  font-size: 11px;
}
.cul-card.is-compact .card-name-en,
.cul-card.is-compact .card-era,
.cul-card.is-compact .rar-pip,
.cul-card.is-compact .level-corner {
  display: none;
}
.cul-card.is-compact .cat-badge {
  font-size: 9px;
  padding: 1px 4px;
}
.cul-card.is-compact .attr-row {
  font-size: 9px;
}
.cul-card.is-compact .attr-label {
  width: 24px;
}
.cul-card.is-compact .attr-val {
  width: 18px;
}

.cul-card.is-selectable {
  cursor: pointer;
}
.cul-card.is-selectable:hover {
  transform: translateY(-3px);
  box-shadow: var(--shadow-elevated);
}
.cul-card.is-selected {
  outline: 2px solid var(--accent-gold);
  outline-offset: 2px;
  box-shadow:
    0 0 18px rgba(212, 160, 23, 0.55),
    var(--shadow-elevated);
  transform: translateY(-3px);
}

/* 背面 */
.card-back {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 380px;
  width: 100%;
  background:
    repeating-linear-gradient(
      45deg,
      var(--accent-gold) 0,
      var(--accent-gold) 2px,
      var(--accent-gold-dim) 2px,
      var(--accent-gold-dim) 8px
    ),
    var(--accent-deep);
  color: var(--accent-deep);
  position: absolute;
  inset: 0;
  border-radius: var(--radius-sm);
}
.cul-card.is-compact .card-back {
  min-height: 140px;
}
.back-pattern {
  width: 60%;
  aspect-ratio: 1;
  background:
    radial-gradient(circle at center, var(--accent-deep) 30%, transparent 32%),
    repeating-conic-gradient(
      var(--accent-gold) 0deg 12deg,
      var(--accent-gold-dim) 12deg 24deg
    );
  border-radius: 50%;
  border: 2px solid var(--accent-deep);
  box-shadow: 0 0 0 4px var(--accent-gold), 0 0 0 6px var(--accent-deep);
}
.back-mark {
  position: absolute;
  bottom: 14px;
  font-size: 11px;
  letter-spacing: 0.2em;
  color: var(--accent-deep);
  background: var(--accent-gold);
  padding: 2px 10px;
  border-radius: 2px;
}

/* 正面 - 头部 */
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.cat-badge {
  font-size: 10px;
  letter-spacing: 0.04em;
  color: var(--bg-parchment);
  padding: 2px 8px;
  border-radius: 2px;
}
.rar-pip {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 1px solid var(--accent-deep);
}

.card-art {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 80px;
  margin: 8px 0 4px;
}
.art-emoji {
  font-size: 56px;
  line-height: 1;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.15));
}

.card-name {
  font-size: 16px;
  font-weight: 700;
  text-align: center;
  color: var(--accent-deep);
  letter-spacing: 0.04em;
}
.card-name-en {
  font-size: 10px;
  text-align: center;
  color: var(--text-tertiary);
  margin-top: 2px;
  letter-spacing: 0.06em;
}
.card-era {
  font-size: 10px;
  text-align: center;
  color: var(--cat-color);
  margin: 4px 0 6px;
  padding: 1px 6px;
  border: 1px solid var(--cat-color);
  border-radius: 2px;
  align-self: center;
  font-weight: 600;
}

.card-desc {
  font-family: var(--font-serif-cn);
  font-size: 11px;
  line-height: 1.55;
  color: var(--text-secondary);
  margin: 6px 0;
  /* 5 行裁断 */
  display: -webkit-box;
  -webkit-line-clamp: 5;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-attrs {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.attr-row {
  display: grid;
  grid-template-columns: 30px 1fr 24px;
  align-items: center;
  gap: 6px;
  font-size: 10px;
}
.attr-label {
  color: var(--text-secondary);
}
.attr-bar {
  height: 6px;
  background: rgba(42, 36, 25, 0.1);
  border-radius: 1px;
  overflow: hidden;
}
.attr-fill {
  height: 100%;
  transition: width 0.3s ease;
}
.attr-val {
  text-align: right;
  color: var(--cat-color);
  font-weight: 600;
}

.card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  margin-top: 8px;
}
.tag {
  font-size: 9px;
  padding: 1px 5px;
  background: rgba(212, 160, 23, 0.12);
  color: var(--text-secondary);
  border-radius: 1px;
}

.level-corner {
  position: absolute;
  top: 4px;
  right: -2px;
  background: var(--accent-gold);
  color: var(--accent-deep);
  font-size: 8px;
  padding: 1px 5px;
  border-radius: 1px;
  letter-spacing: 0.05em;
  transform: rotate(8deg);
}

/* ─── 传奇卡（球星彩蛋） ────────────────────────────
   外发光 + 角标变成 ⭐ LEGEND 渐变金色。
   不能用 ::before（卡牌外层 mask 会裁掉），所以直接复用 level-corner
   把文本切换为 LEGEND + 给整张卡加 box-shadow 呼吸。
   注意：mask 会让 box-shadow 也被裁，但卡内仍能看到金色描边边缘。
   ──────────────────────────────────────────────── */
.cul-card.is-legendary {
  outline: 2px solid var(--accent-gold);
  outline-offset: 1px;
  animation: legend-glow 2.4s ease-in-out infinite alternate;
}
.cul-card.is-legendary .level-corner {
  background: linear-gradient(135deg, #f4e8d0 0%, var(--accent-gold) 50%, #f4e8d0 100%);
  background-size: 200% 200%;
  color: var(--accent-deep);
  font-weight: 700;
  font-size: 9px;
  padding: 2px 7px;
  letter-spacing: 0.12em;
  animation: legend-shimmer 3s linear infinite;
  box-shadow: 0 0 6px rgba(212, 160, 23, 0.7);
}
@keyframes legend-glow {
  from {
    outline-color: rgba(212, 160, 23, 0.55);
  }
  to {
    outline-color: rgba(212, 160, 23, 1);
  }
}
@keyframes legend-shimmer {
  from {
    background-position: 0% 0%;
  }
  to {
    background-position: 200% 0%;
  }
}
.cul-card.is-legendary .art-emoji {
  filter: drop-shadow(0 0 8px rgba(212, 160, 23, 0.85)) drop-shadow(0 1px 2px rgba(0, 0, 0, 0.15));
}
.cul-card.is-legendary .card-name {
  text-shadow: 0 0 6px rgba(212, 160, 23, 0.35);
}

</style>

<style>
/* ─── Hover 全文浮窗（Teleport 到 body，非 scoped） ───────────
   位置由 JS 计算 left/top 提供；只在 faceUp + !compact 时显示。
   ─────────────────────────────────────────────────────────────── */
.cul-card-tooltip {
  position: fixed;
  width: 320px;
  padding: 14px 16px 12px;
  background: rgba(26, 26, 46, 0.97);
  color: #f4e8d0;
  border: 1px solid #d4a017;
  border-radius: 4px;
  box-shadow:
    0 6px 24px rgba(26, 26, 46, 0.45),
    0 0 0 1px rgba(212, 160, 23, 0.25);
  pointer-events: none;
  z-index: 9999;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}
.cul-card-tooltip .tip-header {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 10px;
  padding-bottom: 8px;
  border-bottom: 1px dashed rgba(212, 160, 23, 0.35);
  margin-bottom: 8px;
}
.cul-card-tooltip .tip-emoji {
  font-size: 30px;
  line-height: 1;
}
.cul-card-tooltip .tip-titles {
  min-width: 0;
}
.cul-card-tooltip .tip-name {
  font-family: 'Noto Serif SC', serif;
  font-size: 16px;
  font-weight: 700;
  color: #f4e8d0;
  letter-spacing: 0.04em;
}
.cul-card-tooltip .tip-name-en {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: rgba(244, 232, 208, 0.55);
  letter-spacing: 0.06em;
  margin-top: 1px;
}
.cul-card-tooltip .tip-cat-badge {
  font-family: 'JetBrains Mono', monospace;
  font-size: 9px;
  padding: 2px 6px;
  border-radius: 2px;
  color: #f4e8d0;
  white-space: nowrap;
}
.cul-card-tooltip .tip-meta {
  display: flex;
  gap: 6px;
  align-items: center;
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: #d4a017;
  letter-spacing: 0.06em;
  margin-bottom: 8px;
}
.cul-card-tooltip .tip-sep {
  opacity: 0.5;
}
.cul-card-tooltip .tip-desc {
  font-family: 'Noto Serif SC', serif;
  font-size: 13px;
  line-height: 1.75;
  color: #f4e8d0;
  margin: 0;
  /* 完整显示，不裁断 */
}
.cul-card-tooltip .tip-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px dashed rgba(212, 160, 23, 0.25);
}
.cul-card-tooltip .tip-tag {
  font-family: 'JetBrains Mono', monospace;
  font-size: 9px;
  padding: 1px 6px;
  background: rgba(212, 160, 23, 0.18);
  color: #d4a017;
  border-radius: 1px;
}

/* 进出场动画 */
.tip-fade-enter-active,
.tip-fade-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.tip-fade-enter-from,
.tip-fade-leave-to {
  opacity: 0;
  transform: translateX(-6px);
}
</style>
