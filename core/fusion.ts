// 融合：照 Data/Scripts/052_InfiniteFusion/Fusion/Data/FusedSpecies.rb 移植
import type { Stats } from './stats.ts';

export type SpeciesData = {
  id: string;
  // 遊戲內部編號（id_number）
  number: number;
  base: Stats;
  type1: string;
  // 單屬性時跟 type1 相同（遊戲資料的存法）
  type2: string;
  abilities: readonly string[];
  hiddenAbilities: readonly string[];
  // [等級, 招式]；1 = 初始招式，0 = 進化時習得
  levelMoves: readonly (readonly [number, string])[];
  tutorMoves: readonly string[];
  eggMoves: readonly string[];
};

export type FusedSpecies = {
  // 遊戲內部代號，例如 B208H681 = 身體 208、頭 681
  id: string;
  // 身體編號 × NB_POKEMON + 頭編號
  number: number;
  head: SpeciesData;
  body: SpeciesData;
  base: Stats;
  type1: string;
  type2: string;
  // 實際的屬性清單（重複時只算一個，同 PokeBattle_Battler#pbTypes）
  types: string[];
  // 一般特性欄：[身體第一特性, 頭第一特性]
  abilities: string[];
  // 隱藏特性欄：[身體第二特性, 頭第二特性, 身體隱藏特性, 頭隱藏特性]，缺的往前補
  hiddenAbilities: string[];
  levelMoves: (readonly [number, string])[];
  tutorMoves: string[];
  eggMoves: string[];
};

// 融合能力值：(2 × 主導方) / 3 + 另一方 / 3，兩項各自整數除法
export const fusedStat = (dominant: number, other: number) => Math.floor((2 * dominant) / 3) + Math.floor(other / 3);

export function fuse(head: SpeciesData, body: SpeciesData, nbPokemon: number): FusedSpecies {
  const h = head.base;
  const b = body.base;
  const base: Stats = {
    // 頭主導
    HP: fusedStat(h.HP, b.HP),
    SPECIAL_DEFENSE: fusedStat(h.SPECIAL_DEFENSE, b.SPECIAL_DEFENSE),
    SPECIAL_ATTACK: fusedStat(h.SPECIAL_ATTACK, b.SPECIAL_ATTACK),
    // 身體主導
    ATTACK: fusedStat(b.ATTACK, h.ATTACK),
    DEFENSE: fusedStat(b.DEFENSE, h.DEFENSE),
    SPEED: fusedStat(b.SPEED, h.SPEED),
  };
  // 原始碼在種族值 <= 0 時改成 1（adjust_stats_with_evs）
  for (const k of Object.keys(base) as (keyof Stats)[]) if (base[k] <= 0) base[k] = 1;

  // calculate_type1 / calculate_type2
  const type1 = head.type1 === 'NORMAL' && head.type2 === 'FLYING' ? head.type2 : head.type1;
  const type2 = body.type2 === type1 ? body.type1 : body.type2;

  // calculate_abilities / calculate_hidden_abilities
  const bodySecond = body.abilities[1] ?? body.abilities[0]!;
  const headSecond = head.abilities[1] ?? head.abilities[0]!;
  const abilities = [body.abilities[0]!, head.abilities[0]!];
  const hiddenAbilities = [bodySecond, headSecond, body.hiddenAbilities[0] ?? bodySecond, head.hiddenAbilities[0] ?? headSecond];

  return {
    id: `B${body.number}H${head.number}`,
    number: body.number * nbPokemon + head.number,
    head,
    body,
    base,
    type1,
    type2,
    types: type1 === type2 ? [type1] : [type1, type2],
    abilities,
    hiddenAbilities,
    // combine_arrays(body, head)：身體在前，不去重複
    levelMoves: [...body.levelMoves, ...head.levelMoves],
    tutorMoves: [...body.tutorMoves, ...head.tutorMoves],
    eggMoves: [...body.eggMoves, ...head.eggMoves],
  };
}

// 可以選的特性（Pokemon#getAbilityList：一般欄 + 隱藏欄，去掉重複）
export const abilityChoices = (f: FusedSpecies) => [...new Set([...f.abilities, ...f.hiddenAbilities])];

// 可學招式（升級、教學、蛋），去掉重複；進化前才學得到的招式不在融合資料內
export const learnableMoveIds = (f: FusedSpecies) => [...new Set([...f.levelMoves.map(([, m]) => m), ...f.tutorMoves, ...f.eggMoves])];

// 南瓜精、南瓜怪的種族值依尺寸而定（Pokemon#getBaseStatsFormException），上面的計算用的是普通尺寸
export const SIZE_DEPENDENT_SPECIES: readonly string[] = ['PUMPKABOO', 'GOURGEIST'];

// 戰鬥切換：出攻擊招時，若不在劍形態，直接對調當下的攻擊↔防禦、特攻↔特防
// （007_Battler_UseMove.rb 的 stanceChangeEffect；換形態重算種族值的程式碼被註解掉了）
export function stanceChangeSwap<T extends { attack: number; defense: number; spatk: number; spdef: number }>(s: T): T {
  return { ...s, attack: s.defense, defense: s.attack, spatk: s.spdef, spdef: s.spatk };
}
