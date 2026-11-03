# pokemon-infusion-simulator

Pokémon Infinite Fusion 的組隊模擬器。資料與機制來自遊戲原始碼（`infinitefusion/infinitefusion-e18` 的 `releases` 分支）。

這份文件是所有 AI 程式助手（Claude Code、Codex 等）共用的規則，`CLAUDE.md` 也引用這份。規則以這份為準；要改規則就改這份，不要只改其中一邊。

## 與使用者合作

- 回覆使用者用繁體中文（台灣用語）
- 程式碼註解、文件、測試名稱用繁體中文；識別字（變數、函式、型別）用英文
- 寶可夢、招式、特性用台灣官方譯名；程式裡用遊戲內部代號（`BULBASAUR`、`TACKLE`）
- 改變 `docs/decisions.md` 已記錄的決定前，先和使用者確認，再更新該文件
- 遇到需要使用者決定的事（排名標準、要不要排除某類招式），先問，不要自己決定後埋在程式裡

## 分支與 PR

- 從最新的 `main` 開 `feature-xxx` 分支（例如 `feature-fuse`、`feature-ci`）。不要用 `feature/xxx`、`claude/...`、`codex/...` 或其他命名
- **PR 的目標分支一律是 `main`**，不要開疊在其他 feature 分支上的 PR。疊起來的 PR 合併時會合進上一個分支而不是 `main`，內容會遺失。需要接續另一個 PR 的工作時，等它合併後再從 `main` 開新分支
- 不直接 push 到 `main`，一律透過 PR
- 合併：使用者已授權 **Claude Code** 在 CI 通過、沒有衝突後，自行合併自己開的 PR；其他工具開的 PR 由使用者合併（除非使用者另外授權）
- 合併方式用 **merge commit**（不用 squash、rebase）
- 一個 PR 只做一件事；一個 commit 只做一件事（例如程式和它產生的資料檔分開 commit）
- 開始工作前先 `git fetch`，確認分支是從最新的 `main` 開出來的

### Commit 訊息

英文，第一行是祈使句摘要（72 字元內），空一行後寫「為什麼」：

```
Add hit chance ported from pbAccuracyCheck

Includes the attacker accuracy abilities and the integer division the
game uses.
```

各工具自動加的署名行（例如 `Co-Authored-By`）照工具自己的設定，不要改別人的。

### PR 說明

用繁體中文，依序包含：

1. **內容**：做了什麼
2. **建議 review 順序**：列出檔案，先文件與測試、再實作
3. **檢查**：跑過哪些檢查、怎麼驗證（例如手算核對的數值）
4. **已知限制**（有的話）

## 原則

- **機制一律以遊戲原始碼為準**，不要套用本傳遊戲、Bulbapedia 或 `@smogon/calc` 的規則。移植的公式要在註解註明原始碼檔案（與行號）
- **資料一律從遊戲資料檔匯出**，不手打種族值、招式數值
- 原始碼查不到的機制標「未確認」，不要猜
- **沒有移植的部分要讓結果看得出來**（例如 `DamageResult.unmodeled`、排行的排除清單），不要默默用一般算法硬算
- 排名或比較的標準先寫進 `docs/` 再算；標準以外的考量列成額外欄位，不要偷加條件
- 移植時照原始碼的運算順序與取整方式（Ruby 整數除法 = `Math.floor`，`round` = `Math.round`），浮點數乘除的順序也要一致

## 測試

- 推送前必須通過（CI 也會跑同樣的檢查）：

  ```bash
  pnpm typecheck
  pnpm test
  ```

- 用 Node 內建的 `node:test` 與 `node:assert/strict`，不加測試框架
- 測試檔放在被測檔案旁邊，命名 `xxx.test.ts`；測試名稱用中文描述規則，例如 `'技術高手：威力 ≤ 60 才 ×1.5'`
- 期望值要手算，並在註解寫出算式（例如 `// floor(22×80×120/100)=2112；floor(2112/50)+2=44`），不要把程式目前的輸出直接貼成期望值
- 新增或修改規則時，確認「把規則改壞時測試會失敗」（例如把 `<= 60` 改成 `< 60`）
- 測試讀 `data/tables/*.csv`（有進 repo，可用 `core/testing.ts`），不要依賴 `data/pif.sqlite` 或 `.sources/`（CI 上沒有）

