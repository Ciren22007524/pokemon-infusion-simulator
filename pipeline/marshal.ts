// Ruby Marshal 4.8 純資料解析器
// 只把位元組轉成 JS 值，不建立任何 Ruby 物件、不執行程式碼。
// 不用 Ruby 的 Marshal.load 是因為它會依資料內容建立物件，讀外來檔案有執行程式碼的風險。

// 遊戲 .dat 的 XOR 金鑰：Data/Scripts/001_Technical/000_Encryption.rb
export const XOR_KEY = [0x4a, 0x8f, 0x2c, 0xe1, 0x73, 0xb5, 0x96, 0x0d, 0x5e, 0xa2, 0x3f, 0xc7, 0x81, 0x14, 0x6b, 0xd9];

export type RubySymbol = { __sym: string };
export type RubyHash = { __hash: [RubyValue, RubyValue][]; __default?: RubyValue };
export type RubyObject = { __class: string; [ivar: string]: RubyValue };
export type RubyUserDef = { __class: string; __userdef: Uint8Array };
export type RubyValue =
  | null
  | boolean
  | number
  | string
  | RubySymbol
  | RubyHash
  | RubyObject
  | RubyUserDef
  | RubyValue[]
  | { __regexp: string }
  | { __classref: string };

// 開頭已經是 04 08 就是未編碼（舊版遊戲），否則先 XOR 解碼
export function decodeDat(buf: Uint8Array): Uint8Array {
  if (buf[0] === 0x04 && buf[1] === 0x08) return buf;
  const out = new Uint8Array(buf.length);
  for (let i = 0; i < buf.length; i++) out[i] = buf[i]! ^ XOR_KEY[i % XOR_KEY.length]!;
  return out;
}

const utf8 = new TextDecoder('utf-8');

