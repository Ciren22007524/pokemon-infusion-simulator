// 測試用：從 data/tables/*.csv（有進 repo）讀資料，不依賴建出來的 SQLite
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCsv } from '../pipeline/build-db.ts';
import { TABLES_DIR } from '../pipeline/sources.ts';
import type { SpeciesData } from './fusion.ts';

const cache = new Map<string, Record<string, string>[]>();
export const table = (name: string) => {
  if (!cache.has(name)) cache.set(name, parseCsv(readFileSync(join(TABLES_DIR, `${name}.csv`), 'utf8')));
  return cache.get(name)!;
};

export const NB_POKEMON = Number(table('meta').find((r) => r['key'] === 'nb_pokemon')!['value']);

export function speciesFromTables(id: string): SpeciesData {
  const p = table('pokemon').find((r) => r['id'] === id);
  if (!p) throw new Error(`找不到 ${id}`);
  const types = table('pokemon_type')
    .filter((r) => r['pokemon_id'] === id)
    .sort((a, b) => Number(a['slot']) - Number(b['slot']))
    .map((r) => r['type_id']!);
  const ability = (slot: string) => table('pokemon_ability').find((r) => r['pokemon_id'] === id && r['slot'] === slot)?.['ability_id'];
  const learn = table('learnset').filter((r) => r['pokemon_id'] === id);
  return {
    id,
    number: Number(p['number']),
    base: {
      HP: Number(p['hp']),
      ATTACK: Number(p['attack']),
      DEFENSE: Number(p['defense']),
      SPECIAL_ATTACK: Number(p['sp_attack']),
      SPECIAL_DEFENSE: Number(p['sp_defense']),
      SPEED: Number(p['speed']),
    },
    type1: types[0]!,
    type2: types[1] ?? types[0]!,
    abilities: [ability('first'), ability('second')].filter((a): a is string => !!a),
    hiddenAbilities: [ability('hidden')].filter((a): a is string => !!a),
    levelMoves: learn.filter((r) => r['method'] === 'level').map((r) => [Number(r['level']), r['move_id']!] as const),
    tutorMoves: learn.filter((r) => r['method'] === 'tutor').map((r) => r['move_id']!),
    eggMoves: learn.filter((r) => r['method'] === 'egg').map((r) => r['move_id']!),
  };
}
