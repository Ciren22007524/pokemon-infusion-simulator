// 融合查詢：pnpm fuse 堅盾劍怪 大鋼蛇（先頭後身體）
import { stanceChangeSwap } from '../core/fusion.ts';
import { GameData } from './gamedata.ts';
import { resolveSubject } from './subject.ts';

const args = process.argv.slice(2);
if (args.length !== 2) {
  console.error('用法：pnpm fuse <頭> <身體>');
  process.exit(1);
}

const data = new GameData();
const s = resolveSubject(data, `${args[0]}/${args[1]}`);
const f = s.fused!;
const b = f.base;
const abilities = (ids: string[]) => ids.map((id) => data.abilityName(id)).join('、');

console.log(s.label);
console.log(`代號 ${f.id}、編號 ${f.number}`);
console.log(`屬性：${f.types.map((t) => data.typeName(t)).join(' / ')}`);
console.table({
  種族值: { HP: b.HP, 攻擊: b.ATTACK, 防禦: b.DEFENSE, 特攻: b.SPECIAL_ATTACK, 特防: b.SPECIAL_DEFENSE, 速度: b.SPEED },
});
console.log(`一般特性欄：${abilities(f.abilities)}`);
console.log(`隱藏特性欄：${abilities(f.hiddenAbilities)}`);
console.log(`可選特性：${abilities(s.abilityChoices)}`);
if (s.abilityChoices.includes('STANCECHANGE')) {
  const blade = stanceChangeSwap({ attack: b.ATTACK, defense: b.DEFENSE, spatk: b.SPECIAL_ATTACK, spdef: b.SPECIAL_DEFENSE });
  console.log(`戰鬥切換劍形態（攻防、特攻特防對調）：攻擊 ${blade.attack}、防禦 ${blade.defense}、特攻 ${blade.spatk}、特防 ${blade.spdef}`);
}
console.log(`可學招式：${s.moveIds.length} 招（升級、教學、蛋招，身體與頭合併）`);
for (const n of s.notes) console.log(`注意：${n}`);
