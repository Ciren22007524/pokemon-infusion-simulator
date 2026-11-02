// 實際能力值：Data/Scripts/014_Pokemon/001_Pokemon.rb 的 calcHP、calcStat、calc_stats

export const STAT_IDS = ['HP', 'ATTACK', 'DEFENSE', 'SPECIAL_ATTACK', 'SPECIAL_DEFENSE', 'SPEED'] as const;
export type StatId = (typeof STAT_IDS)[number];
export type Stats = Record<StatId, number>;

export type Nature = { increased: StatId | null; decreased: StatId | null };

// Ruby 的整數除法對正數就是無條件捨去
const div = (a: number, b: number) => Math.floor(a / b);

export function calcHP(base: number, level: number, iv: number, ev: number): number {
  if (base === 1) return 1; // 脫殼忍者
  return div((base * 2 + iv + div(ev, 4)) * level, 100) + level + 10;
}

// nature：100 = 無修正，110 = 上升，90 = 下降
export function calcStat(base: number, level: number, iv: number, ev: number, nature: number): number {
  return div((div((base * 2 + iv + div(ev, 4)) * level, 100) + 5) * nature, 100);
}

export type StatInput = {
  base: Stats;
  level: number;
  ivs: Stats;
  evs: Stats;
  nature?: Nature | null;
  // 神奇守護的 HP 固定為 1（adjustHPForWonderGuard）
  ability?: string | null;
};

// 無等級模式（SWITCH_NO_LEVELS_MODE）由呼叫端換算好等級再傳入
export function calcStats({ base, level, ivs, evs, nature, ability }: StatInput): Stats {
  const natureMod = (s: StatId) => 100 + (nature?.increased === s ? 10 : 0) - (nature?.decreased === s ? 10 : 0);
  const out = {} as Stats;
  for (const s of STAT_IDS)
    out[s] = s === 'HP' ? calcHP(base[s], level, ivs[s], evs[s]) : calcStat(base[s], level, ivs[s], evs[s], natureMod(s));
  if (ability === 'WONDERGUARD') out.HP = 1;
  return out;
}

export const uniformStats = (v: number): Stats => Object.fromEntries(STAT_IDS.map((s) => [s, v])) as Stats;
