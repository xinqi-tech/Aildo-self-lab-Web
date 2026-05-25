<script setup lang="ts">
import { onMounted, onUnmounted, ref, shallowRef, computed } from 'vue';
import * as d3 from 'd3';
import { feature, mesh } from 'topojson-client';
import { useRouter } from 'vue-router';
import {
  COUNTRY_BY_ISO3,
  GROUP_COLORS,
  GROUPS,
  countriesByGroup,
  type Country,
  type GroupKey,
} from '@/data/countries';
import { NUMERIC_TO_ALPHA3 } from '@/data/isoNumericToAlpha3';

const router = useRouter();
const wrap = ref<HTMLDivElement | null>(null);
const tooltip = shallowRef<{ x: number; y: number; country: Country } | null>(null);
const loading = ref(true);
const loadError = ref<string | null>(null);

// 右侧 legend 交互
const expandedGroup = ref<GroupKey | null>(null);
const focusedIso3 = ref<string | null>(null);
const grouped = computed(() => countriesByGroup());

function toggleGroup(g: GroupKey) {
  expandedGroup.value = expandedGroup.value === g ? null : g;
}

// 由 onMounted 在地图就绪后赋值
const rotateToCountry = shallowRef<(iso3: string) => void>(() => {});

const TOPO_URL = 'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json';

/**
 * 把 topojson feature 的 id 映射到我们 48 国列表里的 Country；
 * 处理 GBR 既代表英格兰也代表苏格兰的特殊情况（仅取一个高亮，避免冲突）。
 */
function featureToCountry(featureId: string | number | undefined): Country | undefined {
  if (featureId == null) return undefined;
  const numStr = String(featureId).padStart(3, '0');
  const alpha3 = NUMERIC_TO_ALPHA3[numStr];
  if (!alpha3) return undefined;
  if (alpha3 === 'GBR') {
    // 优先英格兰，没有就苏格兰
    return COUNTRY_BY_ISO3['ENG'] || COUNTRY_BY_ISO3['SCO'];
  }
  return COUNTRY_BY_ISO3[alpha3];
}

let removeListeners: (() => void) | null = null;

