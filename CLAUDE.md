# pokemon-infusion-simulator

Pokémon Infinite Fusion 的組隊模擬器。資料來自遊戲原始碼（`infinitefusion/infinitefusion-e18` 的 `releases` 分支）。

## 與使用者合作

- 回覆用繁體中文（台灣用語）；程式碼註解用中文；commit 訊息用英文
- 一個 commit 只做一件事；PR 說明列出建議的 review 順序
- **分支流程**：從 `main` 開 `feature-xxx` 分支（例如 `feature-fuse`），發 PR，等使用者合併。不要用 `feature/` 或其他命名，不直接 push 到 `main`
- 改變已記錄的決定前，先和使用者確認，並更新 `docs/decisions.md`

## 原則

- **機制一律以遊戲原始碼為準**，不要套用本傳或 Bulbapedia 的規則；每個公式註明原始碼檔案
- **資料一律從遊戲資料檔匯出**，不手打數值
- 原始碼查不到的機制標「未確認」，不要猜
- 沒有移植的部分要讓結果看得出來（例如 `DamageResult.unmodeled`），不默默算錯
- 測試要確認「把規則改壞時會失敗」

## 指令

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm data            # 從遊戲最新版重建資料（見 docs/data.md）
pnpm fuse <頭> <身體>
pnpm calc <寶可夢 或 頭/身體>
```

## 文件

- `docs/data.md`：資料來源與資料表
- `docs/damage.md`：傷害計算的涵蓋範圍
- `docs/fusion.md`：融合規則
- `docs/decisions.md`：已做的決定