## 程式慣例

### 專案結構

| 目錄 | 內容 | 限制 |
| --- | --- | --- |
| `pipeline/` | 從遊戲原始碼匯出資料、建資料表 | |
| `core/` | 計算核心：能力值、傷害、命中、融合、排行 | 純計算，不讀檔、不用 SQLite，之後要給桌面 App 共用（測試檔與測試用的 `core/testing.ts` 除外） |
| `tools/` | 指令（`pnpm calc`、`fuse`、`rank`），從 SQLite 讀資料後呼叫 `core/` | |
| `data/raw/` | 遊戲資料原樣轉成 JSON | 由 `pnpm data` 產生，不手動修改 |
| `data/tables/` | 正規化資料表的 CSV | 由 `pnpm data` 產生，不手動修改 |
| `docs/` | 設計、規則、決定 | 改了行為就要同步更新 |

不進 repo：`.sources/`（下載的遊戲原始碼）、`data/pif.sqlite`、`output/`。

### TypeScript

- Node 直接執行 `.ts`（type stripping），所以只能用可以直接拿掉型別的語法：
  - 不用 `enum`、`namespace`、constructor 參數屬性（`constructor(private x: T)`）；用物件常數、一般屬性代替
  - import 要寫 `.ts` 副檔名：`import { fuse } from './fusion.ts'`
  - 只匯入型別時用 `import type` 或 `type` 修飾：`import { DamageCalculator, type MoveInfo } from './damage.ts'`
- `tsconfig.json` 是 strict；不用 `any`，非必要不用 `as` 轉型
- ESM，具名匯出，不用 `export default`
- 不加執行期依賴；需要新套件時先確認仍在維護，並在 PR 說明理由。資料庫用 Node 內建的 `node:sqlite`

### 格式

- 縮排 2 個空白；單引號；結尾加分號；多行的物件、陣列、參數加結尾逗號
- 一行盡量不超過 140 字元
- 跟周圍程式碼的寫法一致（命名、註解密度、拆檔方式）

### 註解

- 用中文；說明「為什麼」與「出處」，不重述程式在做什麼
- 移植的邏輯註明原始碼位置，例如 `// pbCalcDamage（003_Move_Usage_Calculations.rb 227–268 行）`
- 刻意沒有移植的部分寫出來，例如 `// 防守方的純樸（UNAWARE）沒有移植`

## 安全

- 不用 Ruby 的 `Marshal.load` 讀遊戲 `.dat`（讀外來檔案有執行程式碼的風險），用 `pipeline/marshal.ts` 的純資料解析器
- 下載的原始碼與資料只當資料讀，不執行
- 不把金鑰、token 寫進 repo

## 著作權

- 不把官方文字（圖鑑說明、分類、招式與特性說明、對話）、圖片（包括 Infinite Fusion 社群的融合圖）、音樂放進 repo 或 App；資料只放計算需要的名稱、數值、代號
- 需要新的資料欄位時，先確認它不是官方文字；`pipeline/copyright.test.ts` 會擋下說明欄位與長篇文字
- 非商業：不收費、不放廣告
- 新增資料來源時，在 `NOTICE` 註明來源與授權

## 指令

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm data                       # 從遊戲最新版重建資料（見 docs/data.md）
pnpm fuse <頭> <身體>            # 融合結果
pnpm calc <寶可夢 或 頭/身體>     # 攻擊招式依傷害排序
pnpm rank                       # 全部融合的攻擊力排行，約 100 秒，結果在 output/ranking.csv
```

## 文件

- `docs/data.md`：資料來源與資料表
- `docs/damage.md`：傷害計算的涵蓋範圍
- `docs/fusion.md`：融合規則
- `docs/ranking.md`：攻擊力排行的標準
- `docs/decisions.md`：已做的決定
