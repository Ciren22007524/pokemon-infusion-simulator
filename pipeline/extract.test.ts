import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNatures } from './extract.ts';

test('個性：從 GameData::Nature.register 讀出 id、編號、名稱、能力變化', () => {
  const src = `
GameData::Nature.register({
  :id           => :HARDY,
  :id_number    => 0,
  :name         => _INTL("Hardy")
})

GameData::Nature.register({
  :id           => :LONELY,
  :id_number    => 1,
  :name         => _INTL("Lonely"),
  :stat_changes => [[:ATTACK, 10], [:DEFENSE, -10]]
})`;
  assert.deepEqual(parseNatures(src), [
    { id: 'HARDY', id_number: 0, real_name: 'Hardy', stat_changes: [] },
    { id: 'LONELY', id_number: 1, real_name: 'Lonely', stat_changes: [['ATTACK', 10], ['DEFENSE', -10]] },
  ]);
});

test('個性：格式不符時報錯，不默默略過', () => {
  assert.throws(() => parseNatures('GameData::Nature.register({ :id => :HARDY })'), /無法解析/);
});
