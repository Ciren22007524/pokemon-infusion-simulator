import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hitChance } from './accuracy.ts';

test('一般情況：命中率就是招式的命中；0 = 必中', () => {
  assert.equal(hitChance({ accuracy: 75, category: 'physical' }), 0.75);
  assert.equal(hitChance({ accuracy: 100, category: 'special' }), 1);
  assert.equal(hitChance({ accuracy: 0, category: 'physical' }), 1);
});

test('複眼 ×1.3，整數除法捨去，超過 100% 算 100%', () => {
  // floor(75 × 130 / 100) = 97
  assert.equal(hitChance({ accuracy: 75, category: 'physical', ability: 'COMPOUNDEYES' }), 0.97);
  assert.equal(hitChance({ accuracy: 90, category: 'special', ability: 'COMPOUNDEYES' }), 1);
});

test('活力：只有物理招命中 ×0.8', () => {
  assert.equal(hitChance({ accuracy: 100, category: 'physical', ability: 'HUSTLE' }), 0.8);
  // floor(90 × 80 / 100) = 72
  assert.equal(hitChance({ accuracy: 90, category: 'physical', ability: 'HUSTLE' }), 0.72);
  assert.equal(hitChance({ accuracy: 90, category: 'special', ability: 'HUSTLE' }), 0.9);
});

test('無防守：必中', () => {
  assert.equal(hitChance({ accuracy: 50, category: 'physical', ability: 'NOGUARD' }), 1);
});

test('命中、迴避階級', () => {
  // 命中 +1：100 × 4/3 = 133.3 → 133；floor(75 × 133 / 100) = 99
  assert.equal(hitChance({ accuracy: 75, category: 'physical', accuracyStage: 1 }), 0.99);
  // 迴避 +1：迴避值 133；floor(100 × 100 / 133) = 75
  assert.equal(hitChance({ accuracy: 100, category: 'physical', evasionStage: 1 }), 0.75);
  // 純樸忽略迴避階級
  assert.equal(hitChance({ accuracy: 100, category: 'physical', evasionStage: 1, ability: 'UNAWARE' }), 1);
});
