// 資料來源設定：只抓需要的檔案（sparse checkout），放在 .sources/（不進 repo）
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const SOURCES_DIR = join(ROOT, '.sources');
export const RAW_DIR = join(ROOT, 'data', 'raw');
export const TABLES_DIR = join(ROOT, 'data', 'tables');
export const DB_PATH = join(ROOT, 'data', 'pif.sqlite');

export type Source = { name: string; url: string; branch: string; paths: string[] };

export const GAME: Source = {
  name: 'game',
  url: 'https://github.com/infinitefusion/infinitefusion-e18',
  // main 是舊版（6.4.5 / 501 種），最新版在 releases
  branch: 'releases',
  paths: [
    '/Data/species.dat',
    '/Data/moves.dat',
    '/Data/abilities.dat',
    '/Data/types.dat',
    '/Data/chinese.dat',
    '/Data/Scripts/001_Settings.rb',
    '/Data/Scripts/010_Data/001_Hardcoded data/009_Nature.rb',
    // 招式的基底類別與各效果代碼的類別（傷害計算的特例）
    '/Data/Scripts/011_Battle/002_Move/',
  ],
};

// 台灣官方譯名（language_id 4 = zh-Hant）
export const POKEAPI: Source = {
  name: 'pokeapi',
  url: 'https://github.com/PokeAPI/pokeapi',
  branch: 'master',
  paths: [
    'pokemon_species_names',
    'move_names',
    'ability_names',
    'type_names',
    'nature_names',
    'pokemon_species',
    'moves',
    'abilities',
    'types',
    'natures',
  ].map((f) => `/data/v2/csv/${f}.csv`),
};

export const sourceDir = (s: Source) => join(SOURCES_DIR, s.name);
