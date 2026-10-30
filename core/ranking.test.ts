import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DamageCalculator, buildTypeChart } from './damage.ts';
import { Ranker, compareRanked, prepareMove, type RankAttacker, type RankableMove } from './ranking.ts';
import { uniformStats } from './stats.ts';
import { table } from './testing.ts';

const calc = new DamageCalculator({
  typeChart: buildTypeChart(
    table('type_effectiveness').map((r) => ({ attack_type: r['attack_type']!, defend_type: r['defend_type']!, multiplier: Number(r['multiplier']) })),
  ),
  mechanicsGeneration: 5,
});
const ranker = () => new Ranker(calc, 5);

const move = (m: Partial<RankableMove>): RankableMove => ({
  id: 'TEST',
  type: 'NORMAL',
  category: 'physical',
  power: 80,
  accuracy: 100,
  flags: '',
  effectChance: 0,
  functionCode: '000',
  overriddenMethods: [],
  ...m,
});
// Lv50、攻擊 120：威力 80 對參考對象 → 每下 44 × 亂數平均
const attacker: RankAttacker = { level: 50, stats: { ...uniformStats(100), ATTACK: 120, SPECIAL_ATTACK: 60 }, types: [] };
const avg44 = calc.calculate({ level: 50, attack: 120, spatk: 60, totalHp: 100, types: [] }, move({})).average;

test('單發：每回合期望傷害 = 平均傷害 × 命中率', () => {
  const e = ranker().evaluate(attacker, null, prepareMove(move({ accuracy: 75 })))!;
  assert.equal(e.hitChance, 0.75);
  assert.equal(e.expectedPerTurn, avg44 * 0.75);
});

test('需要休息、蓄力的招式：每回合 ×0.5', () => {
  const beam = prepareMove(move({ functionCode: '0C2' }));
  assert.equal(beam.perTurn, 0.5);
  assert.deepEqual(beam.flags, ['需休息']);
  assert.equal(ranker().evaluate(attacker, null, beam)!.expectedPerTurn, avg44 * 0.5);
  const solar = prepareMove(move({ functionCode: '0C4', overriddenMethods: ['chargingTurnMove?', 'pbAccuracyCheck', 'pbBaseDamageMultiplier'] }));
  assert.equal(solar.excluded, null);
  assert.equal(solar.perTurn, 0.5);
});

test('懶惰：每回合 ×0.5', () => {
  assert.equal(ranker().evaluate(attacker, 'TRUANT', prepareMove(move({})))!.expectedPerTurn, avg44 * 0.5);
});

test('2～5 下：期望 19/6 下；連續攻擊固定 5 下', () => {
  const p = prepareMove(move({ functionCode: '0C0', overriddenMethods: ['multiHitMove?', 'pbNumHits', 'pbBaseDamage'] }));
  assert.equal(ranker().evaluate(attacker, null, p)!.expectedPerTurn, avg44 * (19 / 6));
  assert.equal(ranker().evaluate(attacker, 'SKILLLINK', p)!.expectedPerTurn, avg44 * 5);
});

test('三連踢：威力 10、20、30，每下判定命中；連續攻擊只判定第一下', () => {
  const p = prepareMove(move({ power: 10, accuracy: 90, functionCode: '0BF', overriddenMethods: ['pbNumHits', 'pbBaseDamage', 'multiHitMove?'] }));
  const d = (power: number) => calc.calculate({ level: 50, attack: 120, spatk: 60, totalHp: 100, types: [] }, move({ power })).average;
  const e = ranker().evaluate(attacker, null, p)!;
  assert.ok(Math.abs(e.expectedPerTurn - (0.9 * d(10) + 0.81 * d(20) + 0.729 * d(30))) < 1e-9);
  const sl = ranker().evaluate(attacker, 'SKILLLINK', p)!;
  assert.ok(Math.abs(sl.expectedPerTurn - 0.9 * (d(10) + d(20) + d(30))) < 1e-9);
});

test('活力：攻擊 ×1.5 但物理招命中 ×0.8', () => {
  const hustle = ranker().evaluate(attacker, 'HUSTLE', prepareMove(move({})))!;
  const boosted = calc.calculate({ level: 50, attack: 180, spatk: 60, totalHp: 100, types: [] }, move({})).average;
  assert.equal(hustle.hitChance, 0.8);
  assert.equal(hustle.expectedPerTurn, boosted * 0.8);
});

