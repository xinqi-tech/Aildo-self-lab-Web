/**
 * 文化卡牌类型定义。详见 docs/world-cup-arena/design.md §3.3
 *
 * 内容尺度三档（与 settings.contentLevel 对应）：
 *   - 'pg' 安全：艺术 / 历史 / 生活 / 科技，无敏感内容
 *   - 'r'  暗黑：殖民、战争、屠杀、宗教冲突等真实历史阴暗面
 *   - 'x'  无下限：荒诞 / 猎奇 / 政治讽刺 / 超自然 / 都市传说
 *
 * 注：JSON 加载后通过 `level` 字段就能定位文件落点（_pg/_r/_x），
 *     避免运行时再读路径反推。
 */

export type CardCategory =
  | 'historical' // 🏛 历史遗迹
  | 'war' // ⚔ 战争征服
  | 'art' // 🎨 艺术经典
  | 'lifestyle' // 🍜 生活方式
  | 'philosophy' // 🧠 哲学思想
  | 'tech' // 🔬 科技发明
  | 'modern'; // ⭐ 现代影响

export type CardLevel = 'pg' | 'r' | 'x';
export type CardRarity = 'common' | 'rare' | 'legendary';

export interface CardAttributes {
  /** 历史厚度 0-100 */
  historical: number;
  /** 艺术价值 0-100 */
  artistic: number;
  /** 全球影响力 0-100 */
  influence: number;
  /** 文化独特性 0-100 */
  uniqueness: number;
}

export interface CulturalCard {
  /** 唯一 id，格式 'ISO3_NNN'，如 'ARG_001' */
  id: string;
  /** ISO 3 字母国家代码 */
  country: string;
  level: CardLevel;
  /** 中文名 */
  name: string;
  /** 英文名 */
  nameEn: string;
  category: CardCategory;
  rarity: CardRarity;
  /** 'Ancient' / 'Medieval' / 'Modern' 或具体年份字符串 */
  era: string;
  /** 150-250 字背景描述 */
  description: string;
  /** 单 emoji 当临时图 */
  emoji: string;
  attributes: CardAttributes;
  tags: string[];
}

/** 卡牌类别中文标签（UI 用） */
export const CATEGORY_LABELS: Record<CardCategory, string> = {
  historical: '历史遗迹',
  war: '战争征服',
  art: '艺术经典',
  lifestyle: '生活方式',
  philosophy: '哲学思想',
  tech: '科技发明',
  modern: '现代影响',
};

/** 卡牌类别 emoji（UI 徽章） */
export const CATEGORY_EMOJI: Record<CardCategory, string> = {
  historical: '🏛',
  war: '⚔',
  art: '🎨',
  lifestyle: '🍜',
  philosophy: '🧠',
  tech: '🔬',
  modern: '⭐',
};

/** 卡牌类别色（CSS var） */
export const CATEGORY_COLORS: Record<CardCategory, string> = {
  historical: '#8b4513',
  war: '#6f1d1b',
  art: '#722f37',
  lifestyle: '#cd853f',
  philosophy: '#2f4f4f',
  tech: '#5f8a8b',
  modern: '#d4a017',
};

/** 稀有度色 */
export const RARITY_COLORS: Record<CardRarity, string> = {
  common: '#6b5d4f',
  rare: '#5f8a8b',
  legendary: '#d4a017',
};

export const LEVEL_LABELS: Record<CardLevel, string> = {
  pg: 'PG · 安全',
  r: 'R · 暗黑',
  x: 'X · 无下限',
};
