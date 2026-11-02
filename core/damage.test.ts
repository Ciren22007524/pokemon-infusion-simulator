import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCsv } from '../pipeline/build-db.ts';
import { TABLES_DIR } from '../pipeline/sources.ts';
import { DamageCalculator, buildTypeChart, type Attacker, type Defender, type MoveInfo } from './damage.ts';

const typeChart = buildTypeChart(
  parseCsv(readFileSync(join(TABLES_DIR, 'type_effectiveness.csv'), 'utf8')).map((r) => ({
    attack_type: r['attack_type']!,
    defend_type: r['defend_type']!,
    multiplier: Number(r['multiplier']),
  })),
);
const calc = new DamageCalculator({ typeChart, mechanicsGeneration: 5 });

const move = (m: Partial<MoveInfo>): MoveInfo => ({
  id: 'TEST',
  type: 'NORMAL',
  category: 'physical',
  power: 80,
  flags: '',
  effectChance: 0,
  functionCode: '000',
  overriddenMethods: [],
  ...m,
});
const attacker = (a: Partial<Attacker>): Attacker => ({ level: 50, attack: 120, spatk: 120, totalHp: 150, types: [], ...a });
const defender = (d: Partial<Defender>): Defender => ({ defense: 100, spdef: 100, types: [], ...d });

test('基本公式：Lv50、威力 80 本系、攻 120 打防 100、效果絕佳 → 112～132', () => {
  // floor(2×50/5+2)=22；floor(22×80×120/100)=2112；floor(2112/50)+2=44
  // 最終倍率 = 亂數 × 1.5（本系）× 2（效果絕佳）：44×0.85×3=112.2→112，44×3=132
  const r = calc.calculate(attacker({ types: ['FIRE'] }), move({ type: 'FIRE' }), defender({ types: ['GRASS'] }));
  assert.equal(r.rolls.length, 16);
  assert.equal(r.min, 112);
  assert.equal(r.max, 132);
  assert.equal(r.stab, 1.5);
  assert.equal(r.effectiveness, 2);
  assert.deepEqual(r.rolls, [...r.rolls].sort((a, b) => a - b));
});

test('攻擊和防禦是相除：防禦加倍，傷害約減半，不會變成 0', () => {
  const r = calc.calculate(attacker({ types: ['FIRE'] }), move({ type: 'FIRE' }), defender({ defense: 200, types: ['GRASS'] }));
  // floor(22×80×120/200)=1056；floor(1056/50)+2=23；23×3=69
  assert.equal(r.max, 69);
});

test('特殊招用特攻與特防', () => {
  const a = attacker({ attack: 10, spatk: 120 });
  const d = defender({ defense: 999, spdef: 100 });
  assert.equal(calc.calculate(a, move({ category: 'special' }), d).max, 44);
});

test('雙屬性相剋相乘；無效時傷害為 0（不是最少 1）', () => {
  const quad = calc.calculate(attacker({}), move({ type: 'ICE' }), defender({ types: ['DRAGON', 'FLYING'] }));
  assert.equal(quad.effectiveness, 4);
  const immune = calc.calculate(attacker({}), move({ type: 'NORMAL' }), defender({ types: ['GHOST'] }));
  assert.equal(immune.effectiveness, 0);
  assert.deepEqual([immune.min, immune.max], [0, 0]);
});

test('膽量：一般招打得到幽靈', () => {
  const r = calc.calculate(attacker({ ability: 'SCRAPPY' }), move({ type: 'NORMAL' }), defender({ types: ['GHOST'] }));
  assert.equal(r.effectiveness, 1);
  assert.equal(r.max, 44);
});

test('不指定防守方：對參考對象（無屬性、防禦 100）計算', () => {
  const r = calc.calculate(attacker({}), move({ type: 'FIRE' }));
  assert.equal(r.effectiveness, 1);
  assert.equal(r.max, 44);
});

test('大力士：物理招攻擊 ×2，特殊招不變', () => {
  const doubled = calc.calculate(attacker({ attack: 240 }), move({}));
  assert.equal(calc.calculate(attacker({ ability: 'HUGEPOWER' }), move({})).max, doubled.max);
  assert.equal(calc.calculate(attacker({ ability: 'PUREPOWER' }), move({})).max, doubled.max);
  assert.equal(calc.calculate(attacker({ ability: 'HUGEPOWER' }), move({ category: 'special' })).max, 44);
});

test('技術高手：威力 ≤ 60 才 ×1.5', () => {
  const tech = attacker({ ability: 'TECHNICIAN' });
  assert.equal(calc.calculate(tech, move({ power: 60 })).max, calc.calculate(attacker({}), move({ power: 90 })).max);
  assert.equal(calc.calculate(tech, move({ power: 61 })).max, calc.calculate(attacker({}), move({ power: 61 })).max);
});

