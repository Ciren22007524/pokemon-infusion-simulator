// 攻擊力排行：全部 頭 × 身體 擺法，依每回合期望傷害排序（標準見 docs/ranking.md）
//   pnpm rank                 前 30 名，完整結果寫到 output/ranking.csv
//   pnpm rank --top 100 --level 100
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { DamageCalculator } from '../core/damage.ts';
import { abilityChoices, fuse, SIZE_DEPENDENT_SPECIES, type SpeciesData } from '../core/fusion.ts';
import { Ranker, compareRanked, prepareMove, type MoveEvaluation, type PreparedMove } from '../core/ranking.ts';
import { calcStats, uniformStats, type Stats } from '../core/stats.ts';
import { ROOT } from '../pipeline/sources.ts';
import { GameData, type Move } from './gamedata.ts';

const { values } = parseArgs({
  options: {
    level: { type: 'string', default: '50' },
    top: { type: 'string', default: '30' },
    out: { type: 'string', default: join(ROOT, 'output', 'ranking.csv') },
  },
});
const level = Number(values.level);

const data = new GameData();
const gen = Number(data.meta('mechanics_generation'));
const nbPokemon = Number(data.meta('nb_pokemon'));
const calc = new DamageCalculator({ typeChart: data.typeChart(), mechanicsGeneration: gen });
const ranker = new Ranker(calc, gen);

// 預先載入：所有招式（處理成排行用的形式）與所有寶可夢
const db = data as unknown as { all(sql: string): Record<string, string | number | null>[] };
const moves = new Map<string, Move>();
for (const r of db.all('SELECT id FROM move')) {
  const m = data.findMove(String(r['id']));
  moves.set(m.id, m);
}
const prepared = new Map<string, PreparedMove>([...moves].map(([id, m]) => [id, prepareMove(m)]));
const species = db.all('SELECT id FROM pokemon ORDER BY number').map((r) => {
  const s = data.findSpecies(String(r['id']));
  const sd = data.speciesData(s);
  // 只留下能進入排行的攻擊招式
  const attackMoves = new Set([...sd.levelMoves.map(([, m]) => m), ...sd.tutorMoves, ...sd.eggMoves].filter((id) => !prepared.get(id)!.excluded));
  return { s, sd, attackMoves };
});
const name = (x: { nameZhTw: string | null; nameEn: string }) => x.nameZhTw ?? x.nameEn;

type Row = {
  id: string;
  head: string;
  body: string;
  types: string[];
  base: Stats;
  stats: Stats;
  score: number;
  best: MoveEvaluation | null;
  sizeDependent: boolean;
};

const started = Date.now();
const rows: Row[] = [];
for (const head of species)
  for (const body of species) {
    const f = fuse(head.sd, body.sd, nbPokemon);
    const stats = calcStats({ base: f.base, level, ivs: uniformStats(31), evs: uniformStats(0) });
    const attackMoves = [...new Set([...body.attackMoves, ...head.attackMoves])].map((id) => prepared.get(id)!);
    const best = ranker.best({ level, stats, types: f.types }, abilityChoices(f), attackMoves);
    rows.push({
      id: f.id,
      head: name(head.s),
      body: name(body.s),
      types: f.types,
      base: f.base,
      stats,
      score: best?.expectedPerTurn ?? 0,
      best,
      sizeDependent: SIZE_DEPENDENT_SPECIES.includes(head.sd.id) || SIZE_DEPENDENT_SPECIES.includes(body.sd.id),
    });
  }
rows.sort((a, b) => compareRanked({ score: a.score, stats: a.base, id: a.id }, { score: b.score, stats: b.base, id: b.id }));

const typeName = new Map<string, string>();
const tn = (t: string) => {
  if (!typeName.has(t)) typeName.set(t, data.typeName(t));
  return typeName.get(t)!;
};
const moveName = (id: string) => name(moves.get(id)!);
const abilityLabel = (a: string | null) => (a ? data.abilityName(a) : '（特性不影響）');
const fmt = (n: number, d = 1) => Number(n.toFixed(d));

const record = (r: Row, i: number) => ({
  排名: i + 1,
  頭: r.head,
  身體: r.body,
  屬性: r.types.map(tn).join('/'),
  HP: r.base.HP,
  攻擊: r.base.ATTACK,
  防禦: r.base.DEFENSE,
  特攻: r.base.SPECIAL_ATTACK,
  特防: r.base.SPECIAL_DEFENSE,
  速度: r.base.SPEED,
  特性: abilityLabel(r.best?.ability ?? null),
  招式: r.best ? moveName(r.best.move.id) : '',
  招式屬性: r.best ? tn(r.best.moveType) : '',
  威力: r.best?.move.power ?? '',
  命中: r.best ? `${Math.round(r.best.hitChance * 100)}%` : '',
  期望下數: r.best ? fmt(r.best.expectedHits, 2) : '',
  每下平均: r.best ? fmt(r.best.averagePerHit) : '',
  每回合期望: fmt(r.score),
  備註: [...(r.best?.flags ?? []), ...(r.sizeDependent ? ['種族值依尺寸'] : []), ...(r.head === r.body ? ['自體融合'] : [])].join('、'),
});

const csvField = (v: unknown) => {
  const s = String(v ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
mkdirSync(join(values.out, '..'), { recursive: true });
const records = rows.map(record);
const header = Object.keys(records[0]!);
writeFileSync(values.out, '﻿' + [header.join(','), ...records.map((r) => header.map((h) => csvField(r[h as keyof typeof r])).join(','))].join('\n') + '\n');

console.log(`攻擊力排行：Lv${level}、個體值 31、努力值 0、個性無修正；對參考對象（無屬性，防禦 = 特防 = 100）`);
console.log(`排名標準：每回合期望傷害 = 平均傷害 × 命中率 × 期望下數（需休息、蓄力、懶惰 ×0.5），取可選特性 × 可學攻擊招式的最大值；相同時比速度、HP`);
console.table(records.slice(0, Number(values.top)).map(({ 防禦: _d, 特防: _s, ...r }) => r));
console.log(`共 ${rows.length.toLocaleString()} 種擺法，${((Date.now() - started) / 1000).toFixed(1)} 秒；完整結果：${values.out}`);
