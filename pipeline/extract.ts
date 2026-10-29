// 遊戲資料 → data/raw/*.json
// 原樣保留遊戲的欄位名稱與值，只做格式轉換（Marshal → JSON），不做任何整理或篩選
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodeDat, parseMarshal, toPlain, uniqueRecords, type RubyValue } from './marshal.ts';
import { GAME, RAW_DIR, sourceDir } from './sources.ts';

const gameDir = sourceDir(GAME);
const readDat = (name: string) => parseMarshal(decodeDat(readFileSync(join(gameDir, 'Data', name))));

type Plain = Record<string, unknown> & { id: string; id_number: number };

function records(name: string): Plain[] {
  return uniqueRecords(readDat(name))
    .map((r) => toPlain(r) as Plain)
    .sort((a, b) => a.id_number - b.id_number);
}

// 從 Ruby 原始碼讀常數，例如 GAME_VERSION_NUMBER = "6.8.3"
function rubyConstant(file: string, name: string): string {
  const m = readFileSync(join(gameDir, file), 'utf8').match(new RegExp(`^\\s*${name}\\s*=\\s*"?([^"\\s#]+)`, 'm'));
  if (!m) throw new Error(`${file} 找不到 ${name}`);
  return m[1]!;
}

// 個性寫死在程式碼裡（GameData::Nature.register），用文字解析，不執行 Ruby
export function parseNatures(src: string) {
  const blocks = src.split('GameData::Nature.register(').slice(1);
  return blocks.map((b) => {
    const id = b.match(/:id\s*=>\s*:(\w+)/)?.[1];
    const idNumber = b.match(/:id_number\s*=>\s*(\d+)/)?.[1];
    const name = b.match(/:name\s*=>\s*_INTL\("([^"]+)"\)/)?.[1];
    if (!id || !idNumber || !name) throw new Error(`無法解析個性定義：${b.slice(0, 80)}`);
    const stat_changes = [...(b.match(/:stat_changes\s*=>\s*\[(.*)\]/)?.[1] ?? '').matchAll(/\[:(\w+),\s*(-?\d+)\]/g)].map(
      (m) => [m[1]!, Number(m[2])] as const,
    );
    return { id, id_number: Number(idNumber), real_name: name, stat_changes };
  });
}

// chinese.dat：MessageTypes 編號 → 內容（Data/Scripts/001_Technical/003_Intl_Messages.rb）
const MESSAGE_TYPES = { species: 1, moves: 5, abilities: 10, types: 12, scriptTexts: 24 } as const;

// OrderedHash 的 _dump 是 Marshal.dump([keys, values])
function orderedHash(v: RubyValue): Map<string, string> {
  if (typeof v !== 'object' || v === null || !('__userdef' in v)) throw new Error('預期 OrderedHash');
  const [keys, values] = toPlain(parseMarshal(v.__userdef as Uint8Array)) as [string[], string[]];
  return new Map(keys.map((k, i) => [k, values[i]!]));
}

function gameChineseNames(natures: { id: string; real_name: string }[]) {
  const msgs = readDat('chinese.dat') as RubyValue[];
  const byNumber = (type: number, list: Plain[]) => {
    const arr = msgs[type] as (string | null)[];
    return Object.fromEntries(list.map((r) => [r.id, arr[r.id_number] ?? null]));
  };
  const scriptTexts = orderedHash(msgs[MESSAGE_TYPES.scriptTexts]!);
  return {
    byNumber,
    natures: Object.fromEntries(natures.map((n) => [n.id, scriptTexts.get(n.real_name) ?? null])),
  };
}

function gitHead(dir: string) {
  return spawnSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf8' }).stdout.trim();
}

const write = (name: string, data: unknown) => {
  writeFileSync(join(RAW_DIR, `${name}.json`), JSON.stringify(data, null, 1) + '\n');
};

function main() {
  mkdirSync(RAW_DIR, { recursive: true });
  const types = records('types.dat');
  const moves = records('moves.dat');
  const abilities = records('abilities.dat');
  const species = records('species.dat');
  const natures = parseNatures(readFileSync(join(gameDir, 'Data/Scripts/010_Data/001_Hardcoded data/009_Nature.rb'), 'utf8'));
  const zh = gameChineseNames(natures);

  const meta = {
    source: GAME.url,
    branch: GAME.branch,
    commit: gitHead(gameDir),
    game_version: rubyConstant('Data/Scripts/001_Settings.rb', 'GAME_VERSION_NUMBER'),
    nb_pokemon: Number(rubyConstant('Data/Scripts/001_Settings.rb', 'NB_POKEMON')),
    mechanics_generation: Number(rubyConstant('Data/Scripts/001_Settings.rb', 'MECHANICS_GENERATION')),
  };

  write('meta', meta);
  write('types', types);
  write('moves', moves);
  write('abilities', abilities);
  write('species', species);
  write('natures', natures);
  // 遊戲內建的中文（簡體）名稱
  write('names_zh_game', {
    species: zh.byNumber(MESSAGE_TYPES.species, species),
    moves: zh.byNumber(MESSAGE_TYPES.moves, moves),
    abilities: zh.byNumber(MESSAGE_TYPES.abilities, abilities),
    types: zh.byNumber(MESSAGE_TYPES.types, types),
    natures: zh.natures,
  });

  console.log(
    `遊戲 ${meta.game_version}（${meta.commit.slice(0, 7)}）：屬性 ${types.length}、招式 ${moves.length}、特性 ${abilities.length}、物種 ${species.length}（含三重融合等特殊物種）、個性 ${natures.length}`,
  );
}

if (import.meta.main) main();