export function parseMarshal(buf: Uint8Array): RubyValue {
  let pos = 0;
  const symbols: string[] = [];
  const objects: RubyValue[] = [];

  const byte = (): number => {
    if (pos >= buf.length) throw new Error('資料提前結束');
    return buf[pos++]!;
  };
  const bytes = (n: number): Uint8Array => {
    if (pos + n > buf.length) throw new Error('資料提前結束');
    const b = buf.subarray(pos, pos + n);
    pos += n;
    return b;
  };
  // Ruby 的變長整數編碼（w_long）
  const long = (): number => {
    const c = (byte() << 24) >> 24;
    if (c === 0) return 0;
    if (c >= 5) return c - 5;
    if (c <= -5) return c + 5;
    const n = Math.abs(c);
    let x = 0;
    for (let i = 0; i < n; i++) x += byte() * 2 ** (8 * i);
    return c > 0 ? x : x - 2 ** (8 * n);
  };
  const rawBytes = (): Uint8Array => bytes(long());
  const symbol = (): string => {
    const t = byte();
    if (t === 0x3a /* : */) {
      const s = utf8.decode(rawBytes());
      symbols.push(s);
      return s;
    }
    if (t === 0x3b /* ; */) {
      const s = symbols[long()];
      if (s === undefined) throw new Error('symbol 參照超出範圍');
      return s;
    }
    if (t === 0x49 /* I：帶編碼資訊的 symbol */) {
      const s = symbol();
      ivars();
      return s;
    }
    throw new Error(`預期 symbol，位置 ${pos - 1} 是 0x${t.toString(16)}`);
  };
  const ivars = (): Record<string, RubyValue> => {
    const n = long();
    const out: Record<string, RubyValue> = {};
    for (let i = 0; i < n; i++) {
      const k = symbol();
      out[k] = value();
    }
    return out;
  };
  // 每個非立即值依出現順序登記，供 '@' 參照
  const register = <T extends RubyValue>(v: T): T => {
    objects.push(v);
    return v;
  };

  const value = (): RubyValue => {
    const t = String.fromCharCode(byte());
    switch (t) {
      case '0':
        return null;
      case 'T':
        return true;
      case 'F':
        return false;
      case 'i':
        return long();
      case ':':
      case ';':
        pos--;
        return { __sym: symbol() };
      case '@': {
        const idx = long();
        if (idx >= objects.length) throw new Error('物件參照超出範圍');
        return objects[idx]!;
      }
      case 'I': {
        // 帶 ivar 的值；字串的編碼資訊（E、encoding）不保留，其他 ivar 掛到物件上
        const v = value();
        const iv = ivars();
        if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
          for (const [k, x] of Object.entries(iv)) if (k !== 'E' && k !== 'encoding') (v as RubyObject)[k] = x;
        }
        return v;
      }
      case '"': {
        // 字串是 immutable 的 JS 值，登記一份副本供參照
        const s = utf8.decode(rawBytes());
        objects.push(s);
        return s;
      }
      case 'f': {
        const s = utf8.decode(rawBytes());
        const v = s === 'inf' ? Infinity : s === '-inf' ? -Infinity : s === 'nan' ? NaN : parseFloat(s);
        objects.push(v);
        return v;
      }
      case 'l': {
        const sign = String.fromCharCode(byte());
        const b = bytes(long() * 2);
        let x = 0n;
        for (let i = b.length - 1; i >= 0; i--) x = (x << 8n) | BigInt(b[i]!);
        const v = Number(sign === '-' ? -x : x);
        objects.push(v);
        return v;
      }
      case '[': {
        const arr = register<RubyValue[]>([]);
        const n = long();
        for (let i = 0; i < n; i++) arr.push(value());
        return arr;
      }
      case '{':
      case '}': {
        const h = register<RubyHash>({ __hash: [] });
        const n = long();
        for (let i = 0; i < n; i++) {
          const k = value();
          h.__hash.push([k, value()]);
        }
        if (t === '}') h.__default = value();
        return h;
      }
      case 'o': {
        const obj = register<RubyObject>({ __class: symbol() });
        Object.assign(obj, ivars());
        return obj;
      }
      case 'u': {
        // 自訂 _dump 的物件：保留原始位元組，由呼叫端決定怎麼解讀
        const cls = symbol();
        return register<RubyUserDef>({ __class: cls, __userdef: rawBytes().slice() });
      }
      case 'U': {
        const obj = register<RubyObject>({ __class: symbol() });
        obj['__data'] = value();
        return obj;
      }
      case 'e':
        symbol();
        return value();
      case 'C': {
        const cls = symbol();
        const v = value();
        if (typeof v === 'object' && v !== null && !Array.isArray(v)) (v as RubyObject)['__userclass'] = cls;
        return v;
      }
      case 'S': {
        const obj = register<RubyObject>({ __class: symbol() });
        const n = long();
        for (let i = 0; i < n; i++) {
          const k = symbol();
          obj[k] = value();
        }
        return obj;
      }
      case '/': {
        const src = utf8.decode(rawBytes());
        byte(); // 正規表示式選項
        return register({ __regexp: src });
      }
      case 'c':
      case 'm':
      case 'M':
        return register({ __classref: utf8.decode(rawBytes()) });
      default:
        throw new Error(`不支援的 Marshal 型別 '${t}'，位置 ${pos - 1}`);
    }
  };

  if (byte() !== 4 || byte() !== 8) throw new Error('不是 Marshal 4.8 格式');
  const result = value();
  if (pos !== buf.length) throw new Error(`解析完還剩 ${buf.length - pos} bytes`);
  return result;
}

const isSymbol = (v: RubyValue): v is RubySymbol => typeof v === 'object' && v !== null && '__sym' in v;
const isHash = (v: RubyValue): v is RubyHash => typeof v === 'object' && v !== null && '__hash' in v;

// 轉成一般 JSON：symbol → 字串、ivar 去掉 @、key 都是字串或 symbol 的 hash → 物件
export function toPlain(v: RubyValue): unknown {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(toPlain);
  if (isSymbol(v)) return v.__sym;
  if (isHash(v)) {
    const keysAreNames = v.__hash.every(([k]) => typeof k === 'string' || isSymbol(k));
    if (!keysAreNames) return v.__hash.map(([k, x]) => [toPlain(k), toPlain(x)]);
    return Object.fromEntries(v.__hash.map(([k, x]) => [toPlain(k) as string, toPlain(x)]));
  }
  if ('__userdef' in v) throw new Error(`${v.__class} 是自訂 _dump 格式，需要另外解讀`);
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v)) {
    if (k === '__class') continue;
    out[k.startsWith('@') ? k.slice(1) : k] = toPlain(x as RubyValue);
  }
  return out;
}

// 遊戲的資料檔是 { id => 物件, id_number => 同一個物件 } 的 hash，取出不重複的物件
export function uniqueRecords(v: RubyValue): RubyObject[] {
  if (!isHash(v)) throw new Error('預期資料檔是 hash');
  return [...new Set(v.__hash.map(([, x]) => x as RubyObject))];
}
