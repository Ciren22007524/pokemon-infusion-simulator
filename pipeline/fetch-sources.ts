// 下載（或更新到最新的）資料來源：遊戲 releases 分支、PokeAPI 的名稱表
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { GAME, POKEAPI, SOURCES_DIR, sourceDir, type Source } from './sources.ts';

function git(args: string[], cwd?: string): string {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} 失敗：\n${r.stderr}`);
  return r.stdout.trim();
}

function fetchSource(s: Source) {
  const dir = sourceDir(s);
  if (!existsSync(dir)) {
    // 只下載需要的檔案，遊戲 repo 完整下載有好幾 GB
    git(['clone', '--depth', '1', '--branch', s.branch, '--filter=blob:none', '--sparse', s.url, dir]);
  } else {
    git(['fetch', '--depth', '1', 'origin', s.branch], dir);
    git(['checkout', '--detach', 'FETCH_HEAD'], dir);
  }
  git(['sparse-checkout', 'set', '--no-cone', ...s.paths], dir);
  console.log(`${s.name}: ${s.url} ${s.branch} @ ${git(['rev-parse', 'HEAD'], dir)}`);
}

mkdirSync(SOURCES_DIR, { recursive: true });
fetchSource(GAME);
fetchSource(POKEAPI);