test('規則：報恩威力 102、雜技 ×2、必中招、必定擊中要害', () => {
  assert.equal(prepareMove(move({ power: 1, functionCode: '089', overriddenMethods: ['pbBaseDamage'] })).move.power, 102);
  assert.equal(prepareMove(move({ power: 55, functionCode: '086', overriddenMethods: ['pbBaseDamageMultiplier'] })).move.baseDamageMultiplier, 2);
  const swift = ranker().evaluate(attacker, null, prepareMove(move({ accuracy: 0, functionCode: '0A5', overriddenMethods: ['pbAccuracyCheck'] })))!;
  assert.equal(swift.hitChance, 1);
  const crit = ranker().evaluate(attacker, null, prepareMove(move({ functionCode: '0A0', overriddenMethods: ['pbCritialOverride'] })))!;
  assert.equal(crit.averagePerHit, calc.calculate({ level: 50, attack: 120, spatk: 60, totalHp: 100, types: [] }, move({}), null, { critical: true }).average);
});

test('規則：地球上投造成等於等級的固定傷害', () => {
  const e = ranker().evaluate(attacker, null, prepareMove(move({ power: 1, functionCode: '06D', overriddenMethods: ['pbCalcDamage', 'pbFixedDamage'] })))!;
  assert.equal(e.expectedPerTurn, 50);
});

test('規則：光子噴湧依攻擊與特攻高低決定物理或特殊', () => {
  const p = prepareMove(move({ category: 'special', functionCode: '164', overriddenMethods: ['physicalMove?', 'specialMove?'] }));
  assert.equal(ranker().evaluate(attacker, null, p)!.category, 'physical');
  const special = { ...attacker, stats: { ...attacker.stats, ATTACK: 50, SPECIAL_ATTACK: 120 } };
  assert.equal(ranker().evaluate(special, null, p)!.category, 'special');
});

test('排除：自爆、依對方而定的招式、沒有規則的改寫、變化招', () => {
  assert.match(prepareMove(move({ functionCode: '0E0', overriddenMethods: ['pbNumHits', 'pbSelfKO'] })).excluded!, /倒下/);
  assert.match(prepareMove(move({ functionCode: '09A', overriddenMethods: ['pbBaseDamage'] })).excluded!, /體重/);
  assert.match(prepareMove(move({ functionCode: 'ZZZ', overriddenMethods: ['pbBaseDamage'] })).excluded!, /未移植/);
  assert.equal(prepareMove(move({ category: 'status', power: 0 })).excluded, '變化招');
  assert.equal(ranker().evaluate(attacker, null, prepareMove(move({ functionCode: '0E0', overriddenMethods: ['pbNumHits'] }))), null);
});

test('best：在可選特性 × 招式中取最大；不影響攻擊的特性視為同一種', () => {
  const moves = [prepareMove(move({ power: 80 })), prepareMove(move({ id: 'BIG', power: 120, accuracy: 50 }))];
  const best = ranker().best(attacker, ['OVERGROW', 'HUGEPOWER', 'LEVITATE'], moves)!;
  assert.equal(best.ability, 'HUGEPOWER');
  assert.equal(best.move.id, 'TEST'); // 威力 80 命中 100 勝過威力 120 命中 50
  assert.equal(ranker().best(attacker, ['LEVITATE', 'OVERGROW'], moves)!.ability, null);
});

test('排名：期望傷害相同時依速度、HP、代號', () => {
  const s = uniformStats(100);
  const rows = [
    { score: 10, stats: { ...s, SPEED: 50 }, id: 'A' },
    { score: 10, stats: { ...s, SPEED: 90 }, id: 'B' },
    { score: 20, stats: s, id: 'C' },
  ].sort(compareRanked);
  assert.deepEqual(rows.map((r) => r.id), ['C', 'B', 'A']);
});

test('失敗條件：共用類別的檢查對攻擊招無效；其他沒檢查過的一律排除', () => {
  const poison = prepareMove(move({ functionCode: '005', overriddenMethods: ['pbFailsAgainstTarget?'], methodSources: { 'pbFailsAgainstTarget?': 'PokeBattle_PoisonMove' } }));
  assert.equal(poison.excluded, null);
  const unknown = prepareMove(move({ functionCode: 'ZZZ', overriddenMethods: ['pbMoveFailed?'], methodSources: { 'pbMoveFailed?': 'PokeBattle_Move_ZZZ' } }));
  assert.match(unknown.excluded!, /未移植/);
  assert.match(prepareMove(move({ functionCode: '115', overriddenMethods: ['pbMoveFailed?'] })).excluded!, /真氣拳/);
});

test('燃盡：自己沒有火屬性時不能用', () => {
  const p = prepareMove(move({ type: 'FIRE', functionCode: '162', overriddenMethods: ['pbMoveFailed?'] }));
  assert.equal(ranker().evaluate(attacker, null, p), null);
  assert.ok(ranker().evaluate({ ...attacker, types: ['FIRE'] }, null, p)!.expectedPerTurn > 0);
});
