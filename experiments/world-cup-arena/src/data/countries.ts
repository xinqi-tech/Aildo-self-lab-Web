/**
 * 2026 世界杯 48 强基础数据。
 * - iso3: ISO 3166-1 alpha-3（与 world-atlas TopoJSON 的 id 字段相匹配，方便地图高亮）
 * - 中文名 + 英文名 + 国旗 emoji + 大洲
 * - group: 12 组（A-L），FIFA 官方抽签后请覆盖 placeholder
 *
 * 数据来源：design.md §2 + Wikipedia ISO 3166-1
 */

export type Confederation = 'UEFA' | 'CAF' | 'AFC' | 'CONMEBOL' | 'CONCACAF' | 'OFC';
export type GroupKey =
  | 'A'
  | 'B'
  | 'C'
  | 'D'
  | 'E'
  | 'F'
  | 'G'
  | 'H'
  | 'I'
  | 'J'
  | 'K'
  | 'L';

export interface Country {
  iso3: string; // 主键，与 TopoJSON id 一致
  iso2: string; // 用于 lipis flag-icons CSS：fi-xx（小写）
  nameEn: string;
  nameZh: string;
  flag: string; // emoji
  confederation: Confederation;
  group: GroupKey;
  isHost?: boolean; // 美/加/墨
}

/**
 * 分组：FIFA 官方抽签前的 placeholder。
 * 规则：东道主放 A/B/C，欧洲均匀洒到剩余 9 组，其他洲补齐。
 * 真实抽签后请直接改 group 字段。
 */
