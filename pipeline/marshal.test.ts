import { test } from 'node:test';
import assert from 'node:assert/strict';
import { XOR_KEY, decodeDat, parseMarshal, toPlain } from './marshal.ts';

// 以下 hex 由 Ruby 3.3 的 Marshal.dump 產生
const hex = (s: string) => Uint8Array.from(Buffer.from(s, 'hex'));

test('物件、ivar、各種整數、浮點數、UTF-8 字串、symbol 參照', () => {
  // Foo.new：@id=:BAR, @n=-300, @big=2**40, @f=1.5, @s="中文",
  // @arr=[1,nil,true,false,-1,123,-129,65536], @h={:A=>1, :B=>[:A,"x"]}
  const v = parseMarshal(
    hex(
      '04086f3a08466f6f0c3a084069643a084241523a07406e69fed4fe3a09406269676c2b080000000000013a0740666608312e353a07407349220be4b8ade69687063a0645543a09406172725b0d690630544669fa69017b69ff7f69030000013a0740687b073a064169063a06425b073b0f49220678063b0c54',
    ),
  );
  assert.equal((v as { __class: string }).__class, 'Foo');
  assert.deepEqual(toPlain(v), {
    id: 'BAR',
    n: -300,
    big: 2 ** 40,
    f: 1.5,
    s: '中文',
    arr: [1, null, true, false, -1, 123, -129, 65536],
    h: { A: 1, B: ['A', 'x'] },
  });
});

test('物件參照（@）與 symbol 參照（;）', () => {
  // s = "shared"; [s, s, :SYM, :SYM]
  const v = parseMarshal(hex('04085b0949220b736861726564063a06455440063a0853594d3b06'));
  assert.deepEqual(toPlain(v), ['shared', 'shared', 'SYM', 'SYM']);
});

test('有預設值的 hash，key 不是名稱時保留成 pair 陣列', () => {
  // Hash.new(5).merge!(1=>2)
  const v = parseMarshal(hex('04087d0669066907690a'));
  assert.deepEqual(v, { __hash: [[1, 2]], __default: 5 });
  assert.deepEqual(toPlain(v), [[1, 2]]);
});

test('負數與 bignum 邊界', () => {
  // [-5, -4, -256, -65536, 2**31, -(2**31)]
  const v = parseMarshal(hex('04085b0b69f669f769ff0069fe00006c2b07000000806c2d0700000080'));
  assert.deepEqual(v, [-5, -4, -256, -65536, 2 ** 31, -(2 ** 31)]);
});

test('XOR 解碼：已編碼的資料會還原，未編碼的原樣回傳', () => {
  const plain = hex('04085b0949220b736861726564063a06455440063a0853594d3b06');
  const encoded = plain.map((b, i) => b ^ XOR_KEY[i % XOR_KEY.length]!);
  assert.deepEqual(decodeDat(encoded), plain);
  assert.equal(decodeDat(plain), plain);
});

test('資料不完整或有多餘位元組時報錯', () => {
  assert.throws(() => parseMarshal(hex('04085b0969')), /提前結束/);
  assert.throws(() => parseMarshal(hex('0408690600')), /還剩/);
  assert.throws(() => parseMarshal(hex('0409')), /4\.8/);
});
