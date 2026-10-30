import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcHP, calcStat, calcStats, uniformStats } from './stats.ts';

test('HP：floor((種族×2 + 個體 + floor(努力/4)) × 等級 / 100) + 等級 + 10', () => {
  assert.equal(calcHP(108, 100, 31, 0), 357);
  assert.equal(calcHP(108, 50, 31, 252), 215);
  assert.equal(calcHP(1, 100, 31, 252), 1); // 脫殼忍者
});

test('其他能力值：個性修正在最後乘，再無條件捨去', () => {
  assert.equal(calcStat(130, 100, 31, 252, 110), 394);
  assert.equal(calcStat(130, 100, 31, 252, 100), 359);
  assert.equal(calcStat(130, 100, 31, 252, 90), 323);
  assert.equal(calcStat(130, 50, 31, 3, 100), 150); // 努力值 3 → floor(3/4) = 0
});

test('calcStats：套用個性，神奇守護 HP 固定 1', () => {
  const base = { HP: 108, ATTACK: 130, DEFENSE: 95, SPECIAL_ATTACK: 80, SPECIAL_DEFENSE: 85, SPEED: 102 };
  const s = calcStats({
    base,
    level: 100,
    ivs: uniformStats(31),
    evs: uniformStats(0),
    nature: { increased: 'ATTACK', decreased: 'SPECIAL_ATTACK' },
  });
  assert.equal(s.ATTACK, calcStat(130, 100, 31, 0, 110));
  assert.equal(s.SPECIAL_ATTACK, calcStat(80, 100, 31, 0, 90));
  assert.equal(s.SPEED, calcStat(102, 100, 31, 0, 100));
  assert.equal(calcStats({ base, level: 100, ivs: uniformStats(31), evs: uniformStats(0), ability: 'WONDERGUARD' }).HP, 1);
});