export const COUNTRIES: Country[] = [
  // ── 东道主（CONCACAF） ────────────────────────────
  { iso3: 'MEX', iso2: 'mx', nameEn: 'Mexico', nameZh: '墨西哥', flag: '🇲🇽', confederation: 'CONCACAF', group: 'A', isHost: true },
  { iso3: 'CAN', iso2: 'ca', nameEn: 'Canada', nameZh: '加拿大', flag: '🇨🇦', confederation: 'CONCACAF', group: 'B', isHost: true },
  { iso3: 'USA', iso2: 'us', nameEn: 'United States', nameZh: '美国', flag: '🇺🇸', confederation: 'CONCACAF', group: 'C', isHost: true },

  // ── 欧洲 UEFA 16 队 ────────────────────────────────
  { iso3: 'ENG', iso2: 'gb-eng', nameEn: 'England', nameZh: '英格兰', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', confederation: 'UEFA', group: 'A' },
  { iso3: 'FRA', iso2: 'fr', nameEn: 'France', nameZh: '法国', flag: '🇫🇷', confederation: 'UEFA', group: 'B' },
  { iso3: 'HRV', iso2: 'hr', nameEn: 'Croatia', nameZh: '克罗地亚', flag: '🇭🇷', confederation: 'UEFA', group: 'C' },
  { iso3: 'NOR', iso2: 'no', nameEn: 'Norway', nameZh: '挪威', flag: '🇳🇴', confederation: 'UEFA', group: 'D' },
  { iso3: 'PRT', iso2: 'pt', nameEn: 'Portugal', nameZh: '葡萄牙', flag: '🇵🇹', confederation: 'UEFA', group: 'E' },
  { iso3: 'DEU', iso2: 'de', nameEn: 'Germany', nameZh: '德国', flag: '🇩🇪', confederation: 'UEFA', group: 'F' },
  { iso3: 'NLD', iso2: 'nl', nameEn: 'Netherlands', nameZh: '荷兰', flag: '🇳🇱', confederation: 'UEFA', group: 'G' },
  { iso3: 'AUT', iso2: 'at', nameEn: 'Austria', nameZh: '奥地利', flag: '🇦🇹', confederation: 'UEFA', group: 'H' },
  { iso3: 'BEL', iso2: 'be', nameEn: 'Belgium', nameZh: '比利时', flag: '🇧🇪', confederation: 'UEFA', group: 'I' },
  { iso3: 'SCO', iso2: 'gb-sct', nameEn: 'Scotland', nameZh: '苏格兰', flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', confederation: 'UEFA', group: 'J' },
  { iso3: 'ESP', iso2: 'es', nameEn: 'Spain', nameZh: '西班牙', flag: '🇪🇸', confederation: 'UEFA', group: 'K' },
  { iso3: 'CHE', iso2: 'ch', nameEn: 'Switzerland', nameZh: '瑞士', flag: '🇨🇭', confederation: 'UEFA', group: 'L' },
  { iso3: 'SWE', iso2: 'se', nameEn: 'Sweden', nameZh: '瑞典', flag: '🇸🇪', confederation: 'UEFA', group: 'D' },
  { iso3: 'TUR', iso2: 'tr', nameEn: 'Turkey', nameZh: '土耳其', flag: '🇹🇷', confederation: 'UEFA', group: 'E' },
  { iso3: 'BIH', iso2: 'ba', nameEn: 'Bosnia and Herzegovina', nameZh: '波黑', flag: '🇧🇦', confederation: 'UEFA', group: 'F' },
  { iso3: 'CZE', iso2: 'cz', nameEn: 'Czech Republic', nameZh: '捷克', flag: '🇨🇿', confederation: 'UEFA', group: 'G' },

  // ── 非洲 CAF 10 队 ─────────────────────────────────
  { iso3: 'DZA', iso2: 'dz', nameEn: 'Algeria', nameZh: '阿尔及利亚', flag: '🇩🇿', confederation: 'CAF', group: 'A' },
  { iso3: 'CPV', iso2: 'cv', nameEn: 'Cape Verde', nameZh: '佛得角', flag: '🇨🇻', confederation: 'CAF', group: 'B' },
  { iso3: 'CIV', iso2: 'ci', nameEn: 'Ivory Coast', nameZh: '科特迪瓦', flag: '🇨🇮', confederation: 'CAF', group: 'C' },
  { iso3: 'EGY', iso2: 'eg', nameEn: 'Egypt', nameZh: '埃及', flag: '🇪🇬', confederation: 'CAF', group: 'D' },
  { iso3: 'GHA', iso2: 'gh', nameEn: 'Ghana', nameZh: '加纳', flag: '🇬🇭', confederation: 'CAF', group: 'E' },
  { iso3: 'MAR', iso2: 'ma', nameEn: 'Morocco', nameZh: '摩洛哥', flag: '🇲🇦', confederation: 'CAF', group: 'F' },
  { iso3: 'SEN', iso2: 'sn', nameEn: 'Senegal', nameZh: '塞内加尔', flag: '🇸🇳', confederation: 'CAF', group: 'G' },
  { iso3: 'ZAF', iso2: 'za', nameEn: 'South Africa', nameZh: '南非', flag: '🇿🇦', confederation: 'CAF', group: 'A' },
  { iso3: 'TUN', iso2: 'tn', nameEn: 'Tunisia', nameZh: '突尼斯', flag: '🇹🇳', confederation: 'CAF', group: 'I' },
  { iso3: 'COD', iso2: 'cd', nameEn: 'DR Congo', nameZh: '刚果（金）', flag: '🇨🇩', confederation: 'CAF', group: 'J' },

  // ── 亚洲 AFC 9 队 ──────────────────────────────────
  { iso3: 'AUS', iso2: 'au', nameEn: 'Australia', nameZh: '澳大利亚', flag: '🇦🇺', confederation: 'AFC', group: 'B' },
  { iso3: 'IRN', iso2: 'ir', nameEn: 'Iran', nameZh: '伊朗', flag: '🇮🇷', confederation: 'AFC', group: 'C' },
  { iso3: 'JPN', iso2: 'jp', nameEn: 'Japan', nameZh: '日本', flag: '🇯🇵', confederation: 'AFC', group: 'D' },
  { iso3: 'JOR', iso2: 'jo', nameEn: 'Jordan', nameZh: '约旦', flag: '🇯🇴', confederation: 'AFC', group: 'E' },
  { iso3: 'KOR', iso2: 'kr', nameEn: 'South Korea', nameZh: '韩国', flag: '🇰🇷', confederation: 'AFC', group: 'F' },
  { iso3: 'QAT', iso2: 'qa', nameEn: 'Qatar', nameZh: '卡塔尔', flag: '🇶🇦', confederation: 'AFC', group: 'G' },
  { iso3: 'SAU', iso2: 'sa', nameEn: 'Saudi Arabia', nameZh: '沙特', flag: '🇸🇦', confederation: 'AFC', group: 'H' },
  { iso3: 'UZB', iso2: 'uz', nameEn: 'Uzbekistan', nameZh: '乌兹别克斯坦', flag: '🇺🇿', confederation: 'AFC', group: 'K' },
  { iso3: 'IRQ', iso2: 'iq', nameEn: 'Iraq', nameZh: '伊拉克', flag: '🇮🇶', confederation: 'AFC', group: 'L' },

  // ── 南美 CONMEBOL 6 队 ────────────────────────────
  { iso3: 'ARG', iso2: 'ar', nameEn: 'Argentina', nameZh: '阿根廷', flag: '🇦🇷', confederation: 'CONMEBOL', group: 'H' },
  { iso3: 'BRA', iso2: 'br', nameEn: 'Brazil', nameZh: '巴西', flag: '🇧🇷', confederation: 'CONMEBOL', group: 'I' },
  { iso3: 'COL', iso2: 'co', nameEn: 'Colombia', nameZh: '哥伦比亚', flag: '🇨🇴', confederation: 'CONMEBOL', group: 'J' },
  { iso3: 'ECU', iso2: 'ec', nameEn: 'Ecuador', nameZh: '厄瓜多尔', flag: '🇪🇨', confederation: 'CONMEBOL', group: 'K' },
  { iso3: 'PRY', iso2: 'py', nameEn: 'Paraguay', nameZh: '巴拉圭', flag: '🇵🇾', confederation: 'CONMEBOL', group: 'L' },
  { iso3: 'URY', iso2: 'uy', nameEn: 'Uruguay', nameZh: '乌拉圭', flag: '🇺🇾', confederation: 'CONMEBOL', group: 'H' },

  // ── 北中美 CONCACAF 6 队（含 3 个东道主已列） ───────
  { iso3: 'CUW', iso2: 'cw', nameEn: 'Curaçao', nameZh: '库拉索', flag: '🇨🇼', confederation: 'CONCACAF', group: 'I' },
  { iso3: 'HTI', iso2: 'ht', nameEn: 'Haiti', nameZh: '海地', flag: '🇭🇹', confederation: 'CONCACAF', group: 'J' },
  { iso3: 'PAN', iso2: 'pa', nameEn: 'Panama', nameZh: '巴拿马', flag: '🇵🇦', confederation: 'CONCACAF', group: 'K' },

  // ── 大洋洲 OFC 1 队 ───────────────────────────────
  { iso3: 'NZL', iso2: 'nz', nameEn: 'New Zealand', nameZh: '新西兰', flag: '🇳🇿', confederation: 'OFC', group: 'L' },
];

/** 索引：ISO3 → Country（O(1) 查找） */
export const COUNTRY_BY_ISO3: Record<string, Country> = Object.fromEntries(
  COUNTRIES.map((c) => [c.iso3, c])
);

/** 索引：英文名（lower）→ Country（openfootball 用全英文名） */
export const COUNTRY_BY_NAME_EN: Record<string, Country> = Object.fromEntries(
  COUNTRIES.map((c) => [c.nameEn.toLowerCase(), c])
);

export const GROUPS: GroupKey[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

/** 按组聚合 */
export function countriesByGroup(): Record<GroupKey, Country[]> {
  const out = {} as Record<GroupKey, Country[]>;
  for (const g of GROUPS) out[g] = [];
  for (const c of COUNTRIES) out[c.group].push(c);
  return out;
}

/** 小组颜色：与 tokens.css 的 --group-* 对应 */
export const GROUP_COLORS: Record<GroupKey, string> = {
  A: '#8b4513',
  B: '#a0522d',
  C: '#cd853f',
  D: '#2f4f4f',
  E: '#5f8a8b',
  F: '#708090',
  G: '#6b4423',
  H: '#800020',
  I: '#722f37',
  J: '#556b2f',
  K: '#6b8e23',
  L: '#8b8b00',
};
