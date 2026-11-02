import { test } from 'node:test';
import assert from 'node:assert/strict';
import { abilityChoices, fuse, fusedStat, learnableMoveIds, stanceChangeSwap, type SpeciesData } from './fusion.ts';
import { NB_POKEMON, speciesFromTables } from './testing.ts';

const fuseIds = (head: string, body: string) => fuse(speciesFromTables(head), speciesFromTables(body), NB_POKEMON);
const statList = (f: ReturnType<typeof fuseIds>) => {
  const s = f.base;
  return [s.HP, s.ATTACK, s.DEFENSE, s.SPECIAL_ATTACK, s.SPECIAL_DEFENSE, s.SPEED];
};

// 規格第 6 節的驗收數值（遊戲 6.8.3）
test('驗收：堅盾劍怪（頭）/ 大鋼蛇（身體）', () => {
  const f = fuseIds('AEGISLASH', 'STEELIX');
  assert.deepEqual(f.types, ['STEEL', 'GROUND']);
  assert.deepEqual(statList(f), [65, 72, 183, 51, 121, 40]);
  assert.equal(f.number, 120137);
  assert.deepEqual(f.abilities, ['STURDY', 'STANCECHANGE']);
  assert.deepEqual(f.hiddenAbilities, ['ROCKHEAD', 'STANCECHANGE', 'SHEERFORCE', 'STANCECHANGE']);
});

test('驗收：壺壺 / 堅盾劍怪', () => {
  const f = fuseIds('SHUCKLE', 'AEGISLASH');
  assert.deepEqual(f.types, ['BUG', 'GHOST']);
  assert.deepEqual(statList(f), [33, 36, 176, 22, 203, 41]);
});

test('驗收：瑪力露麗 / 請假王', () => {
  const f = fuseIds('AZUMARILL', 'SLAKING');
  assert.deepEqual(f.types, ['WATER', 'NORMAL']);
  assert.deepEqual(statList(f), [116, 122, 92, 71, 74, 82]);
});

test('驗收：波克基斯 / 叉字蝠', () => {
  const f = fuseIds('TOGEKISS', 'CROBAT');
  assert.deepEqual(f.types, ['FAIRY', 'FLYING']);
  assert.deepEqual(statList(f), [84, 76, 84, 103, 102, 112]);
});

test('驗收：戰鬥切換直接對調當下的攻防、特攻特防', () => {
  const s = fuseIds('AEGISLASH', 'STEELIX').base;
  const blade = stanceChangeSwap({ attack: s.ATTACK, defense: s.DEFENSE, spatk: s.SPECIAL_ATTACK, spdef: s.SPECIAL_DEFENSE });
  assert.deepEqual(blade, { attack: 183, defense: 72, spatk: 121, spdef: 51 });
});

test('能力值公式：兩項各自整數除法', () => {
  assert.equal(fusedStat(100, 100), 66 + 33);
  assert.equal(fusedStat(1, 1), 0);
});

// 用假資料測屬性規則，避免依賴特定寶可夢
const mon = (id: string, type1: string, type2 = type1, extra: Partial<SpeciesData> = {}): SpeciesData => ({
  id,
  number: 1,
  base: { HP: 60, ATTACK: 60, DEFENSE: 60, SPECIAL_ATTACK: 60, SPECIAL_DEFENSE: 60, SPEED: 60 },
  type1,
  type2,
  abilities: ['A'],
  hiddenAbilities: [],
  levelMoves: [],
  tutorMoves: [],
  eggMoves: [],
  ...extra,
});

test('屬性：頭是一般/飛行時，第一屬性取飛行', () => {
  assert.deepEqual(fuse(mon('H', 'NORMAL', 'FLYING'), mon('B', 'WATER', 'GROUND'), 10).types, ['FLYING', 'GROUND']);
  assert.deepEqual(fuse(mon('H', 'NORMAL', 'FAIRY'), mon('B', 'WATER', 'GROUND'), 10).types, ['NORMAL', 'GROUND']);
});

test('屬性：身體第二屬性跟第一屬性重複時，改取身體的第一屬性', () => {
  assert.deepEqual(fuse(mon('H', 'FIRE'), mon('B', 'GRASS', 'FIRE'), 10).types, ['FIRE', 'GRASS']);
  // 身體單屬性：type2 = type1
  assert.deepEqual(fuse(mon('H', 'FIRE'), mon('B', 'WATER'), 10).types, ['FIRE', 'WATER']);
  // 兩邊同屬性：只剩一個
  assert.deepEqual(fuse(mon('H', 'FIRE'), mon('B', 'FIRE'), 10).types, ['FIRE']);
});

test('特性：缺第二特性、隱藏特性時往前補', () => {
  const f = fuse(mon('H', 'FIRE', 'FIRE', { abilities: ['H1'] }), mon('B', 'WATER', 'WATER', { abilities: ['B1', 'B2'], hiddenAbilities: ['BH'] }), 10);
  assert.deepEqual(f.abilities, ['B1', 'H1']);
  assert.deepEqual(f.hiddenAbilities, ['B2', 'H1', 'BH', 'H1']);
  assert.deepEqual(abilityChoices(f), ['B1', 'H1', 'B2', 'BH']);
  // 沒有隱藏特性時，補的是第二特性（有的話），不是第一特性
  const g = fuse(mon('H', 'FIRE', 'FIRE', { abilities: ['H1', 'H2'] }), mon('B', 'WATER', 'WATER', { abilities: ['B1', 'B2'] }), 10);
  assert.deepEqual(g.hiddenAbilities, ['B2', 'H2', 'B2', 'H2']);
});

test('招式：身體在前、頭在後合併；可學招式去掉重複', () => {
  const f = fuse(
    mon('H', 'FIRE', 'FIRE', { levelMoves: [[1, 'EMBER']], tutorMoves: ['TACKLE'] }),
    mon('B', 'WATER', 'WATER', { levelMoves: [[5, 'BUBBLE']], tutorMoves: ['TACKLE'], eggMoves: ['MIST'] }),
    10,
  );
  assert.deepEqual(f.levelMoves, [[5, 'BUBBLE'], [1, 'EMBER']]);
  assert.deepEqual(learnableMoveIds(f), ['BUBBLE', 'EMBER', 'TACKLE', 'MIST']);
});

test('代號與編號：B<身體>H<頭>，身體編號 × NB_POKEMON + 頭編號', () => {
  const f = fuse(mon('H', 'FIRE', 'FIRE', { number: 3 }), mon('B', 'WATER', 'WATER', { number: 7 }), 576);
  assert.equal(f.id, 'B7H3');
  assert.equal(f.number, 7 * 576 + 3);
});