onMounted(async () => {
  if (!wrap.value) return;

  let topology: any = null;
  try {
    const res = await fetch(TOPO_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    topology = await res.json();
  } catch (e: any) {
    loadError.value = `地图加载失败：${e?.message || '未知错误'}`;
    loading.value = false;
    return;
  }

  loading.value = false;

  const container = wrap.value!;
  const rect = container.getBoundingClientRect();
  const width = rect.width || 800;
  const height = rect.height || 600;
  const radius = Math.min(width, height) / 2 - 20;

  const svg = d3
    .select(container)
    .append('svg')
    .attr('width', '100%')
    .attr('height', '100%')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .style('display', 'block')
    .style('cursor', 'grab');

  const projection = d3
    .geoOrthographic()
    .scale(radius)
    .translate([width / 2, height / 2])
    .rotate([110, -20, 0])
    .clipAngle(90);

  const path = d3.geoPath(projection);

  // 海洋（圆球底）
  const sphere: any = { type: 'Sphere' };
  svg
    .append('path')
    .attr('class', 'sphere')
    .datum(sphere as any)
    .attr('d', path as any)
    .attr('fill', 'var(--bg-ocean)')
    .attr('stroke', 'var(--accent-deep)')
    .attr('stroke-width', 0.8);

  // 经纬度网格
  const graticule = d3.geoGraticule10();
  svg
    .append('path')
    .datum(graticule as any)
    .attr('class', 'graticule')
    .attr('d', path as any)
    .attr('fill', 'none')
    .attr('stroke', 'var(--border-thin)')
    .attr('stroke-width', 0.4);

  const countriesGeo = feature(topology, topology.objects.countries) as unknown as {
    features: any[];
  };
  const borders = mesh(topology, topology.objects.countries, (a: any, b: any) => a !== b);

  // 建立 iso3 → feature 索引，供"点国家旋转地球"使用
  const featureByIso3: Record<string, any> = {};
  for (const f of countriesGeo.features) {
    const numStr = String(f.id ?? '').padStart(3, '0');
    const alpha3 = NUMERIC_TO_ALPHA3[numStr];
    if (alpha3) {
      featureByIso3[alpha3] = f;
      // GBR polygon 同时挂英格兰/苏格兰（110m 精度里它们共用）
      if (alpha3 === 'GBR') {
        featureByIso3['ENG'] = f;
        featureByIso3['SCO'] = f;
      }
    }
  }

  // 国家面（非参赛=羊皮纸色；参赛=组色）
  const countryPaths = svg
    .append('g')
    .attr('class', 'countries')
    .selectAll('path')
    .data(countriesGeo.features)
    .enter()
    .append('path')
    .attr('d', path as any)
    .attr('class', 'country')
    .attr('fill', (d) => {
      const c = featureToCountry(d.id as any);
      return c ? GROUP_COLORS[c.group] : 'var(--bg-parchment)';
    })
    .attr('fill-opacity', (d) => (featureToCountry(d.id as any) ? 0.82 : 0.55))
    .attr('stroke', (d) =>
      featureToCountry(d.id as any) ? 'var(--accent-deep)' : 'var(--border-thin)'
    )
    .attr('stroke-width', (d) => (featureToCountry(d.id as any) ? 0.6 : 0.3))
    .style('cursor', (d) => (featureToCountry(d.id as any) ? 'pointer' : 'default'))
    .on('mousemove', function (event, d) {
      const c = featureToCountry(d.id as any);
      if (!c) {
        tooltip.value = null;
        return;
      }
      const bounds = container.getBoundingClientRect();
      tooltip.value = {
        x: event.clientX - bounds.left + 12,
        y: event.clientY - bounds.top + 12,
        country: c,
      };
      d3.select(this).attr('fill-opacity', 1);
    })
    .on('mouseleave', function () {
      tooltip.value = null;
      const d: any = d3.select(this).datum();
      d3.select(this).attr('fill-opacity', featureToCountry(d.id) ? 0.82 : 0.55);
    })
    .on('click', function (_event, d) {
      const c = featureToCountry(d.id as any);
      if (c) router.push(`/country/${c.iso3}`);
    });

  // 边界线
  svg
    .append('path')
    .datum(borders as any)
    .attr('class', 'borders')
    .attr('d', path as any)
    .attr('fill', 'none')
    .attr('stroke', 'var(--accent-deep)')
    .attr('stroke-width', 0.5)
    .attr('stroke-opacity', 0.55)
    .style('pointer-events', 'none');

  // 拖拽旋转
  function redraw() {
    svg.selectAll('path.sphere').attr('d', path as any);
    svg.selectAll('path.graticule').attr('d', path as any);
    countryPaths.attr('d', path as any);
    svg.selectAll('path.borders').attr('d', path as any);
  }

  let v0: [number, number, number] | null = null;
  let r0: [number, number, number] | null = null;

  const drag = d3
    .drag<SVGSVGElement, unknown>()
    .on('start', (event) => {
      v0 = versor.cartesian(projection.invert!([event.x, event.y])!);
      r0 = projection.rotate();
      svg.style('cursor', 'grabbing');
    })
    .on('drag', (event) => {
      if (!v0 || !r0) return;
      const v1 = versor.cartesian(
        (projection.rotate(r0).invert!([event.x, event.y])) as [number, number]
      );
      const q1 = versor.multiply(versor.fromAngles(r0), versor.delta(v0, v1));
      projection.rotate(versor.toAngles(q1));
      redraw();
    })
    .on('end', () => {
      svg.style('cursor', 'grab');
    });

  svg.call(drag as any);

  // 平滑旋转到某国 — 暴露给 template
  let rotateRAF: number | null = null;
  function shortestDelta(from: number, to: number): number {
    let d = to - from;
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    return d;
  }
  function rotateTo(targetLng: number, targetLat: number) {
    if (rotateRAF != null) cancelAnimationFrame(rotateRAF);
    const r0 = projection.rotate() as [number, number, number];
    // 让该国正面朝向观察者：rotate = [-lng, -lat, 0]
    const targetR: [number, number, number] = [-targetLng, -targetLat, 0];
    const dLng = shortestDelta(r0[0], targetR[0]);
    const dLat = shortestDelta(r0[1], targetR[1]);
    const dGam = shortestDelta(r0[2], 0);
    const duration = 800;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // easeCubicInOut
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      projection.rotate([r0[0] + dLng * e, r0[1] + dLat * e, r0[2] + dGam * e]);
      redraw();
      if (t < 1) rotateRAF = requestAnimationFrame(tick);
      else rotateRAF = null;
    };
    rotateRAF = requestAnimationFrame(tick);
  }
  rotateToCountry.value = (iso3: string) => {
    const f = featureByIso3[iso3];
    if (!f) return;
    const [lng, lat] = d3.geoCentroid(f);
    focusedIso3.value = iso3;
    rotateTo(lng, lat);
  };

  // resize 监听
  const ro = new ResizeObserver(() => {
    const r2 = container.getBoundingClientRect();
    const w2 = r2.width;
    const h2 = r2.height;
    if (w2 < 10 || h2 < 10) return;
    const rad2 = Math.min(w2, h2) / 2 - 20;
    projection.scale(rad2).translate([w2 / 2, h2 / 2]);
    svg.attr('viewBox', `0 0 ${w2} ${h2}`);
    redraw();
  });
  ro.observe(container);

  removeListeners = () => {
    if (rotateRAF != null) cancelAnimationFrame(rotateRAF);
    ro.disconnect();
    svg.remove();
  };
});

