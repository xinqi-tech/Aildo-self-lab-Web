# World Cup Arena

2026 世界杯文化对战 Web 实验 — National Geographic 风。

## 启动

```bash
pnpm install
pnpm dev
```

浏览器打开 `http://localhost:5173/`。

## 设计文档

完整方案：`../../docs/world-cup-arena/design.md`

## 阶段 1（当前）

- Vite + Vue 3 + TS + Vue Router + Pinia
- LLM Provider 抽象层（Ollama / OpenAI / Anthropic / Gemini / Custom）
- Settings 页面 + localStorage 持久化
- 主世界地图（D3 正交投影 + 12 组 NatGeo 配色）
- 赛程服务（openfootball + Dexie 缓存）+ 顶部今日比赛 Banner

## 阶段 2/3（待做）

- 卡牌池数据（450 张）
- 对战引擎 + LLM 裁判
- 国家详情页 / 裁判金句墙 / 球星彩蛋 / 今日 NatGeo 开屏 / AI 观战
