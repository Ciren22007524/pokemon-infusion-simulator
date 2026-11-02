// data/raw + PokeAPI 台灣譯名 → data/pif.sqlite（正規化）＋ data/tables/*.csv（方便瀏覽與 diff）
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { DB_PATH, GAME, POKEAPI, RAW_DIR, ROOT, TABLES_DIR, sourceDir } from './sources.ts';

// ---------- 原始資料型別（欄位名稱同遊戲） ----------
type Stats = Record<'HP' | 'ATTACK' | 'DEFENSE' | 'SPECIAL_ATTACK' | 'SPECIAL_DEFENSE' | 'SPEED', number>;
type RawType = {
  id: string;
  id_number: number;
  real_name: string;
  pseudo_type: boolean;
  weaknesses: string[];
  resistances: string[];
  immunities: string[];
};
type RawMove = {
  id: string;
  id_number: number;
  real_name: string;
  function_code: string;
  base_damage: number;
  type: string;
  category: number;
  accuracy: number;
  total_pp: number;
  effect_chance: number;
  target: string;
  priority: number;
  flags: string;
  real_description: string;
};
type RawAbility = { id: string; id_number: number; real_name: string; real_description: string };
type RawSpecies = {
  id: string;
  id_number: number;
  form: number;
  real_name: string;
  type1: string;
  type2: string;
  base_stats: Stats;
  moves: [number, string][];
  tutor_moves: string[];
  egg_moves: string[];
  abilities: string[];
  hidden_abilities: string[];
  evolutions: [string, string, number | string | null, boolean][];
  generation: number;
};
type RawNature = { id: string; id_number: number; real_name: string; stat_changes: [string, number][] };
type MoveClass = { parent: string | null; methods: string[] };
type ZhGame = Record<'species' | 'moves' | 'move_descriptions' | 'abilities' | 'ability_descriptions' | 'types' | 'natures', Record<string, string | null>>;

const raw = <T>(name: string): T => JSON.parse(readFileSync(join(RAW_DIR, `${name}.json`), 'utf8')) as T;

// ---------- 台灣譯名（PokeAPI） ----------
const LANG_EN = '9';
const LANG_ZH_HANT = '4';

export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = text.charCodeAt(0) === 0xfeff ? 1 : 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length) rows.push([...row, field]);
  const [header, ...body] = rows;
  return body.filter((r) => r.length > 1).map((r) => Object.fromEntries(header!.map((h, i) => [h, r[i] ?? ''])));
}

// 英文名稱比對用：♀♂ 轉字母、去掉重音與標點、轉小寫
export const nameKey = (s: string) =>
  s
    .replace(/♀/g, 'f')
    .replace(/♂/g, 'm')
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9]/g, '')
    .toLowerCase();

// 依英文名稱、PokeAPI 代號兩種方式建立「比對鍵 → 台灣譯名」
function zhTwLookup(entity: string, namesFile: string, idColumn: string) {
  const csv = (f: string) => parseCsv(readFileSync(join(sourceDir(POKEAPI), 'data/v2/csv', `${f}.csv`), 'utf8'));
  const zh = new Map<string, string>();
  const keys = new Map<string, string>(); // 比對鍵 → PokeAPI id
  for (const r of csv(namesFile)) {
    if (r['local_language_id'] === LANG_ZH_HANT) zh.set(r[idColumn]!, r['name']!);
    if (r['local_language_id'] === LANG_EN) keys.set(nameKey(r['name']!), r[idColumn]!);
  }
  for (const r of csv(entity)) if (!keys.has(nameKey(r['identifier']!))) keys.set(nameKey(r['identifier']!), r['id']!);
  return (...candidates: string[]): string | null => {
    for (const c of candidates) {
      const id = keys.get(nameKey(c));
      if (id && zh.has(id)) return zh.get(id)!;
    }
    return null;
  };
}

// 英文名稱相同、無法自動區分的物種，直接指定 PokeAPI 代號
const SPECIES_ALIASES: Record<string, string> = { NIDORANfE: 'nidoran-f', NIDORANmA: 'nidoran-m' };