onUnmounted(() => {
  if (removeListeners) removeListeners();
});

/**
 * 小型 versor 实现：从 d3-geo 实践例子里抽出来，避免引一个额外包。
 * 参考：https://observablehq.com/@d3/versor-dragging
 */
const versor = (() => {
  function cartesian([lambda, phi]: [number, number]): [number, number, number] {
    lambda *= Math.PI / 180;
    phi *= Math.PI / 180;
    const cosPhi = Math.cos(phi);
    return [cosPhi * Math.cos(lambda), cosPhi * Math.sin(lambda), Math.sin(phi)];
  }
  function fromAngles([l, p, g]: [number, number, number]): [number, number, number, number] {
    l *= Math.PI / 360;
    p *= Math.PI / 360;
    g *= Math.PI / 360;
    const sl = Math.sin(l),
      cl = Math.cos(l);
    const sp = Math.sin(p),
      cp = Math.cos(p);
    const sg = Math.sin(g),
      cg = Math.cos(g);
    return [
      cl * cp * cg + sl * sp * sg,
      sl * cp * cg - cl * sp * sg,
      cl * sp * cg + sl * cp * sg,
      cl * cp * sg - sl * sp * cg,
    ];
  }
  function toAngles([a, b, c, d]: [number, number, number, number]): [number, number, number] {
    return [
      (Math.atan2(2 * (a * b + c * d), 1 - 2 * (b * b + c * c)) * 180) / Math.PI,
      (Math.asin(Math.max(-1, Math.min(1, 2 * (a * c - d * b)))) * 180) / Math.PI,
      (Math.atan2(2 * (a * d + b * c), 1 - 2 * (c * c + d * d)) * 180) / Math.PI,
    ];
  }
  function delta(v0: [number, number, number], v1: [number, number, number]): [number, number, number, number] {
    const w = cross(v0, v1);
    const l = Math.sqrt(w[0] ** 2 + w[1] ** 2 + w[2] ** 2);
    if (!l) return [1, 0, 0, 0];
    const t = Math.acos(Math.max(-1, Math.min(1, dot(v0, v1)))) / 2;
    const s = Math.sin(t);
    return [Math.cos(t), (w[2] / l) * s, (-w[1] / l) * s, (w[0] / l) * s];
  }
  function multiply(
    [a1, b1, c1, d1]: [number, number, number, number],
    [a2, b2, c2, d2]: [number, number, number, number]
  ): [number, number, number, number] {
    return [
      a1 * a2 - b1 * b2 - c1 * c2 - d1 * d2,
      a1 * b2 + b1 * a2 + c1 * d2 - d1 * c2,
      a1 * c2 - b1 * d2 + c1 * a2 + d1 * b2,
      a1 * d2 + b1 * c2 - c1 * b2 + d1 * a2,
    ];
  }
  function dot(a: [number, number, number], b: [number, number, number]): number {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  }
  function cross(a: [number, number, number], b: [number, number, number]): [number, number, number] {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }
  return { cartesian, fromAngles, toAngles, delta, multiply };
})();
</script>

