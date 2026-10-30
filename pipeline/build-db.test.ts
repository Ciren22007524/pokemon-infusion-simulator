import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { nameKey, parseCsv, parseMoveFlags, resolveMoveFunctionMethods } from './build-db.ts';
import { TABLES_DIR } from './sources.ts';

test('CSV：引號、跳脫的引號、欄位內換行、BOM、CRLF', () => {
  const rows = parseCsv('﻿a,b\r\n1,"x, ""y""\nz"\r\n2,\r\n');
  assert.deepEqual(rows, [
    { a: '1', b: 'x, "y"\nz' },
    { a: '2', b: '' },
  ]);
});

test('名稱比對鍵：忽略大小寫、標點、重音，♀♂ 轉成字母', () => {
  assert.equal(nameKey("Farfetch'd"), 'farfetchd');
  assert.equal(nameKey('Mr. Mime'), nameKey('mr-mime'));
  assert.equal(nameKey('Flabébé'), 'flabebe');
  assert.notEqual(nameKey('Nidoran♀'), nameKey('Nidoran♂'));
});

test('招式旗標：從戰鬥程式碼讀出字母與方法；未知方法時報錯', () => {
  const src = `  def contactMove?;       return @flags[/a/]; end
  def soundMove?;         return @flags[/k/]; end`;
  assert.deepEqual(parseMoveFlags(src), [
    { flag: 'a', method: 'contactMove?', name: '接觸' },
    { flag: 'k', method: 'soundMove?', name: '聲音' },
  ]);
  assert.throws(() => parseMoveFlags('def newThing?; return @flags[/z/]; end'), /未知/);
});

// 以下檢查 data/tables 的匯出結果，數值來自規格的驗收表（遊戲 6.8.3）
const table = (name: string) => parseCsv(readFileSync(join(TABLES_DIR, `${name}.csv`), 'utf8'));

test('資料筆數：寶可夢 576、招式 680、特性 233、屬性 30、個性 25', () => {
  assert.equal(table('pokemon').length, 576);
  assert.equal(table('move').length, 680);
  assert.equal(table('ability').length, 233);
  assert.equal(table('type').length, 30);
  assert.equal(table('nature').length, 25);
});

test('驗收用寶可夢的種族值、屬性、特性', () => {
  const pokemon = new Map(table('pokemon').map((p) => [p['id'], p]));
  const stats = (id: string) => {
    const p = pokemon.get(id)!;
    return [p['hp'], p['attack'], p['defense'], p['sp_attack'], p['sp_defense'], p['speed']].map(Number);
  };
  assert.deepEqual(stats('AEGISLASH'), [60, 50, 150, 50, 150, 60]);
  assert.deepEqual(stats('STEELIX'), [75, 85, 200, 55, 65, 30]);
  assert.equal(pokemon.get('AEGISLASH')!['name_zh_tw'], '堅盾劍怪');

  const types = table('pokemon_type').filter((t) => t['pokemon_id'] === 'STEELIX');
  assert.deepEqual(types.map((t) => [t['slot'], t['type_id']]), [['1', 'STEEL'], ['2', 'GROUND']]);

  const abilities = Object.fromEntries(table('pokemon_ability').filter((a) => a['pokemon_id'] === 'STEELIX').map((a) => [a['slot'], a['ability_id']]));
  assert.deepEqual(abilities, { first: 'STURDY', second: 'ROCKHEAD', hidden: 'SHEERFORCE' });
});

test('單屬性只存一列', () => {
  const rows = table('pokemon_type').filter((t) => t['pokemon_id'] === 'BULBASAUR' || t['pokemon_id'] === 'CHARMANDER');
  assert.deepEqual(rows.map((t) => `${t['pokemon_id']}:${t['slot']}:${t['type_id']}`), [
    'BULBASAUR:1:GRASS',
    'BULBASAUR:2:POISON',
    'CHARMANDER:1:FIRE',
  ]);
});

test('效果代碼方法：沿繼承展開，近的定義優先，不含 PokeBattle_Move', () => {
  const rows = resolveMoveFunctionMethods({
    PokeBattle_Move: { parent: null, methods: ['pbBaseDamage', 'recoilMove?'] },
    PokeBattle_RecoilMove: { parent: 'PokeBattle_Move', methods: ['recoilMove?', 'pbRecoilDamage'] },
    PokeBattle_Move_0FA: { parent: 'PokeBattle_RecoilMove', methods: ['pbRecoilDamage'] },
  });
  assert.deepEqual(rows, [
    { function_code: '0FA', method: 'pbRecoilDamage', defined_in: 'PokeBattle_Move_0FA' },
    { function_code: '0FA', method: 'recoilMove?', defined_in: 'PokeBattle_RecoilMove' },
  ]);
  assert.throws(() => resolveMoveFunctionMethods({ PokeBattle_Move_001: { parent: 'Missing', methods: [] } }), /不在招式類別/);
});
