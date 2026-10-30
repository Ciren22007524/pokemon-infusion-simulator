-- 正規化資料表（由 data/raw 建出，不手動修改）
-- id 一律沿用遊戲內部代號（例如 BULBASAUR、TACKLE），number 是遊戲內部編號
-- 中文名稱：name_zh_tw = 台灣官方譯名（PokeAPI zh-Hant，對不到時為 NULL）；name_zh_game = 遊戲內建簡體中文

CREATE TABLE meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE type (
  id           TEXT PRIMARY KEY,
  number       INTEGER NOT NULL UNIQUE,
  name_en      TEXT NOT NULL,
  name_zh_tw   TEXT,
  name_zh_game TEXT,
  -- QMARKS（???）等不是一般屬性
  is_pseudo    INTEGER NOT NULL CHECK (is_pseudo IN (0, 1))
);

-- 只存不是 1 倍的組合；沒列出的就是 1 倍
CREATE TABLE type_effectiveness (
  attack_type TEXT NOT NULL REFERENCES type (id),
  defend_type TEXT NOT NULL REFERENCES type (id),
  multiplier  REAL NOT NULL CHECK (multiplier IN (0, 0.5, 2)),
  PRIMARY KEY (attack_type, defend_type)
);

CREATE TABLE nature (
  id             TEXT PRIMARY KEY,
  number         INTEGER NOT NULL UNIQUE,
  name_en        TEXT NOT NULL,
  name_zh_tw     TEXT,
  name_zh_game   TEXT,
  -- 上升 10%、下降 10% 的能力；無修正的個性兩欄都是 NULL
  increased_stat TEXT CHECK (increased_stat IN ('ATTACK', 'DEFENSE', 'SPECIAL_ATTACK', 'SPECIAL_DEFENSE', 'SPEED')),
  decreased_stat TEXT CHECK (decreased_stat IN ('ATTACK', 'DEFENSE', 'SPECIAL_ATTACK', 'SPECIAL_DEFENSE', 'SPEED')),
  CHECK ((increased_stat IS NULL) = (decreased_stat IS NULL))
);

CREATE TABLE ability (
  id           TEXT PRIMARY KEY,
  number       INTEGER NOT NULL UNIQUE,
  name_en      TEXT NOT NULL,
  name_zh_tw   TEXT,
  name_zh_game TEXT,
  -- 說明文字不可信（例如大力士只寫「提高攻擊」），效果以戰鬥程式碼為準
  desc_en      TEXT,
  desc_zh_game TEXT
);

CREATE TABLE move (
  id            TEXT PRIMARY KEY,
  number        INTEGER NOT NULL UNIQUE,
  name_en       TEXT NOT NULL,
  name_zh_tw    TEXT,
  name_zh_game  TEXT,
  type_id       TEXT NOT NULL REFERENCES type (id),
  category      TEXT NOT NULL CHECK (category IN ('physical', 'special', 'status')),
  -- 0 = 變化招；1 = 威力由程式另算（報恩、地球上投等）
  power         INTEGER NOT NULL,
  -- 0 = 必中
  accuracy      INTEGER NOT NULL,
  pp            INTEGER NOT NULL,
  effect_chance INTEGER NOT NULL,
  priority      INTEGER NOT NULL,
  -- 效果代碼，對應 Data/Scripts/011_Battle/002_Move/ 的 PokeBattle_Move_XXX
  function_code TEXT NOT NULL,
  target        TEXT NOT NULL,
  desc_en       TEXT,
  desc_zh_game  TEXT
);

-- 旗標字母的意義：Data/Scripts/011_Battle/002_Move/001_PokeBattle_Move.rb
CREATE TABLE move_flag_def (
  flag   TEXT PRIMARY KEY,
  method TEXT NOT NULL,
  name   TEXT NOT NULL
);

CREATE TABLE move_flag (
  move_id TEXT NOT NULL REFERENCES move (id),
  flag    TEXT NOT NULL REFERENCES move_flag_def (flag),
  PRIMARY KEY (move_id, flag)
);

-- 只收錄 1 <= number <= NB_POKEMON（三重融合等特殊物種不在內）
CREATE TABLE pokemon (
  id           TEXT PRIMARY KEY,
  number       INTEGER NOT NULL UNIQUE,
  name_en      TEXT NOT NULL,
  name_zh_tw   TEXT,
  name_zh_game TEXT,
  hp           INTEGER NOT NULL,
  attack       INTEGER NOT NULL,
  defense      INTEGER NOT NULL,
  sp_attack    INTEGER NOT NULL,
  sp_defense   INTEGER NOT NULL,
  speed        INTEGER NOT NULL,
  -- 遊戲原值，意義未確認：最早的 420 種不分世代都是 0，不能當成本傳世代
  generation   INTEGER NOT NULL
);

-- 單屬性只存 slot 1（原始資料的 type2 會存成跟 type1 一樣）
CREATE TABLE pokemon_type (
  pokemon_id TEXT NOT NULL REFERENCES pokemon (id),
  slot       INTEGER NOT NULL CHECK (slot IN (1, 2)),
  type_id    TEXT NOT NULL REFERENCES type (id),
  PRIMARY KEY (pokemon_id, slot)
);

-- 隱藏特性可能跟一般特性相同，照原樣保留
CREATE TABLE pokemon_ability (
  pokemon_id TEXT NOT NULL REFERENCES pokemon (id),
  slot       TEXT NOT NULL CHECK (slot IN ('first', 'second', 'hidden')),
  ability_id TEXT NOT NULL REFERENCES ability (id),
  PRIMARY KEY (pokemon_id, slot)
);

-- 該物種本身的清單；進化前學會的招不在這裡，需要時沿 evolution 往前找
-- level：只有 method = 'level' 才有值；1 = 初始招式，0 = 進化時習得（Essentials 慣例）
CREATE TABLE learnset (
  pokemon_id TEXT NOT NULL REFERENCES pokemon (id),
  move_id    TEXT NOT NULL REFERENCES move (id),
  method     TEXT NOT NULL CHECK (method IN ('level', 'tutor', 'egg')),
  level      INTEGER,
  CHECK ((method = 'level') = (level IS NOT NULL)),
  UNIQUE (pokemon_id, move_id, method, level)
);

-- 只存正向（進化前 → 進化後）；原始資料裡編譯器自動補的反向紀錄不收
CREATE TABLE evolution (
  from_id TEXT NOT NULL REFERENCES pokemon (id),
  to_id   TEXT NOT NULL REFERENCES pokemon (id),
  method  TEXT NOT NULL,
  -- 等級、道具代號、招式代號等，依 method 而定
  param   TEXT,
  -- 同一對可能有多種條件（例如呆呆獸用水之石或王者之證都會進化成呆呆王）
  UNIQUE (from_id, to_id, method, param)
);

CREATE INDEX learnset_move ON learnset (move_id);
CREATE INDEX pokemon_type_type ON pokemon_type (type_id);
CREATE INDEX pokemon_ability_ability ON pokemon_ability (ability_id);