<template>
  <div class="globe-page">
    <div class="globe-stage" ref="wrap">
      <div v-if="loading" class="globe-loading mono">加载世界地图…</div>
      <div v-if="loadError" class="globe-error mono">{{ loadError }}</div>

      <transition name="tip">
        <div
          v-if="tooltip"
          class="country-tip"
          :style="{ left: tooltip.x + 'px', top: tooltip.y + 'px' }"
        >
          <div class="tip-flag">{{ tooltip.country.flag }}</div>
          <div class="tip-text">
            <div class="tip-name title-cn">{{ tooltip.country.nameZh }}</div>
            <div class="tip-name-en mono">{{ tooltip.country.nameEn }}</div>
            <div class="tip-meta mono">
              <span :style="{ background: GROUP_COLORS[tooltip.country.group] }" class="tip-group">
                Group {{ tooltip.country.group }}
              </span>
              <span class="tip-conf">{{ tooltip.country.confederation }}</span>
              <span v-if="tooltip.country.isHost" class="tip-host">主办国</span>
            </div>
          </div>
        </div>
      </transition>
    </div>

    <aside class="globe-legend">
      <h3 class="legend-title">12 Groups</h3>
      <div class="legend-list">
        <div v-for="g in GROUPS" :key="g" class="legend-group">
          <button
            class="group-row"
            :class="{ 'is-expanded': expandedGroup === g }"
            @click="toggleGroup(g)"
            :aria-expanded="expandedGroup === g"
          >
            <span class="group-swatch" :style="{ background: GROUP_COLORS[g] }"></span>
            <span class="group-label mono">Group {{ g }}</span>
            <span class="group-count mono">{{ grouped[g].length }}</span>
            <span class="group-caret">{{ expandedGroup === g ? '▾' : '▸' }}</span>
          </button>

          <transition name="expand">
            <ul v-if="expandedGroup === g" class="country-list">
              <li
                v-for="c in grouped[g]"
                :key="c.iso3"
                class="country-row"
                :class="{ 'is-focused': focusedIso3 === c.iso3 }"
                @click="rotateToCountry(c.iso3)"
                :title="`旋转到 ${c.nameZh}`"
              >
                <span class="country-flag">{{ c.flag }}</span>
                <span class="country-name title-cn">{{ c.nameZh }}</span>
                <span class="country-name-en mono">{{ c.nameEn }}</span>
              </li>
            </ul>
          </transition>
        </div>
      </div>
      <p class="legend-hint">点击分组 ▸ 展开 · 点击国家旋转地球 · 拖拽旋转</p>
    </aside>
  </div>
</template>

<style scoped>
.globe-page {
  display: grid;
  grid-template-columns: 1fr 240px;
  gap: var(--space-4);
  height: calc(100vh - 160px);
  padding: var(--space-4) var(--space-5);
}

