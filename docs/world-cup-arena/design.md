---
title: World Cup Arena — 世界杯文化对决
type: 设计方案
status: 已定稿，待实施
created: 2026-05-25
updated: 2026-05-25
owner: 个人项目
---

<!-- AI 阅读指南
## 本文档是什么
个人娱乐项目的设计方案：以 2026 美加墨世界杯为题材，做一个文化学习 + 模拟对战的 Web 实验。
归属：Aildo-self-lab-Web/experiments/world-cup-arena/（待实现）。

## 关联文件
- 上游：用户 2026-05-25 脑暴对话
- 下游（未实现）：experiments/world-cup-arena/ 实际代码
- **独立项目**：不依赖任何其他子工程，前端直连多 LLM provider

## 调性提示
个人使用，无上线/审核/敏感性顾虑，可以包含战争/殖民等历史事件。
设计取舍优先考虑：1) 视觉精美 2) 学习深度 3) 对战趣味性。
-->

# World Cup Arena — 世界杯文化对决

> 工程位置：`Aildo-self-lab-Web/experiments/world-cup-arena/`
> 工作名称：`world-cup-arena`（可改名）

## 一、产品定位

- **核心调性**：文化学习 + 模拟对战（B + 轻 A 混合）
- **使用场景**：个人娱乐，无社交压力，无上线限制
- **核心循环**：选两个国家 → 抽文化卡牌 → 回合制出牌 → LLM 评分 → 看完整文化背景科普
- **次要循环**：浏览世界地图 → 点击参赛国 → 阅读该国文化百科 → 收集卡牌

「学得到、玩得爽、看得精致」三者必须同时满足。

---

## 二、本届世界杯背景（2026 FIFA World Cup 真实信息）

### 基本信息

| 项 | 内容 |
|---|---|
| 时间 | **2026 年 6 月 11 日 – 7 月 19 日**（39 天） |
| 主办国 | **美国 + 加拿大 + 墨西哥**（首次三国合办） |
| 参赛队 | **48 队**（从 32 队扩军，史上最大规模） |
| 赛制 | 12 组 × 4 队 → 每组前 2 + 最佳 8 个第 3 名 → 32 强淘汰赛 |
| 总场次 | 104 场（原为 64 场） |
| 决赛地 | 纽约/新泽西体育场（MetLife Stadium，东卢瑟福镇） |

### 16 个承办城市

- **美国 11 城**：亚特兰大、波士顿、达拉斯、休斯顿、堪萨斯城、洛杉矶、迈阿密、纽约/新泽西、费城、西雅图、旧金山湾区
- **加拿大 2 城**：多伦多、温哥华
- **墨西哥 3 城**：蒙特雷、瓜达拉哈拉、墨西哥城（阿兹特克体育场，第三次承办世界杯，史上唯一三届承办的球场）

### 48 强分洲明细

> 数据基于已确认的 45 个出线名额 + 3 个东道主名额（截至 2026-05）

- **欧洲（UEFA 16 队）**：英格兰、法国、克罗地亚、挪威、葡萄牙、德国、荷兰、奥地利、比利时、苏格兰、西班牙、瑞士、瑞典、土耳其、波黑、捷克
- **非洲（CAF 10 队）**：阿尔及利亚、佛得角、科特迪瓦、埃及、加纳、摩洛哥、塞内加尔、南非、突尼斯、刚果（金）
- **亚洲（AFC 9 队）**：澳大利亚、伊朗、日本、约旦、韩国、卡塔尔、沙特、乌兹别克斯坦、伊拉克
- **南美（CONMEBOL 6 队）**：阿根廷、巴西、哥伦比亚、厄瓜多尔、巴拉圭、乌拉圭
- **北中美（CONCACAF 6 队，含东道主）**：美国、加拿大、墨西哥、库拉索、海地、巴拿马
- **大洋洲（OFC 1 队）**：新西兰

### 历史性首次

- **8 个阿拉伯国家同时参赛**（阿尔及利亚、埃及、伊拉克、约旦、摩洛哥、卡塔尔、沙特、突尼斯）—— 史上最多
- **首次入围**：佛得角、库拉索、约旦、乌兹别克斯坦
- **库拉索成为最小的参赛国家**（人口约 15 万）

---

## 三、玩法设计

### 3.1 主界面：世界地图 OS

- **正交投影 3D 地球**（d3-geo `geoOrthographic`）—— 可拖拽旋转，参赛国发光
- **12 组配色高亮**——每个小组用一种考究的 NatGeo 调色板颜色（赭石、深青、暗红、橄榄绿等，**不用饱和原色**）
- **非参赛国**——保持 parchment 米黄底色，显示淡灰边界
- **承办国额外标记**——美国/加拿大/墨西哥地图上叠加金色细线边框 + 16 座承办城市发光小圆点
- **悬浮国家**：浮出半透明小卡片显示国名、国旗、所属小组、FIFA 排名

### 3.2 国家百科：点击国家后

每个参赛国进入"国家页"，含 6 个 tab：

1. **概览**——国旗、首都、人口、主要民族、官方语言、地理位置（小幅地球高亮该国）
2. **历史**——按时间轴展示该国 5-8 个重大历史事件
3. **文化**——艺术、音乐、文学、节日、习俗（每项 2-3 张图 + 100 字简介）
4. **足球**——本届阵容、历届世界杯成绩、传奇球星
5. **本届卡牌**——该国在游戏中拥有的 8-12 张文化卡牌预览
6. **AI 解说**——动态生成的"如果你刚到这个国家，最该体验什么"（调当前配置的 LLM provider）

### 3.3 文化卡牌系统

#### 卡牌结构

