// 傷害計算指令：列出一隻寶可夢可學的攻擊招式，依傷害排序
//   pnpm calc 烈咬陸鯊
//   pnpm calc 瑪力露麗/請假王          （融合：頭/身體）
//   pnpm calc GARCHOMP --move 地震 --vs 大鋼蛇 --level 100 --nature 固執 --ability 粗糙皮膚
import { parseArgs } from 'node:util';
import { DamageCalculator, type Attacker, type Defender, type DamageResult } from '../core/damage.ts';
import { calcStats, uniformStats, type Stats } from '../core/stats.ts';
import { GameData, type Move } from './gamedata.ts';
import { resolveSubject } from './subject.ts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    move: { type: 'string' },
    vs: { type: 'string' },
    level: { type: 'string', default: '50' },
    nature: { type: 'string' },
    ability: { type: 'string' },
    iv: { type: 'string', default: '31' },
    ev: { type: 'string', default: '0' },
    all: { type: 'boolean', default: false },
  },
});
if (positionals.length !== 1) {
  console.error('用法：pnpm calc <寶可夢 或 頭/身體> [--move 招式] [--vs 防守方] [--level 50] [--nature 個性] [--ability 特性] [--iv 31] [--ev 0] [--all]');
  process.exit(1);
}

const data = new GameData();
const level = Number(values.level);
const statsOf = (base: Stats, nature = values.nature, ability?: string | null): Stats =>
  calcStats({
    base,
    level,
    ivs: uniformStats(Number(values.iv)),
    evs: uniformStats(Number(values.ev)),
    nature: nature ? data.findNature(nature) : null,
    ability,
  });

const subject = resolveSubject(data, positionals[0]!);
const ability = values.ability ? data.findAbility(values.ability) : subject.defaultAbility;
const stats = statsOf(subject.base, values.nature, ability);
const attacker: Attacker = {
  level,
  attack: stats.ATTACK,
  spatk: stats.SPECIAL_ATTACK,
  totalHp: stats.HP,
  types: subject.types,
  ability,
};

let defender: Defender | null = null;
let defenderLabel = '參考對象（無屬性，防禦 = 特防 = 100）';
if (values.vs) {
  const d = resolveSubject(data, values.vs);
  const ds = statsOf(d.base, undefined);
  defender = { defense: ds.DEFENSE, spdef: ds.SPECIAL_DEFENSE, types: d.types };
  defenderLabel = `${d.label}（${d.types.join('/')}，防禦 ${ds.DEFENSE}，特防 ${ds.SPECIAL_DEFENSE}，個性無修正）`;
}

const calc = new DamageCalculator({ typeChart: data.typeChart(), mechanicsGeneration: Number(data.meta('mechanics_generation')) });
const moves = values.move ? [data.findMove(values.move)] : data.movesByIds(subject.moveIds).filter((m) => m.category !== 'status');

const rows = moves
  .map((m) => ({ m, r: calc.calculate(attacker, m, defender) }))
  .sort((a, b) => b.r.average - a.r.average || a.m.id.localeCompare(b.m.id));

const name = (x: { nameZhTw: string | null; nameEn: string }) => x.nameZhTw ?? x.nameEn;
console.log(`${subject.label}（${subject.types.join('/')}）Lv${level} 特性 ${ability ? data.abilityName(ability) : '無'}`);
console.log(`可選特性：${subject.abilityChoices.map((a) => data.abilityName(a)).join('、')}`);
for (const n of subject.notes) console.log(`注意：${n}`);
console.log(`攻擊 ${stats.ATTACK}、特攻 ${stats.SPECIAL_ATTACK}（個體值 ${values.iv}、努力值 ${values.ev}、個性 ${values.nature ?? '無修正'}）`);
console.log(`防守方：${defenderLabel}\n`);

const fmt = (m: Move, r: DamageResult) => ({
  招式: name(m),
  屬性: r.moveType,
  分類: { physical: '物理', special: '特殊', status: '變化' }[m.category],
  威力: m.power,
  命中: m.accuracy === 0 ? '必中' : m.accuracy,
  本系: r.stab,
  相剋: r.effectiveness,
  傷害: `${r.min}～${r.max}`,
  平均: Number(r.average.toFixed(1)),
  備註: r.unmodeled.length ? '有未移植的特殊算法' : '',
});
const shown = values.all || values.move ? rows : rows.slice(0, 20);
console.table(shown.map(({ m, r }) => fmt(m, r)));
if (shown.length < rows.length) console.log(`（只列前 20 招，共 ${rows.length} 招；加 --all 顯示全部）`);
for (const { m, r } of shown) for (const u of r.unmodeled) console.log(`- ${name(m)}：${u}`);
