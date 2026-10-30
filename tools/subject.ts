// 指令參數「頭/身體」或單一寶可夢 → 計算用的資料
import { SIZE_DEPENDENT_SPECIES, abilityChoices, fuse, learnableMoveIds, type FusedSpecies } from '../core/fusion.ts';
import type { Stats } from '../core/stats.ts';
import type { GameData, Species } from './gamedata.ts';

export type Subject = {
  label: string;
  base: Stats;
  types: string[];
  // 遊戲預設的特性（一般欄第一格）
  defaultAbility: string;
  abilityChoices: string[];
  moveIds: string[];
  fused: FusedSpecies | null;
  notes: string[];
};

const nameOf = (s: Species) => s.nameZhTw ?? s.nameEn;

export function resolveSubject(data: GameData, arg: string): Subject {
  const parts = arg.split('/');
  if (parts.length > 2) throw new Error(`「${arg}」格式錯誤，融合請用「頭/身體」`);
  const notes: string[] = [];
  const sizeNote = (s: Species) => {
    if (SIZE_DEPENDENT_SPECIES.includes(s.id)) notes.push(`${nameOf(s)}的種族值依尺寸而定，這裡用普通尺寸`);
  };

  if (parts.length === 1) {
    const s = data.findSpecies(parts[0]!);
    sizeNote(s);
    const sd = data.speciesData(s);
    return {
      label: nameOf(s),
      base: s.base,
      types: s.types,
      defaultAbility: sd.abilities[0]!,
      abilityChoices: [...new Set([...sd.abilities, ...sd.hiddenAbilities])],
      moveIds: [...new Set([...sd.levelMoves.map(([, m]) => m), ...sd.tutorMoves, ...sd.eggMoves])],
      fused: null,
      notes,
    };
  }

  const head = data.findSpecies(parts[0]!);
  const body = data.findSpecies(parts[1]!);
  sizeNote(head);
  sizeNote(body);
  const f = fuse(data.speciesData(head), data.speciesData(body), Number(data.meta('nb_pokemon')));
  return {
    label: `${nameOf(head)}（頭）/ ${nameOf(body)}（身體）`,
    base: f.base,
    types: f.types,
    defaultAbility: f.abilities[0]!,
    abilityChoices: abilityChoices(f),
    moveIds: learnableMoveIds(f),
    fused: f,
    notes,
  };
}