// ---------- 招式旗標：從戰鬥程式碼讀出字母 → 方法名稱 ----------
const FLAG_NAMES: Record<string, string> = {
  contactMove: '接觸',
  canProtectAgainst: '可被守住',
  canMagicCoat: '可被魔法反射',
  canSnatch: '可被搶奪',
  canMirrorMove: '可被鸚鵡學舌',
  canKingsRock: '王者之證可畏縮',
  thawsUser: '解凍',
  highCriticalRate: '容易擊中要害',
  bitingMove: '啃咬',
  punchingMove: '拳',
  soundMove: '聲音',
  powderMove: '粉末',
  pulseMove: '波動',
  bombMove: '球彈',
  danceMove: '舞蹈',
};

export function parseMoveFlags(src: string) {
  return [...src.matchAll(/def (\w+)\?;\s*return @flags\[\/(\w)\/\]; end/g)].map((m) => {
    const name = FLAG_NAMES[m[1]!];
    if (!name) throw new Error(`未知的招式旗標方法 ${m[1]}，請在 FLAG_NAMES 補上`);
    return { flag: m[2]!, method: `${m[1]}?`, name };
  });
}

// 展開繼承：效果代碼類別 → 它改寫的每個方法與實際定義的類別（近的優先，不含 PokeBattle_Move）
export function resolveMoveFunctionMethods(classes: Record<string, MoveClass>) {
  const rows: { function_code: string; method: string; defined_in: string }[] = [];
  for (const name of Object.keys(classes).sort()) {
    const code = name.match(/^PokeBattle_Move_([0-9A-F]{3})$/)?.[1];
    if (!code) continue;
    const seen = new Set<string>();
    for (let c: string | null = name; c && c !== 'PokeBattle_Move'; c = classes[c]?.parent ?? null) {
      const cls = classes[c];
      if (!cls) throw new Error(`${name} 的父類別 ${c} 不在招式類別裡`);
      for (const method of cls.methods)
        if (!seen.has(method)) {
          seen.add(method);
          rows.push({ function_code: code, method, defined_in: c });
        }
    }
  }
  return rows;
}

// ---------- 建表 ----------
const STAT_IDS = ['ATTACK', 'DEFENSE', 'SPECIAL_ATTACK', 'SPECIAL_DEFENSE', 'SPEED'];
const CATEGORY = ['physical', 'special', 'status'] as const;

function gitHead(dir: string) {
  return spawnSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).stdout.trim();
}