test('適應力：本系 ×2', () => {
  const r = calc.calculate(attacker({ ability: 'ADAPTABILITY', types: ['FIRE'] }), move({ type: 'FIRE' }));
  assert.equal(r.stab, 2);
  assert.equal(r.max, 88);
});

test('飛行皮膚：一般招變飛行、威力 ×1.2，並吃到本系', () => {
  const r = calc.calculate(attacker({ ability: 'AERILATE', types: ['FLYING'] }), move({ type: 'NORMAL', power: 90 }));
  assert.equal(r.moveType, 'FLYING');
  assert.equal(r.max, calc.calculate(attacker({ types: ['FLYING'] }), move({ type: 'FLYING', power: 108 })).max);
});

test('擊中要害：×1.5，且忽略攻擊方的負階級、防守方的正階級', () => {
  const crit = calc.calculate(attacker({ attackStage: -2 }), move({}), defender({ defenseStage: 2 }), { critical: true });
  const plain = calc.calculate(attacker({}), move({}), defender({}), { critical: true });
  assert.equal(crit.max, plain.max);
  assert.equal(plain.max, 66); // 44 × 1.5
});

test('能力階級：+2 = ×2，-1 = ×2/3', () => {
  assert.equal(calc.calculate(attacker({ attackStage: 2 }), move({})).max, calc.calculate(attacker({ attack: 240 }), move({})).max);
  assert.equal(calc.calculate(attacker({ attackStage: -1 }), move({})).max, calc.calculate(attacker({ attack: 80 }), move({})).max);
});

test('灼傷：物理招減半；根性不減半且攻擊 ×1.5', () => {
  assert.equal(calc.calculate(attacker({ status: 'BURN' }), move({})).max, 22);
  assert.equal(calc.calculate(attacker({ status: 'BURN' }), move({ category: 'special' })).max, 44);
  const guts = calc.calculate(attacker({ status: 'BURN', ability: 'GUTS' }), move({}));
  assert.equal(guts.max, calc.calculate(attacker({ attack: 180 }), move({})).max);
});

test('天氣：晴天火 ×1.5、水 ×0.5；沙暴時岩石屬性特防 ×1.5', () => {
  assert.equal(calc.calculate(attacker({}), move({ type: 'FIRE' }), null, { weather: 'Sun' }).max, 66);
  assert.equal(calc.calculate(attacker({}), move({ type: 'WATER' }), null, { weather: 'Sun' }).max, 22);
  const rock = defender({ types: ['ROCK'] });
  const sand = calc.calculate(attacker({}), move({ type: 'NORMAL', category: 'special' }), rock, { weather: 'Sandstorm' });
  assert.equal(sand.max, calc.calculate(attacker({}), move({ type: 'NORMAL', category: 'special' }), defender({ spdef: 150, types: ['ROCK'] })).max);
});

test('低 HP 特性：HP ≤ 1/3 時同屬性招攻擊 ×1.5', () => {
  const a = attacker({ ability: 'BLAZE', hp: 50 });
  assert.equal(calc.calculate(a, move({ type: 'FIRE' })).max, calc.calculate(attacker({ attack: 180 }), move({ type: 'FIRE' })).max);
  assert.equal(calc.calculate({ ...a, hp: 51 }, move({ type: 'FIRE' })).max, 44);
});

test('招式有尚未移植的特殊算法時列在 unmodeled；檢查過的改寫不列', () => {
  const special = calc.calculate(attacker({}), move({ functionCode: '07F', overriddenMethods: ['pbBaseDamage', 'pbEffectAfterAllHits'] }));
  assert.deepEqual(special.unmodeled, ['效果代碼 07F 改寫了 pbBaseDamage（威力另算），尚未移植']);
  const multiHit = calc.calculate(attacker({}), move({ functionCode: '0C0', overriddenMethods: ['multiHitMove?', 'pbNumHits', 'pbBaseDamage'] }));
  assert.deepEqual(multiHit.unmodeled, []);
});

test('變化招沒有傷害', () => {
  assert.throws(() => calc.calculate(attacker({}), move({ category: 'status', power: 0 })), /變化招/);
});

test('招式自己的威力倍率在特性之後套用：技術高手先看到原本的威力', () => {
  // 雜技（威力 55）沒帶道具 ×2：技術高手判定時威力 55 ≤ 60 → ×1.5，再 ×2 → 165
  const acro = calc.calculate(attacker({ ability: 'TECHNICIAN' }), move({ power: 55, baseDamageMultiplier: 2 }));
  assert.equal(acro.max, calc.calculate(attacker({}), move({ power: 165 })).max);
});