```typescript
type CulturalCard = {
  id: string;
  country: string;          // ISO 3 字母代码
  name: string;             // "长城" / "Pyramid of Giza"
  nameEn: string;
  category: CardCategory;   // 见下
  rarity: 'common' | 'rare' | 'legendary';
  era: string;              // "Ancient" / "Medieval" / "Modern"
  description: string;      // 200 字历史背景
  image: string;            // 资源路径
  attributes: {
    historical: number;     // 0-100 历史厚度
    artistic: number;       // 0-100 艺术价值
    influence: number;      // 0-100 全球影响力
    uniqueness: number;     // 0-100 独特性
  };
  tags: string[];           // ['religion', 'architecture', 'unesco']
};
```

#### 7 类卡牌（按色系区分）

| 类型 | 例子 | 强势对位 | 弱势对位 |
|------|------|---------|---------|
| 🏛️ **历史遗迹** | 长城、金字塔、马丘比丘 | 战争 | 现代 |
| ⚔️ **战争征服** | 蒙古西征、十字军、二战 | 哲学 | 艺术 |
| 🎨 **艺术经典** | 文艺复兴、印象派、浮世绘 | 战争 | 科技 |
| 🍜 **生活方式** | 寿司、火锅、地中海饮食 | 哲学 | 战争 |
| 🧠 **哲学思想** | 儒家、希腊哲学、伊斯兰黄金时代 | 现代 | 历史遗迹 |
| 🔬 **科技发明** | 印刷术、电力、互联网 | 艺术 | 生活方式 |
| ⭐ **现代影响** | K-pop、好莱坞、世界杯本身 | 历史遗迹 | 哲学 |

> 相克关系是 LLM 评分的**乘数**（被克制方扣 20%，相克方加 20%），让评分有可解释性而非纯黑箱。

#### 卡池规模（个人项目可行性优先）

- 第一版：**48 国 × 8 张 = 384 张普通卡 + 全局 60 张特殊卡 ≈ 450 张**
  - 普通卡（48 国 × 8）：覆盖 7 大类，每国保证 3 类以上覆盖
  - 特殊卡（60 张）：见下面"卡牌分级"
- 数据来源：**Claude curate**（AI 撰写 + 人工校对），保证质量与一致性
- 图片：Wikipedia Commons 公开图 + Unsplash + 必要时 AI 生成补缺

#### 卡牌分级（个人项目，无上线限制）

游戏内提供 3 档"内容尺度"开关，默认开到最高：

| 档位 | 名称 | 内容 |
|------|------|------|
| 🟢 PG | 安全模式 | 仅普通卡（艺术/历史/生活/科技），适合给家人看 |
| 🟡 R | 暗黑模式 | + 殖民、战争、屠杀、宗教冲突等真实历史阴暗面 |
| 🔴 X | **无下限模式** | + 飞卡牌（荒诞/猎奇/政治讽刺/超自然/都市传说） |

**X 档"无下限飞卡牌"设计原则**：

- 🛸 **超自然 & 都市传说**：UFO 罗斯威尔、克苏鲁、女巫审判、百慕大三角、雪人、跳跳尸
- 💉 **毒文化与黑产**：哥伦比亚毒枭传奇、阿姆斯特丹大麻、墨西哥黑帮电锯、日本极道
- 🃏 **政治讽刺**：朝鲜十一杆进洞、俄罗斯熊骑兵、土耳其总统金宝座、特朗普假发
- 👹 **暗黑历史**：宗教审判、纳粹炼金术、文革红卫兵、苏联古拉格
- 🍆 **荒诞文化**：泰国变性人选美、印度恒河火葬场、爱尔兰土豆大饥荒（黑色幽默版）
- 🎭 **现代邪典**：日本援交、瑞士辅助安乐死、新西兰原住民纹身、巴西足球流氓
- 🪐 **科幻向**：阿波罗登月阴谋论、SpaceX 火星殖民、中国天宫空间站、苏联宇航员墓地