function build() {
  const meta = raw<Record<string, string | number>>('meta');
  const types = raw<RawType[]>('types');
  const moves = raw<RawMove[]>('moves');
  const abilities = raw<RawAbility[]>('abilities');
  const natures = raw<RawNature[]>('natures');
  const zhGame = raw<ZhGame>('text_zh_game');
  const nbPokemon = Number(meta['nb_pokemon']);
  const species = raw<RawSpecies[]>('species').filter((s) => s.id_number >= 1 && s.id_number <= nbPokemon && s.form === 0);
  if (species.length !== nbPokemon) throw new Error(`物種數 ${species.length} 與 NB_POKEMON ${nbPokemon} 不符`);

  const zhSpecies = zhTwLookup('pokemon_species', 'pokemon_species_names', 'pokemon_species_id');
  const zhMove = zhTwLookup('moves', 'move_names', 'move_id');
  const zhAbility = zhTwLookup('abilities', 'ability_names', 'ability_id');
  const zhType = zhTwLookup('types', 'type_names', 'type_id');
  const zhNature = zhTwLookup('natures', 'nature_names', 'nature_id');
  const unmatched: Record<string, string[]> = { pokemon: [], move: [], ability: [], type: [], nature: [] };
  const tw = (kind: string, id: string, found: string | null) => {
    if (found === null) unmatched[kind]!.push(id);
    return found;
  };

  mkdirSync(join(ROOT, 'data'), { recursive: true });
  rmSync(DB_PATH, { force: true });
  const db = new DatabaseSync(DB_PATH);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(readFileSync(join(ROOT, 'pipeline/schema.sql'), 'utf8'));
  db.exec('BEGIN');

  const insert = (table: string, row: Record<string, string | number | null>) => {
    const cols = Object.keys(row);
    db.prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`).run(...Object.values(row));
  };

  for (const [key, value] of Object.entries({
    ...meta,
    pokeapi_source: POKEAPI.url,
    pokeapi_commit: gitHead(sourceDir(POKEAPI)),
  }))
    insert('meta', { key, value: String(value) });

  for (const t of types) {
    insert('type', {
      id: t.id,
      number: t.id_number,
      name_en: t.real_name,
      // ???（QMARKS、QMARK）與三重融合用的複合屬性（編號 20 以後）沒有官方譯名
      name_zh_tw: t.pseudo_type || t.id_number > 18 ? null : tw('type', t.id, zhType(t.id)),
      name_zh_game: zhGame.types[t.id] ?? null,
      is_pseudo: t.pseudo_type ? 1 : 0,
    });
  }
  // 遊戲以防守方記錄弱點／抗性／免疫（GameData::Type#effectiveness）
  for (const def of types) {
    const lists: [string[], number][] = [
      [def.weaknesses, 2],
      [def.resistances, 0.5],
      [def.immunities, 0],
    ];
    const seen = new Set<string>();
    for (const [list, multiplier] of lists)
      for (const atk of list) {
        if (seen.has(atk)) throw new Error(`${def.id} 對 ${atk} 同時出現在兩種相剋清單`);
        seen.add(atk);
        insert('type_effectiveness', { attack_type: atk, defend_type: def.id, multiplier });
      }
  }

  for (const n of natures) {
    const up = n.stat_changes.filter(([, v]) => v > 0);
    const down = n.stat_changes.filter(([, v]) => v < 0);
    const ok =
      n.stat_changes.length === 0 ||
      (n.stat_changes.length === 2 && up.length === 1 && down.length === 1 && up[0]![1] === 10 && down[0]![1] === -10);
    if (!ok || [...up, ...down].some(([s]) => !STAT_IDS.includes(s))) throw new Error(`${n.id} 的能力變化不是 +10%/-10%`);
    insert('nature', {
      id: n.id,
      number: n.id_number,
      name_en: n.real_name,
      name_zh_tw: tw('nature', n.id, zhNature(n.real_name, n.id)),
      name_zh_game: zhGame.natures[n.id] ?? null,
      increased_stat: up[0]?.[0] ?? null,
      decreased_stat: down[0]?.[0] ?? null,
    });
  }

  for (const a of abilities) {
    insert('ability', {
      id: a.id,
      number: a.id_number,
      name_en: a.real_name,
      name_zh_tw: tw('ability', a.id, zhAbility(a.real_name, a.id)),
      name_zh_game: zhGame.abilities[a.id] ?? null,
      desc_en: a.real_description,
      desc_zh_game: zhGame.ability_descriptions[a.id] ?? null,
    });
  }

  const flagSrc = readFileSync(join(sourceDir(GAME), 'Data/Scripts/011_Battle/002_Move/001_PokeBattle_Move.rb'), 'utf8');
  const flagDefs = parseMoveFlags(flagSrc);
  for (const f of flagDefs) insert('move_flag_def', f);

  for (const m of moves) {
    const category = CATEGORY[m.category];
    if (!category) throw new Error(`${m.id} 的分類 ${m.category} 不明`);
    // 變化招必定威力 0，傷害招必定威力 > 0（GameData::Move#physical? 以威力 0 判斷變化招）
    if ((category === 'status') !== (m.base_damage === 0)) throw new Error(`${m.id} 的分類與威力不一致`);
    insert('move', {
      id: m.id,
      number: m.id_number,
      name_en: m.real_name,
      name_zh_tw: tw('move', m.id, zhMove(m.real_name, m.id)),
      name_zh_game: zhGame.moves[m.id] ?? null,
      type_id: m.type,
      category,
      power: m.base_damage,
      accuracy: m.accuracy,
      pp: m.total_pp,
      effect_chance: m.effect_chance,
      priority: m.priority,
      function_code: m.function_code,
      target: m.target,
      desc_en: m.real_description,
      desc_zh_game: zhGame.move_descriptions[m.id] ?? null,
    });
    for (const flag of new Set(m.flags)) insert('move_flag', { move_id: m.id, flag });
  }

  const functionMethods = resolveMoveFunctionMethods(raw<Record<string, MoveClass>>('move_classes'));
  const functionCodes = new Set(functionMethods.map((r) => r.function_code));
  for (const r of functionMethods) insert('move_function_method', r);
  const missing = [...new Set(moves.map((m) => m.function_code))].filter((c) => !functionCodes.has(c) && c !== '000');
  if (missing.length) console.log(`沒有改寫任何方法的效果代碼（與一般招式相同）：${missing.join(', ')}`);

  const speciesIds = new Set(species.map((s) => s.id));
  let droppedDuplicates = 0;
  for (const s of species) {
    const st = s.base_stats;
    insert('pokemon', {
      id: s.id,
      number: s.id_number,
      name_en: s.real_name,
      name_zh_tw: tw('pokemon', s.id, zhSpecies(SPECIES_ALIASES[s.id] ?? s.real_name, s.id)),
      name_zh_game: zhGame.species[s.id] ?? null,
      hp: st.HP,
      attack: st.ATTACK,
      defense: st.DEFENSE,
      sp_attack: st.SPECIAL_ATTACK,
      sp_defense: st.SPECIAL_DEFENSE,
      speed: st.SPEED,
      generation: s.generation,
    });

    insert('pokemon_type', { pokemon_id: s.id, slot: 1, type_id: s.type1 });
    if (s.type2 !== s.type1) insert('pokemon_type', { pokemon_id: s.id, slot: 2, type_id: s.type2 });

    if (s.abilities.length < 1 || s.abilities.length > 2 || s.hidden_abilities.length > 1)
      throw new Error(`${s.id} 的特性數量超出預期：${s.abilities.length} 個一般、${s.hidden_abilities.length} 個隱藏`);
    insert('pokemon_ability', { pokemon_id: s.id, slot: 'first', ability_id: s.abilities[0]! });
    if (s.abilities[1]) insert('pokemon_ability', { pokemon_id: s.id, slot: 'second', ability_id: s.abilities[1] });
    if (s.hidden_abilities[0]) insert('pokemon_ability', { pokemon_id: s.id, slot: 'hidden', ability_id: s.hidden_abilities[0] });

    const learn = new Map<string, Record<string, string | number | null>>();
    const add = (move_id: string, method: string, level: number | null) => {
      const key = `${move_id}|${method}|${level}`;
      if (learn.has(key)) droppedDuplicates++;
      else learn.set(key, { pokemon_id: s.id, move_id, method, level });
    };
    for (const [level, move] of s.moves) add(move, 'level', level);
    for (const move of s.tutor_moves) add(move, 'tutor', null);
    for (const move of s.egg_moves) add(move, 'egg', null);
    for (const row of learn.values()) insert('learnset', row);
  }
  // 進化：等所有寶可夢都建好再寫，避免外鍵順序問題
  for (const s of species)
    for (const [target, method, param, isPrevious] of s.evolutions) {
      if (isPrevious) continue;
      if (!speciesIds.has(target)) throw new Error(`${s.id} 進化成收錄範圍外的 ${target}`);
      insert('evolution', { from_id: s.id, to_id: target, method, param: param === null ? null : String(param) });
    }

  db.exec('COMMIT');
  const fk = db.prepare('PRAGMA foreign_key_check').all();
  if (fk.length) throw new Error(`外鍵檢查失敗：${JSON.stringify(fk.slice(0, 5))}`);
  exportCsv(db);

  const count = (t: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n;
  console.log(
    ['pokemon', 'move', 'ability', 'type', 'type_effectiveness', 'nature', 'learnset', 'evolution', 'move_flag', 'move_function_method']
      .map((t) => `${t} ${count(t)}`)
      .join('、'),
  );
  if (droppedDuplicates) console.log(`learnset 去掉完全重複的 ${droppedDuplicates} 筆`);
  for (const [kind, ids] of Object.entries(unmatched))
    if (ids.length) console.log(`${kind} 對不到台灣譯名（name_zh_tw = NULL）${ids.length} 筆：${ids.join(', ')}`);
  db.close();
}

// ---------- 匯出 CSV ----------
const csvField = (v: unknown) => {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function exportCsv(db: DatabaseSync) {
  rmSync(TABLES_DIR, { recursive: true, force: true });
  mkdirSync(TABLES_DIR, { recursive: true });
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as { name: string }[];
  for (const { name } of tables) {
    const cols = (db.prepare(`PRAGMA table_info(${name})`).all() as { name: string; pk: number }[]).map((c) => c.name);
    const rows = db.prepare(`SELECT * FROM ${name} ORDER BY ${cols.map((_, i) => i + 1).join(', ')}`).all() as Record<string, unknown>[];
    // 加 BOM 讓 Excel 正確辨識 UTF-8
    const lines = [cols.join(','), ...rows.map((r) => cols.map((c) => csvField(r[c])).join(','))];
    writeFileSync(join(TABLES_DIR, `${name}.csv`), '﻿' + lines.join('\n') + '\n');
  }
}

if (import.meta.main) build();
