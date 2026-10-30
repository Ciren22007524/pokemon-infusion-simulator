# 資料

資料分兩層：

| 層 | 位置 | 內容 | 用途 |
| --- | --- | --- | --- |
| 原始資料 | `data/raw/*.json` | 遊戲資料檔原樣轉成 JSON，欄位名稱和值都不改 | 追查「遊戲裡到底寫什麼」；遊戲改版時 diff |
| 正規化資料表 | `data/pif.sqlite`（不進 repo）、`data/tables/*.csv` | 由原始資料建出，加上台灣譯名 | 查詢、模擬器使用 |

正規化資料表一律由腳本產生，不要手動修改；要修正就改 `pipeline/build-db.ts`。

## 更新資料

需要 Node 22.18 以上與 git。

```bash
pnpm data          # 依序執行下面三步
pnpm data:fetch    # 下載／更新來源到 .sources/（只抓需要的檔案）
pnpm data:extract  # 遊戲資料 → data/raw/*.json
pnpm data:build    # data/raw + 台灣譯名 → data/pif.sqlite、data/tables/*.csv
```

`pif.sqlite` 可以用 [DB Browser for SQLite](https://sqlitebrowser.org/) 開啟；CSV 有加 BOM，可以直接用 Excel 開。

## 來源

| 來源 | 分支 | 取用的檔案 |
| --- | --- | --- |
| [infinitefusion/infinitefusion-e18](https://github.com/infinitefusion/infinitefusion-e18) | `releases`（`main` 是舊版） | `Data/{species,moves,abilities,types,chinese}.dat`、`001_Settings.rb`（版本號）、`009_Nature.rb`（個性）、`001_PokeBattle_Move.rb`（招式旗標） |
| [PokeAPI/pokeapi](https://github.com/PokeAPI/pokeapi) | `master` | `data/v2/csv/*_names.csv`（台灣譯名，language_id 4 = zh-Hant） |

兩邊的 commit 都記錄在 `meta` 表與 `data/raw/meta.json`。

遊戲的 `.dat` 是 XOR 編碼的 Ruby Marshal 格式，用 `pipeline/marshal.ts` 解析。這個解析器只把位元組轉成資料，不像 Ruby 的 `Marshal.load` 會依內容建立物件，所以讀外來檔案是安全的，也不需要安裝 Ruby。

## 資料表

| 表 | 內容 |
| --- | --- |
| `pokemon` | 寶可夢與種族值（只收 `1 <= number <= NB_POKEMON`） |
| `pokemon_type` | 屬性，單屬性只存 slot 1 |
| `pokemon_ability` | 特性：`first`、`second`、`hidden` |
| `learnset` | 可學招式：`level`（附等級）、`tutor`、`egg` |
| `evolution` | 進化（只存正向） |
| `move` | 招式 |
| `move_flag`、`move_flag_def` | 招式旗標（接觸、聲音、拳……） |
| `ability` | 特性 |
| `type`、`type_effectiveness` | 屬性與相剋（只存不是 1 倍的組合） |
| `nature` | 個性（上升／下降的能力） |
| `meta` | 遊戲版本、NB_POKEMON、來源 commit |

欄位說明見 `pipeline/schema.sql` 的註解。

## 已知事項

- **中文名稱**：`name_zh_tw` 是台灣官方譯名，依英文名稱對照 PokeAPI；`name_zh_game` 是遊戲內建的簡體中文。尼多蘭／尼多朗英文名稱相同，用代號指定對照
- **沒有台灣譯名的項目**：`FAKEMOVE`（Counterfeit，IF 自創招式）、`???` 屬性、三重融合用的複合屬性
- **`pokemon.generation`**：遊戲原值，意義未確認。最早的 420 種不分世代都是 0，不能當成本傳世代
- **`learnset`**：只有該物種本身的清單。進化前學會的招式不在內，需要時沿 `evolution` 往前找。遊戲原始清單中完全重複的 133 筆已去掉
- **說明文字不可信**：例如大力士的說明只寫「提高攻擊」，效果以戰鬥程式碼為準
- **不在這些表裡的資料**：特殊教學招（寫死在 `FusionMoveTutor.rb`）、道具適用寶可夢（寫在道具 handler）、出現地點，之後需要時再加