> 详细 450 张卡牌清单单独维护在 `card-pool.md`（待生成）。无下限卡牌示例参见本文档[附录 A](#附录-a无下限飞卡牌样本)。

### 3.4 对战机制（**赛程驱动**）

> ⚠️ **决策更新（2026-05-25）**：对战不再是"任选两国"，而是严格按真实世界杯赛程走。
> 数据源：[openfootball/worldcup.json](https://github.com/openfootball/worldcup.json) — CC0 公共域，无需 API Key。

#### 赛程驱动 UX 流程

```
┌─ 主世界地图 ─────────────────────────────────┐
│  上方 banner：今日比赛  📅 2026-06-11        │
│  ┌─ 即将开始 ─────────────────────┐         │
│  │ 🇲🇽 墨西哥 vs 南非 🇿🇦           │         │
│  │ 13:00 UTC-6 · Mexico City      │         │
│  │ Group A · Matchday 1            │         │
│  │ [⚔ 进入对战]  [👁 AI 观战]      │         │
│  └─────────────────────────────────┘         │
│                                              │
│  3D 地球（两支即将对战的国家发光高亮）         │
│                                              │
│  下方：未来 7 天比赛列表（可滚动）             │
└──────────────────────────────────────────────┘
```

#### 单局流程

```
1. 用户从【今日】/【未来 7 天】/【全部 104 场】列表里选一场（不能任选两国）
2. 选边：代表 team1 还是 team2（另一边 AI 操控）
3. 各抽 5 张牌（来自所代表国家的卡池），洗剩余卡进牌堆
4. 5 回合：每回合双方各出 1 张牌
5. 每回合 LLM 裁判评分（0-100），高分得 1 分
6. 5 回合后总比分高者胜，平局进入"加时赛"（双方各打 1 张传奇牌定胜负）
7. 对局保存到 IndexedDB，关联真实比赛元数据（日期/场地/赛段）
```

#### 赛程视图模式

| 视图 | 说明 |
|------|------|
| 📅 **今日** | 当天的比赛（默认入口，赛事期间最常用） |
| 📆 **本周** | 未来 7 天列表 |
| 🏆 **小组赛** | 12 组 × 6 场 = 72 场 |
| ⚔️ **淘汰赛** | 32 强 / 16 强 / 8 强 / 半决赛 / 决赛（赛程数据用 `W101` 占位，需手动维护赢家映射或等 openfootball 自动更新） |
| 📜 **历史** | 我自己玩过的所有对局回放（IndexedDB 本地） |

#### 赛程数据同步策略

```typescript
// services/scheduleService.ts
const SCHEDULE_URL = 'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json';

// 1. 首次启动：拉取并缓存到 IndexedDB
// 2. 每次启动：异步刷新（304 缓存或对比 ETag）
// 3. 网络失败：fallback 到本地打包的 JSON 副本（src/data/schedule-snapshot.json）
// 4. 设置页提供"立即刷新赛程"按钮
```

#### 时间显示

- 数据里时间格式：`"20:00 UTC-6"` / `"13:00 UTC-6"`（不同场馆时区不同）
- 显示策略：**同时显示**当地时间 + 用户本地时间（基于 `Intl.DateTimeFormat`）
- 比赛状态自动判定：
  - 未开始（`now < kickoff`）：可以提前预演
  - 进行中（`kickoff <= now < kickoff + 2h`）：banner 标"⚡ 正在进行"
  - 已结束（`now >= kickoff + 2h`）：banner 标"✅ 已结束"，可补打

#### 赛程驱动的好处（重新审视）

- ✅ **代入感拉满**——和真实赛事节奏同频，每天打开都有"今日大戏"
- ✅ **球星彩蛋有锚点**——梅西 vs 葡萄牙、姆巴佩 vs 阿根廷这些"宿命对决"才会出现
- ✅ **小组对决体系化**——同组 6 场对完，刚好对应你对一个组所有国家的文化都熟了
- ✅ **赛程末期的剧场感**——决赛日打开看到 "🏆 7/19 Final" 一行高亮，仪式感拉满

#### LLM 裁判 prompt 核心要素

```
你是国际文化比较学者裁判。以下是两张文化卡牌的对决：

【A 国卡牌】<name> + <description> + <attributes>
【B 国卡牌】<name> + <description> + <attributes>

【相克关系】A 类型对 B 类型: <buff/debuff/neutral>

请从 4 个维度各打 0-25 分（合计 0-100）：
- 历史深度
- 艺术价值
- 全球影响力
- 文化独特性

输出 JSON：
{
  "a_score": <数字>,
  "b_score": <数字>,
  "verdict": "<一句结论，犀利幽默风>",
  "fun_fact": "<冷知识，让用户学到东西>"
}
```

#### 加分玩法

- **主场加成**：如果对战的两国之一是本届承办国（美/加/墨），该国卡牌全程 +10%
- **冷门红利**：库拉索、佛得角等首次参赛国出牌时 +15%（鼓励玩家选弱国）
- **死亡之组**：如果两国在同一小组（真实分组），评分火药味升级（裁判 prompt 加"用更对抗性的语气"）
- **回放模式**：每局结束保存到本地 IndexedDB，可以回看历史对决和裁判金句

### 3.5 赛程模拟（你的第 4 点 — 暂作 V2）

> **V1 不做**完整 104 场赛程模拟，太重。V1 只做"任选两国对战"。
> **V2** 再考虑：按真实赛程一场场打，记录"我的世界杯日记"，每天对应真实比赛的两国进行 AI 对 AI 模拟，玩家观战。

---

### 3.6 骚操作五件套（V1 全部包含）

#### ① 裁判金句墙（Wall of Verdicts）
- 每局裁判评分时给出的 "verdict" + "fun_fact" 自动入库
- 单独页面 `/wall-of-verdicts`，按"最毒舌 / 最长见识 / 最荒诞"标签筛选
- 支持收藏、删除、导出为 Markdown
- 目标：长期攒一面"我的世界杯文化墙"

#### ② 球星彩蛋卡牌（Legend Drop）
- 每国预置 1-2 张**传奇球星卡**（梅西/C 罗/姆巴佩/哈兰德/孙兴慜……）
- 抽卡时极小概率（5%）替换为该国传奇卡
- 传奇卡属性比同国普通卡高 30%，但只能用 1 次（一场对决最多 1 张）
- 弹出时配特效：金色光晕 + 球员动作剪影（用 Wikipedia Commons CC 图源）

#### ③ 今日 NatGeo 开屏（Daily Feature）
- 每天首次打开时全屏展示一张 NatGeo 风格"今日聚焦国家"
- 内容：一张高清地标图 + 国旗 + 100 字冷知识（LLM 动态生成）
- 配文字体用 Cinzel 大字 + 衬线，全屏黑底 + 金线分隔
- 点击进入该国详情，跳过则进主世界地图
- 推动学习粘性：每天一国，48 国轮一遍刚好覆盖 7 周

#### ④ 音乐彩蛋（Ambient Music）
- 浏览到某国时，背景音轻轻响起该国音乐元素（30 秒 loop）
- 阿根廷 → 探戈 / 巴西 → 桑巴 / 印度 → 西塔琴 / 日本 → 三味线 / 摩洛哥 → 北非鼓
- 资源：[Freesound.org](https://freesound.org/) 找 CC0/CC-BY 的传统乐器 loop
- **默认关闭**（操作员选了"V1 不加音效"），但代码层预留接口，用户可在 settings 里开启

#### ⑤ AI vs AI 观战模式（Spectator Mode）
- 玩家不出牌，选定两国后看 AI 自动对战
- 节奏放慢：每回合 5 秒展示卡牌 + 5 秒展示裁判评分
- 适合：泡咖啡时挂着看一场荷兰 vs 葡萄牙的文化对决
- 入口：对战页右上角 "👁 观战" 按钮

---

## 四、视觉设计 — National Geographic 风

### 4.1 字体

| 用途 | 字体 | 来源 |
|------|------|------|
| 主标题（衬线感、权威感） | **Geograph**（Klim 出品，NatGeo 官方字体） | [Klim Type Foundry](https://klim.co.nz/fonts/geograph/) — 商用付费 |
| 替代（个人项目可用） | **IBM Plex Sans** / **Inter** | Google Fonts 免费 |
| 标题艺术化 | **Cinzel**（罗马碑刻风） | Google Fonts 免费 |
| 等宽（数据展示） | **JetBrains Mono** | Google Fonts 免费 |
| 中文 | **思源宋体**（地图标注） + **思源黑体**（正文） | Google Fonts / Adobe 免费 |

**最终推荐组合**：`Cinzel` 主标题 + `IBM Plex Sans` 正文 + `思源宋体` 中文标注 + `JetBrains Mono` 数据。

### 4.2 配色

NatGeo 经典调色板（**绝对不用饱和原色**）：

```css
:root {
  /* 底色 */
  --bg-parchment: #f4e8d0;       /* 老地图羊皮纸米黄 */
  --bg-parchment-dark: #2a2419;  /* 深色模式 */
  --bg-ocean: #d8dec8;           /* 大洋灰绿 */

  /* 12 个小组配色（赭石/青/赭/橄榄 4 大类各 3 渐变） */
  --group-a: #8b4513;   /* 赭石 */
  --group-b: #a0522d;   /* 浅赭 */
  --group-c: #cd853f;   /* 暗金 */
  --group-d: #2f4f4f;   /* 深青 */
  --group-e: #5f8a8b;   /* 浅青 */
  --group-f: #708090;   /* 蓝灰 */
  --group-g: #6b4423;   /* 深棕红 */
  --group-h: #800020;   /* 勃艮第红 */
  --group-i: #722f37;   /* 暗酒红 */
  --group-j: #556b2f;   /* 橄榄绿 */
  --group-k: #6b8e23;   /* 浅橄榄 */
  --group-l: #8b8b00;   /* 暗黄绿 */

  /* 强调色 */
  --accent-gold: #d4a017;        /* NatGeo 经典金线 */
  --accent-deep: #1a1a2e;        /* 深蓝黑（封面感） */
  --text-primary: #2a2419;
  --text-secondary: #6b5d4f;
}
```

### 4.3 视觉资产

#### 必备

- **世界地图数据**：[Natural Earth](https://www.naturalearthdata.com/)（1:50m 精度足够 Web 用，免费 CC0）→ 通过 [topojson/world-atlas](https://github.com/topojson/world-atlas) 拿打包好的 TopoJSON
- **国家边界 GeoJSON 备选**：[martynafford/natural-earth-geojson](https://github.com/martynafford/natural-earth-geojson)
- **国旗 SVG**：[hampusborgos/country-flags](https://github.com/hampusborgos/country-flags)（4:3 比例，全 257 个国家，MIT 协议）
- **国旗 CSS 直接 CDN**：[flag-icons (lipis)](https://flagicons.lipis.dev/) `https://cdn.jsdelivr.net/gh/lipis/flag-icons@7.3.2/css/flag-icons.min.css`
- **羊皮纸纹理**：[Zemtime 35+ 免费纹理包](https://www.zemtime.com/free-download-35-old-parchment-textures/)（3000px+ 高清，可商用）

#### 可选增强

- **承办城市地标插画**：用 [Heroicons](https://heroicons.com/) / [Lucide](https://lucide.dev/) 的建筑图标
- **文化卡牌图片**：
  - 第一优先：[Wikimedia Commons](https://commons.wikimedia.org/)（CC0/CC-BY 协议，质量高）
  - 第二优先：[Unsplash](https://unsplash.com/) 免费高清图
  - 第三优先：AI 生成（个人项目用 Midjourney/SD 兜底）

### 4.4 关键视觉细节

- 所有地图边界用 **0.5px 极细线**（致敬 NatGeo 制图传统）
- 标题字体描金 **#d4a017** 1px 描边
- 卡牌使用**邮票齿孔**边框 + 内嵌**轻微纸张噪点**
- 主界面右下角放一个**指南针玫瑰花**（compass rose），可旋转
- 加载动画：**轮船航行轨迹**（虚线沿球面绘制）
- 国家点击动效：**镜头从世界俯冲到该国**（500ms ease-out 缩放 + 旋转）

---

## 五、技术架构

### 5.1 技术栈（决策已定）

| 模块 | 选型 | 理由 |
|------|------|------|
| 框架 | **Vue 3 + Vite + TypeScript** | 决策 Q1；组件化适合多视图扩展 |
| 路由 | **Vue Router 4** | 多页面切换（地图/国家/对战/墙/设置） |
| 状态管理 | **Pinia** | 配合 Vue 3 原生体验 |
| 地图渲染 | **D3.js v7**（`d3-geo` + `d3-zoom` + `d3-selection`） | 业界标准，正交投影开箱即用 |
| 卡牌动画 | **GSAP**（免费 standard 版） | 复杂时间线动画好写 |
| LLM 接入 | **前端直连多 provider**（见 5.3） | 决策 Q3；个人项目无服务器成本，key 存 localStorage |
| 数据存储 | **IndexedDB**（dexie.js 封装） | 本地保存对局回放、收藏卡牌、裁判金句 |
| 部署 | **本地起服务** | `pnpm dev`，不需要上线 |

### 5.2 LLM Provider 抽象层（核心架构）

> 决策 Q3：支持切换 provider，Ollama 本地 / 自配 API Key。

#### Provider 抽象接口

```typescript
// services/llmProviders/types.ts
export interface LLMProvider {
  id: string;
  name: string;
  requiresApiKey: boolean;
  defaultModel: string;
  availableModels: string[];

  // 核心方法
  chat(messages: Message[], options: ChatOptions): Promise<ChatResponse>;

  // 健康检查（settings 页面用）
  ping(): Promise<{ ok: boolean; latency: number; error?: string }>;
}

export type Message = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type ChatOptions = {
  temperature?: number;
  responseFormat?: 'text' | 'json_object';
  maxTokens?: number;
};
```

#### 内置 Provider 实现

| Provider | 端点 | 模型示例 | 特点 |
|----------|------|---------|------|
| **Ollama**（本地） | `http://localhost:11434/api/chat` | `llama3.2`, `qwen2.5`, `mistral` | 无需 Key，完全本地，免费 |
| **OpenAI** | `https://api.openai.com/v1/chat/completions` | `gpt-4o`, `gpt-4o-mini` | 需要 OPENAI_API_KEY |
| **Anthropic** | `https://api.anthropic.com/v1/messages` | `claude-3-5-sonnet`, `claude-3-5-haiku` | 需要 ANTHROPIC_API_KEY |
| **Gemini** | `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` | `gemini-2.0-flash`, `gemini-1.5-pro` | 需要 GEMINI_API_KEY |
| **Custom OpenAI-Compatible** | 用户自填 baseURL | 用户自填 | 支持 DeepSeek/Moonshot/Together AI 等所有 OpenAI 兼容服务 |

#### Settings 页面 UI

```
┌─ Settings ─────────────────────────────────┐
│                                            │
│  当前 Provider: [Ollama (llama3.2) ▼]      │
│                                            │
│  ── Ollama ──                              │
│  Base URL:  http://localhost:11434         │
│  Model:     [llama3.2 ▼]                   │
│  [测试连接]  ✓ 23ms                         │
│                                            │
│  ── OpenAI ──                              │
│  API Key:   ********************           │
│  Model:     [gpt-4o-mini ▼]                │
│  [测试连接]                                 │
│                                            │
│  ── Custom OpenAI-Compatible ──            │
│  Base URL:  https://api.deepseek.com/v1    │
│  API Key:   ********************           │
│  Model:     deepseek-chat                  │
│  [测试连接]                                 │
│                                            │
│  ── 通用 ──                                │
│  裁判 temperature:  [0.3]                  │
│  内容尺度:          ◯ PG  ◯ R  ⦿ X (无下限) │
│  音效:              ☐ 开启                  │
│                                            │
│  [保存]  [重置]                            │
└────────────────────────────────────────────┘
```

#### Key 存储方案

- 全部存 `localStorage`（个人项目，本机使用，不上传任何后端）
- 显示时打码（仅前 6 + 后 4 字符可见）
- 提供"清空所有 Key"按钮
- **不做加密**——个人项目，浏览器本身的同源策略足够

### 5.3 目录结构

```
Aildo-self-lab-Web/
├── docs/
│   └── world-cup-arena/
│       ├── design.md              ← 本文档
│       ├── card-pool.md           ← 450 张卡牌定稿数据
│       ├── llm-prompts.md         ← 各种 prompt 模板与调试记录
│       └── visual-references/     ← NatGeo 风格参考图收集
├── experiments/
│   └── world-cup-arena/
│       ├── index.html
│       ├── package.json
│       ├── vite.config.ts
│       ├── tsconfig.json
│       ├── src/
│       │   ├── main.ts
│       │   ├── App.vue
│       │   ├── router/
│       │   │   └── index.ts             # /globe /country/:id /battle /wall /settings /daily
│       │   ├── views/
│       │   │   ├── Globe.vue            # 主世界地图
│       │   │   ├── CountryDetail.vue    # 国家百科（6 tab）
│       │   │   ├── Battle.vue           # 对战界面
│       │   │   ├── Spectator.vue        # AI vs AI 观战
│       │   │   ├── WallOfVerdicts.vue   # 裁判金句墙
│       │   │   ├── DailyFeature.vue     # 今日 NatGeo 开屏
│       │   │   └── Settings.vue         # Provider 配置
│       │   ├── components/
│       │   │   ├── CulturalCard.vue
│       │   │   ├── CompassRose.vue
│       │   │   ├── RefereeVerdict.vue
│       │   │   ├── LegendDrop.vue       # 球星彩蛋特效
│       │   │   └── ContentLevelGate.vue # 暗黑/无下限模式守门
│       │   ├── stores/
│       │   │   ├── settings.ts          # Provider 配置 + 内容尺度
│       │   │   ├── battle.ts            # 当前对战状态
│       │   │   └── collection.ts        # 历史对局 + 金句收藏
│       │   ├── services/
│       │   │   ├── llmProviders/
│       │   │   │   ├── types.ts
│       │   │   │   ├── ollama.ts
│       │   │   │   ├── openai.ts
│       │   │   │   ├── anthropic.ts
│       │   │   │   ├── gemini.ts
│       │   │   │   └── customOpenAICompat.ts
│       │   │   ├── scheduleService.ts   # 拉 openfootball + 缓存 + 今日/本周/全部视图
│       │   │   ├── refereeService.ts    # 调 LLM 评分
│       │   │   ├── battleEngine.ts      # 对战回合机
│       │   │   └── dailyFeatureService.ts
│       │   ├── data/
│       │   │   ├── countries.json           # 48 国基础信息
│       │   │   ├── groups.json              # 12 组分组
│       │   │   ├── schedule-snapshot.json   # openfootball 离线 fallback 副本
│       │   │   ├── cards/
│       │   │   │   ├── _pg/                 # PG 档卡牌按国家分文件
│       │   │   │   │   ├── ARG.json
│       │   │   │   │   └── ...
│       │   │   │   ├── _r/                  # R 档（暗黑历史）
│       │   │   │   └── _x/                  # X 档（无下限飞卡牌）
│       │   │   └── world-110m.json          # TopoJSON 地图
│       │   ├── prompts/
│       │   │   ├── referee.txt
│       │   │   ├── countryIntro.txt
│       │   │   └── dailyFeature.txt
│       │   └── styles/
│       │       ├── tokens.css           # NatGeo 色彩/字体变量
│       │       ├── parchment.css        # 纸张纹理
│       │       └── compass.css
│       └── public/
│           ├── flags/                   # 国旗 SVG (或用 CDN)
│           ├── textures/                # 羊皮纸纹理
│           ├── audio/                   # 各国 ambient（V2 启用）
│           └── fonts/                   # 字体文件
└── index.html                           # 更新 EXPERIMENTS 列表追加本实验
```

---

## 六、实施路线图（17 天倒推到 6/11 开赛）

> 个人项目，没有 deadline 压力，但建议踩着世界杯节奏做，开赛前能玩起来最有仪式感。

### Week 1（5/25 – 5/31）— 数据 + 骨架

- [ ] 搭 Vite + Vue 3 + TS 项目骨架，配置 Vue Router + Pinia
- [ ] 整理 48 国基础数据 JSON（国旗、首都、人口、官方语言、所属小组）
- [ ] LLM Provider 抽象层 + 5 个 provider 实现 + Settings 页面
- [ ] 主世界地图 MVP（D3 正交投影、可旋转、48 国按组配色）
- [ ] 国旗 CDN 接入 + 字体加载（Cinzel + IBM Plex Sans + 思源宋体）

### Week 2（6/1 – 6/7）— 玩法 + 卡牌

- [ ] **Claude 撰写 450 张卡牌**（384 普通 + 60 R/X 档 + 6-8 张球星彩蛋传奇卡）
- [ ] 国家详情页（6 个 tab）
- [ ] 卡牌组件（NatGeo 邮票齿孔视觉）
- [ ] 对战引擎（回合制状态机 + 相克乘数）
- [ ] LLM 裁判接入 + 评分 JSON 解析
- [ ] 对战结束页 + 裁判金句入库

### Week 3（6/8 – 6/10）— 骚操作 + 打磨

- [ ] 裁判金句墙
- [ ] 球星彩蛋（Legend Drop 特效）
- [ ] 今日 NatGeo 开屏
- [ ] AI vs AI 观战模式
- [ ] 内容尺度开关（PG/R/X 切换）
- [ ] 视觉细节：羊皮纸纹理、指南针、加载动画、镜头俯冲
- [ ] 性能优化（地图 60fps、卡牌动画不掉帧）
- [ ] 自己玩 5 局，找 bug

### 赛中迭代（6/11 – 7/19）— 真实赛事联动

- [ ] V1.1：当日比赛的两国在游戏内对战时，根据真实比分给 buff
- [ ] V1.2：把真实比分写进卡牌"今日纪念版"
- [ ] V1.3：音乐彩蛋启用（各国 ambient loop）
- [ ] V2：赛程模拟模式（按真实赛程逐场打）

---

## 七、可直接复用的资源清单（开发时索引）

### 数据

- 地图 TopoJSON：`https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json`
- 国旗 CDN：`https://cdn.jsdelivr.net/gh/lipis/flag-icons@7.3.2/`
- 国家维基百科数据可用 `https://en.wikipedia.org/api/rest_v1/page/summary/<国家名>`
- **世界杯赛程**：`https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json`（CC0，无 Key）
  - 字段：`round`, `date`, `time`(含时区), `team1`, `team2`, `group`, `ground`
  - 淘汰赛阶段用 `W101`、`W102` 占位符（"Winner of Match 101"）
  - 2022 旧数据有 `score` + `goals` 字段，2026 会随赛事推进自动更新

### 字体

- Google Fonts：`<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700&family=IBM+Plex+Sans:wght@400;500;700&family=Noto+Serif+SC:wght@400;700&display=swap" rel="stylesheet">`
- JetBrains Mono：同上 Google Fonts

### 库

- D3：`npm install d3 topojson-client`
- GSAP：`npm install gsap`
- Dexie：`npm install dexie`

### 视觉参考

- NatGeo 制图风格集：https://www.nationalgeographic.com/maps/
- Klim Geograph 字体页：https://klim.co.nz/fonts/geograph/
- 羊皮纸纹理：https://www.zemtime.com/free-download-35-old-parchment-textures/

---

## 八、决策结论（2026-05-25 已定）

| Q | 主题 | 结论 |
|---|------|------|
| Q1 | 框架 | **Vue 3 + Vite + TypeScript** |
| Q2 | 卡牌生成 | **Claude curate**（AI 撰写 + 一致性校对） |
| Q3 | LLM 接入 | **多 provider 切换**：Ollama / OpenAI / Anthropic / Gemini / 自定义 OpenAI 兼容 |
| Q4 | 项目名 | **world-cup-arena** |
| Q5 | 音效 | **V1 不加**，V2 上各国 ambient 彩蛋 |
| Q6 | 设备 | **桌面优先** |
| Q7 | 内容尺度 | **3 档可切（PG/R/X），默认 X 无下限** |
| 骚操作 | 五件套 | **全部 V1 落地**（裁判墙 + 球星彩蛋 + 今日 NatGeo + 音乐彩蛋接口 + AI 观战） |

---

## 九、风险与不确定性

| 风险 | 应对 |
|------|------|
| 384 张卡牌内容质量参差 | 个人玩的过程中遇到错的就改，无所谓 |
| LLM 评分不稳定（同样的牌得分波动） | 设置 temperature=0.3，加随机种子可复现 |
| 世界地图渲染性能（48 国边界 + 旋转） | TopoJSON 用 110m 精度（约 100KB），渲染前简化 |
| 视觉风格还原度不够（不像 NatGeo） | 早期先找 20 张 NatGeo 杂志封面/地图当参考图钉在桌面 |
| 字体版权（Geograph 是付费的） | 用 IBM Plex Sans / Cinzel 免费替代，调字距/字重逼近效果 |

---

## 附录 A：无下限飞卡牌样本（30 张试水）

> 仅供调性校准。最终 X 档 60 张完整清单进 `card-pool.md`。
> ⚠️ 个人项目，无道德/版权审查。如果某张让你皱眉头，告诉我，调或删。

### 🛸 超自然 & 都市传说

| # | 国 | 卡名 | 一句梗描述 |
|---|----|------|----------|
| 1 | 🇺🇸 美国 | **罗斯威尔 51 区** | 1947 年新墨西哥外星人坠机，永远的"政府否认"复读机 |
| 2 | 🇲🇽 墨西哥 | **亡灵之夜** | 死者归来，骷髅花脸，墨西哥人对死亡最浪漫的回应 |
| 3 | 🇯🇵 日本 | **杀生石与九尾狐** | 那须高原裂开的石头封印了千年妖狐，2022 年它裂了 |
| 4 | 🇧🇷 巴西 | **Encantado 粉红河豚人** | 亚马逊传说：粉红河豚夜里变帅哥勾引少女，孩子们都叫他爸爸 |
| 5 | 🇮🇷 伊朗 | **波斯地毯里的精灵 Jinn** | 古兰经认证的次维度生命体，住在你家地毯花纹里 |

### 💉 毒文化与黑产

| # | 国 | 卡名 | 一句梗描述 |
|---|----|------|----------|
| 6 | 🇨🇴 哥伦比亚 | **巴勃罗·埃斯科巴** | 一人养活整个麦德林，最后被自家屋顶上一枪解决 |
| 7 | 🇳🇱 荷兰 | **阿姆斯特丹大麻咖啡馆** | 唯一买大麻像点拿铁的国家，菜单按 THC 浓度排序 |
| 8 | 🇲🇽 墨西哥 | **锡那罗亚卡特尔** | 把潜水艇造来运毒、给毒贩拍 MV 拍出 1 亿播放的国家 |
| 9 | 🇯🇵 日本 | **山口组** | 公司化运营 100 年的黑帮，有名片、有总部大厦、还登记纳税 |
| 10 | 🇷🇺 俄罗斯 | **伏特加洗澡** | 国民人均每年喝 15 升纯酒精，平均寿命因此短 5 年 |

### 🃏 政治讽刺

| # | 国 | 卡名 | 一句梗描述 |
|---|----|------|----------|
| 11 | 🇰🇷 韩国（双关朝鲜） | **金正恩 18 洞 11 杆进洞** | 朝中社官方记录：第一次打高尔夫，38 杆打完 18 洞 |
| 12 | 🇷🇺 俄罗斯 | **普京骑熊** | 没人拍到过的世界级摆拍，但全网都信它存在 |
| 13 | 🇺🇸 美国 | **特朗普的橙色** | 一种发型 + 一种肤色 + 一种推特句式 = 一个时代 |
| 14 | 🇹🇷 土耳其 | **埃尔多安的 1100 间房宫殿** | 比白宫大 30 倍，连普京去了都说太奢侈 |
| 15 | 🇫🇷 法国 | **马克龙与布丽吉特** | 15 岁老师 + 39 岁学生 = 总统配偶，最浪漫的法式标本 |

### 👹 暗黑历史（真实发生过）

| # | 国 | 卡名 | 一句梗描述 |
|---|----|------|----------|
| 16 | 🇩🇪 德国 | **纳粹炼金术 Ahnenerbe** | 党卫军派人去西藏找雅利安人起源，认真的 |
| 17 | 🇧🇪 比利时 | **利奥波德二世的刚果** | 私人殖民地，5 年砍掉 1000 万人的手，欧洲贵族集体沉默 |
| 18 | 🇬🇧 英格兰 | **东印度公司** | 一家私营企业拥有 26 万军队、占领整个印度、卖鸦片到中国 |
| 19 | 🇸🇦 沙特 | **瓦哈比派输出** | 用石油美元资助全球极端伊斯兰教 50 年，自己国内禁酒禁电影 |
| 20 | 🇪🇸 西班牙 | **宗教裁判所** | 350 年烧死 3 万异端，发明"水刑"，连达·芬奇都被怀疑过 |

### 🍆 荒诞文化

| # | 国 | 卡名 | 一句梗描述 |
|---|----|------|----------|
| 21 | 🇹🇭 泰国 | **变性人选美 Miss Tiffany** | 全亚洲最美的"她"在曼谷，颜值碾压顺性别选手 |
| 22 | 🇮🇳 印度 | **恒河漂浮的瑜伽士** | 一边火葬一边洗澡一边喝水，三亿神明保佑你不会拉肚子 |
| 23 | 🇮🇪 爱尔兰 | **土豆大饥荒** | 一种霉菌干掉一种作物，100 万人饿死、200 万人逃去美国 |
| 24 | 🇨🇭 瑞士 | **辅助安乐死旅游** | 全世界唯一合法陪外国人去死的国家，机构叫 Dignitas |
| 25 | 🇳🇿 新西兰 | **毛利战吼 Haka** | 比赛前不跳就输一半，舌头伸出来 30 厘米吓退英格兰队 |

### 🪐 科幻向

| # | 国 | 卡名 | 一句梗描述 |
|---|----|------|----------|
| 26 | 🇺🇸 美国 | **阿波罗登月（含阴谋论）** | 库布里克在好莱坞片场拍的，旗子怎么会飘？ |
| 27 | 🇷🇺 俄罗斯 | **加加林之死与失踪宇航员** | 第一个上天的人 7 年后摔飞机死了，传说他之前还有 3 个没回来的 |
| 28 | 🇨🇳 中国（梗用，非参赛） | — | （中国没进 2026，跳过，不做卡） |
| 29 | 🇸🇪 瑞典 | **维京登月** | 一群相信奥丁的人造出了沃尔沃、宜家、Spotify 和瑞典死亡金属 |
| 30 | 🇪🇬 埃及 | **法老的诅咒** | 1923 年开图坦卡蒙墓的考古队 11 人在 10 年内全死了，巧合 |

### 调性说明

- **不打擦边的种族歧视梗**（如：黑人 XX 笑话、犹太人 XX 笑话）—— 这种纯粹冒犯，不是文化
- **不虚构暴力**（如：编造某国总统强奸案）—— 只用真实有据的暗黑历史
- **政治讽刺只对掌权者**（普京/特朗普/金正恩可以梗，普通老百姓不行）
- **"无下限"≠"无脑黄暴"**，而是**有据可查的猎奇 + 黑色幽默剪辑**
- **裁判 prompt 在 X 档要求毒舌但博学**，类似锐评家 + 历史学者的混合人格

---

## 十、下一步

决策已定，进入实施。建议路径：

1. **立即**：操作员过审[附录 A](#附录-a无下限飞卡牌样本-30-张试水)的调性 → 若 OK 就开始 Week 1
2. **本周末（5/26-5/31）**：搭骨架 + Provider 抽象 + 主世界地图 MVP
3. **下周（6/1-6/7）**：Claude 撰写 450 张卡牌 + 国家详情页 + 对战引擎 + LLM 裁判接入
4. **赛前最后一周（6/8-6/10）**：骚操作五件套 + 视觉打磨 + bug 修复
5. **赛中（6/11-7/19）**：边玩边迭代，每场真实比赛后做联动更新

### 待操作员触发实施的 3 个动作

- ✅ **过审附录 A 调性**：飞得不够 / 太飞 / 刚好？哪些要删？要补哪些方向？
- ✅ **开始动手**：操作员说"开干"后，我派子进程搭骨架（按 CLAUDE.md 执行原则，子仓库工作走子进程）
- ✅ **分支策略**：本仓库 main 分支为唯一开发分支？还是开 `feature/world-cup-arena`？（个人项目建议直接 main）

---

## 参考链接（研究材料原文出处）

### 2026 世界杯数据
- [2026 FIFA World Cup - Wikipedia](https://en.wikipedia.org/wiki/2026_FIFA_World_Cup)
- [Qualified teams - FIFA 官方](https://www.fifa.com/en/tournaments/mens/worldcup/canadamexicousa2026/articles/world-cup-2026-who-has-qualified)
- [2026 World Cup qualification - Wikipedia](https://en.wikipedia.org/wiki/2026_FIFA_World_Cup_qualification)
- [Yahoo Sports 赛程汇总](https://sports.yahoo.com/soccer/article/2026-world-cup-schedule-qualified-teams-groups-match-dates-fixtures-how-to-watch-050724214.html)
- [ESPN 48 队明细](https://www.espn.com/soccer/story/_/id/40297462/2026-world-cup-how-nations-world-qualify)

### National Geographic 视觉资源
- [Klim Type Foundry - Geograph 字体](https://klim.co.nz/fonts/geograph/)
- [NatGeo 制图字体历史](https://www.nationalgeographic.com/maps/article/national-geographics-cartogaphic-typefaces)

### 地图数据
- [Natural Earth Data](https://www.naturalearthdata.com/)
- [topojson/world-atlas](https://github.com/topojson/world-atlas)
- [martynafford/natural-earth-geojson](https://github.com/martynafford/natural-earth-geojson)
- [React Simple Maps 地图文件参考](https://www.react-simple-maps.io/docs/map-files/)

### 国旗资源
- [flag-icons (lipis)](https://flagicons.lipis.dev/) — CSS + CDN
- [hampusborgos/country-flags](https://github.com/hampusborgos/country-flags) — SVG + PNG 多分辨率

### 纹理资源
- [Zemtime 35+ 免费羊皮纸纹理](https://www.zemtime.com/free-download-35-old-parchment-textures/)
- [Vecteezy 老地图纹理库](https://www.vecteezy.com/free-photos/old-map-texture)

### D3 地球
- [D3 Orthographic 官方示例](https://observablehq.com/@d3/orthographic)
- [d3-geo GitHub](https://github.com/d3/d3-geo)
- [Create a rotating globe using React and D3](https://www.createwithdata.com/react-rotating-globe/)