.globe-stage {
  position: relative;
  background: radial-gradient(
    ellipse at center,
    rgba(216, 222, 200, 0.4) 0%,
    rgba(244, 232, 208, 0.1) 70%
  );
  border: 1px solid var(--border-thin);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.globe-loading,
.globe-error {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  color: var(--text-secondary);
}

.globe-error {
  color: var(--text-error);
}

.country-tip {
  position: absolute;
  display: flex;
  gap: 10px;
  padding: 8px 12px;
  background: rgba(26, 26, 46, 0.94);
  color: var(--text-on-deep);
  border: 1px solid var(--accent-gold);
  border-radius: var(--radius-sm);
  pointer-events: none;
  font-size: 12px;
  box-shadow: var(--shadow-elevated);
  z-index: 5;
  white-space: nowrap;
}
.tip-flag {
  font-size: 24px;
  line-height: 1.2;
}
.tip-name {
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.04em;
}
.tip-name-en {
  font-size: 10px;
  opacity: 0.6;
  margin-top: 2px;
}
.tip-meta {
  display: flex;
  gap: 6px;
  font-size: 10px;
  margin-top: 4px;
  flex-wrap: wrap;
}
.tip-group {
  padding: 1px 6px;
  border-radius: 2px;
  color: var(--bg-parchment);
}
.tip-conf {
  padding: 1px 6px;
  border: 1px solid var(--accent-gold);
  border-radius: 2px;
  color: var(--accent-gold);
}
.tip-host {
  padding: 1px 6px;
  border-radius: 2px;
  background: var(--accent-gold);
  color: var(--accent-deep);
  font-weight: 700;
}

.tip-enter-active,
.tip-leave-active {
  transition: opacity 0.15s ease;
}
.tip-enter-from,
.tip-leave-to {
  opacity: 0;
}

.globe-legend {
  padding: var(--space-3);
  background: rgba(244, 232, 208, 0.6);
  border: 1px solid var(--border-thin);
  border-radius: var(--radius-md);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}
.legend-title {
  font-family: var(--font-title);
  font-size: 13px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  margin-bottom: var(--space-3);
  color: var(--accent-deep);
}
.legend-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-height: 0;
}

/* — 一行分组按钮 — */
.group-row {
  display: grid;
  grid-template-columns: 16px 1fr auto auto;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 8px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  cursor: pointer;
  color: var(--text-primary);
  text-align: left;
  transition: background 0.15s, border-color 0.15s;
  font: inherit;
}
.group-row:hover {
  background: rgba(212, 160, 23, 0.12);
  border-color: rgba(212, 160, 23, 0.35);
}
.group-row.is-expanded {
  background: rgba(212, 160, 23, 0.18);
  border-color: var(--accent-gold);
}
.group-swatch {
  width: 14px;
  height: 14px;
  border-radius: 2px;
  border: 1px solid var(--accent-deep);
}
.group-label {
  font-size: 11px;
  letter-spacing: 0.04em;
}
.group-count {
  font-size: 10px;
  opacity: 0.55;
  padding: 0 4px;
}
.group-caret {
  font-size: 10px;
  color: var(--accent-deep);
  width: 12px;
  text-align: right;
}

/* — 展开后的国家列表 — */
.country-list {
  list-style: none;
  margin: 2px 0 6px 24px;
  padding: 0;
  border-left: 1px dashed rgba(212, 160, 23, 0.4);
}
.country-row {
  display: grid;
  grid-template-columns: 20px 1fr auto;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: background 0.12s;
}
.country-row:hover {
  background: rgba(26, 26, 46, 0.06);
}
.country-row.is-focused {
  background: rgba(212, 160, 23, 0.22);
  outline: 1px solid var(--accent-gold);
}
.country-flag {
  font-size: 14px;
  line-height: 1;
}
.country-name {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.country-name-en {
  font-size: 9px;
  opacity: 0.5;
  max-width: 60px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* — 展开过渡 — */
.expand-enter-active,
.expand-leave-active {
  transition: opacity 0.18s ease, max-height 0.22s ease;
  overflow: hidden;
}
.expand-enter-from,
.expand-leave-to {
  opacity: 0;
  max-height: 0;
}
.expand-enter-to,
.expand-leave-from {
  opacity: 1;
  max-height: 400px;
}

.legend-hint {
  margin-top: var(--space-3);
  font-size: 10px;
  color: var(--text-tertiary);
  font-family: var(--font-serif-cn);
  line-height: 1.5;
  flex-shrink: 0;
}

@media (max-width: 900px) {
  .globe-page {
    grid-template-columns: 1fr;
    height: auto;
    min-height: calc(100vh - 200px);
  }
  .globe-stage {
    height: 60vh;
  }
}
</style>
