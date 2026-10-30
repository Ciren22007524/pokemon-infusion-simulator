// 從 data/pif.sqlite 讀資料，轉成 core 使用的型別
import { DatabaseSync } from 'node:sqlite';
import { DB_PATH } from '../pipeline/sources.ts';
import { buildTypeChart, type MoveCategory, type MoveInfo, type TypeChart } from '../core/damage.ts';
import type { SpeciesData } from '../core/fusion.ts';
import type { Nature, StatId, Stats } from '../core/stats.ts';

export type Species = {
  id: string;
  nameZhTw: string | null;
  nameEn: string;
  base: Stats;
  types: string[];
  abilities: { slot: 'first' | 'second' | 'hidden'; id: string }[];
};

export type Move = MoveInfo & { nameZhTw: string | null; nameEn: string; accuracy: number };

type Row = Record<string, string | number | null>;

export class GameData {
  private readonly db: DatabaseSync;

  constructor(path = DB_PATH) {
    this.db = new DatabaseSync(path, { readOnly: true });
  }

  private all(sql: string, ...params: (string | number)[]): Row[] {
    return this.db.prepare(sql).all(...params) as Row[];
  }

  meta(key: string): string {
    const row = this.all('SELECT value FROM meta WHERE key = ?', key)[0];
    if (!row) throw new Error(`meta 沒有 ${key}`);
    return String(row['value']);
  }

  typeChart(): TypeChart {
    return buildTypeChart(
      this.all('SELECT * FROM type_effectiveness').map((r) => ({
        attack_type: String(r['attack_type']),
        defend_type: String(r['defend_type']),
        multiplier: Number(r['multiplier']),
      })),
    );
  }

  // 用代號、台灣譯名或英文名稱找寶可夢
  findSpecies(query: string): Species {
    const rows = this.all(
      'SELECT * FROM pokemon WHERE upper(id) = upper(?) OR name_zh_tw = ? OR lower(name_en) = lower(?) ORDER BY number',
      query,
      query,
      query,
    );
    if (rows.length === 0) throw new Error(`找不到寶可夢「${query}」`);
    if (rows.length > 1) throw new Error(`「${query}」對應到多隻寶可夢，請用代號：${rows.map((r) => r['id']).join(', ')}`);
    const r = rows[0]!;
    const id = String(r['id']);
    return {
      id,
      nameZhTw: r['name_zh_tw'] as string | null,
      nameEn: String(r['name_en']),
      base: {
        HP: Number(r['hp']),
        ATTACK: Number(r['attack']),
        DEFENSE: Number(r['defense']),
        SPECIAL_ATTACK: Number(r['sp_attack']),
        SPECIAL_DEFENSE: Number(r['sp_defense']),
        SPEED: Number(r['speed']),
      },
      types: this.all('SELECT type_id FROM pokemon_type WHERE pokemon_id = ? ORDER BY slot', id).map((t) => String(t['type_id'])),
      abilities: this.all(
        "SELECT slot, ability_id FROM pokemon_ability WHERE pokemon_id = ? ORDER BY CASE slot WHEN 'first' THEN 1 WHEN 'second' THEN 2 ELSE 3 END",
        id,
      ).map((a) => ({ slot: a['slot'] as Species['abilities'][number]['slot'], id: String(a['ability_id']) })),
    };
  }

  findAbility(query: string): string {
    const row = this.all('SELECT id FROM ability WHERE upper(id) = upper(?) OR name_zh_tw = ? OR lower(name_en) = lower(?)', query, query, query)[0];
    if (!row) throw new Error(`找不到特性「${query}」`);
    return String(row['id']);
  }

  findNature(query: string): Nature {
    const row = this.all('SELECT * FROM nature WHERE upper(id) = upper(?) OR name_zh_tw = ? OR lower(name_en) = lower(?)', query, query, query)[0];
    if (!row) throw new Error(`找不到個性「${query}」`);
    return { increased: row['increased_stat'] as StatId | null, decreased: row['decreased_stat'] as StatId | null };
  }

  private toMove(r: Row): Move {
    const id = String(r['id']);
    return {
      id,
      nameZhTw: r['name_zh_tw'] as string | null,
      nameEn: String(r['name_en']),
      type: String(r['type_id']),
      category: r['category'] as MoveCategory,
      power: Number(r['power']),
      accuracy: Number(r['accuracy']),
      flags: this.all('SELECT flag FROM move_flag WHERE move_id = ? ORDER BY flag', id)
        .map((f) => String(f['flag']))
        .join(''),
      effectChance: Number(r['effect_chance']),
      functionCode: String(r['function_code']),
      overriddenMethods: this.all('SELECT method FROM move_function_method WHERE function_code = ?', String(r['function_code'])).map((m) =>
        String(m['method']),
      ),
    };
  }

  findMove(query: string): Move {
    const row = this.all('SELECT * FROM move WHERE upper(id) = upper(?) OR name_zh_tw = ? OR lower(name_en) = lower(?)', query, query, query)[0];
    if (!row) throw new Error(`找不到招式「${query}」`);
    return this.toMove(row);
  }

  // core/fusion.ts 使用的物種資料
  speciesData(s: Species): SpeciesData {
    const learn = this.all('SELECT move_id, method, level FROM learnset WHERE pokemon_id = ? ORDER BY rowid', s.id);
    const of = (method: string) => learn.filter((r) => r['method'] === method).map((r) => String(r['move_id']));
    return {
      id: s.id,
      number: Number(this.all('SELECT number FROM pokemon WHERE id = ?', s.id)[0]!['number']),
      base: s.base,
      type1: s.types[0]!,
      type2: s.types[1] ?? s.types[0]!,
      abilities: s.abilities.filter((a) => a.slot !== 'hidden').map((a) => a.id),
      hiddenAbilities: s.abilities.filter((a) => a.slot === 'hidden').map((a) => a.id),
      levelMoves: learn.filter((r) => r['method'] === 'level').map((r) => [Number(r['level']), String(r['move_id'])] as const),
      tutorMoves: of('tutor'),
      eggMoves: of('egg'),
    };
  }

  movesByIds(ids: readonly string[]): Move[] {
    return ids.map((id) => this.findMove(id));
  }

  abilityName(id: string): string {
    const r = this.all('SELECT name_zh_tw, name_en FROM ability WHERE id = ?', id)[0];
    return r ? String(r['name_zh_tw'] ?? r['name_en']) : id;
  }

  typeName(id: string): string {
    const r = this.all('SELECT name_zh_tw, name_en FROM type WHERE id = ?', id)[0];
    return r ? String(r['name_zh_tw'] ?? r['name_en']) : id;
  }

  // 該物種自己清單上的招式（升級、教學、蛋）；進化前才學得到的招式不在內
  learnableMoves(speciesId: string): Move[] {
    return this.all(
      'SELECT DISTINCT m.* FROM learnset l JOIN move m ON m.id = l.move_id WHERE l.pokemon_id = ? ORDER BY m.number',
      speciesId,
    ).map((r) => this.toMove(r));
  }
}
