import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { OMITTED_TEXT_FIELDS, omitTextFields } from './extract.ts';
import { RAW_DIR, TABLES_DIR } from './sources.ts';

// 官方文字（圖鑑說明、招式與特性說明）有著作權，不能進公開 repo

test('匯出時拿掉官方文字欄位，其他欄位原樣保留', () => {
  const record = { id: 'TACKLE', base_damage: 40, real_description: 'A physical attack…', contest_description: '…' };
  assert.deepEqual(omitTextFields(record), { id: 'TACKLE', base_damage: 40 });
});

test('data/raw 沒有官方文字欄位，也沒有長篇文字', () => {
  const found: string[] = [];
  const walk = (v: unknown, path: string) => {
    if (typeof v === 'string') {
      // 目前最長的是來源網址（約 50 字）；說明文字都比這長
      if (v.length > 80) found.push(`${path}：${v.slice(0, 40)}…`);
    } else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
    else if (v && typeof v === 'object')
      for (const [k, x] of Object.entries(v)) {
        if (OMITTED_TEXT_FIELDS.includes(k) || /description/i.test(k)) found.push(`${path}.${k}`);
        walk(x, `${path}.${k}`);
      }
  };
  for (const f of readdirSync(RAW_DIR)) walk(JSON.parse(readFileSync(join(RAW_DIR, f), 'utf8')), f);
  assert.deepEqual(found, []);
});

test('data/tables 沒有說明文字欄位', () => {
  for (const f of readdirSync(TABLES_DIR)) {
    const header = readFileSync(join(TABLES_DIR, f), 'utf8').replace(/^﻿/, '').split('\n')[0]!;
    assert.ok(!/desc|pokedex|category_text/i.test(header), `${f} 有說明文字欄位：${header}`);
  }
});
