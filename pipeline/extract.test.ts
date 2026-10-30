import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMoveClasses, parseNatures } from './extract.ts';

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

test('招式類別：讀出父類別與方法；重新打開的類別會合併', () => {
  const a = `class PokeBattle_RecoilMove < PokeBattle_Move
  def recoilMove?;                 return true; end
  def pbRecoilDamage(user,target); return 1;    end
end

class PokeBattle_Move_0FA < PokeBattle_RecoilMove
  def pbRecoilDamage(user,target)
    return (target.damageState.totalHPLost/4.0).round
  end
end`;
  const b = `class PokeBattle_Move_0FA
  def self.helper; end
end`;
  assert.deepEqual(parseMoveClasses([{ file: 'a.rb', src: a }, { file: 'b.rb', src: b }]), {
    PokeBattle_RecoilMove: { parent: 'PokeBattle_Move', methods: ['recoilMove?', 'pbRecoilDamage'] },
    PokeBattle_Move_0FA: { parent: 'PokeBattle_RecoilMove', methods: ['pbRecoilDamage', 'self.helper'] },
  });
});

test('招式類別：同一個類別宣告了不同父類別時報錯', () => {
  const src = 'class X < A\nend\nclass X < B\nend';
  assert.throws(() => parseMoveClasses([{ file: 'a.rb', src }]), /父類別不一致/);
});
