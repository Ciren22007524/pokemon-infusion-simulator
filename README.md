# pokemon-infusion-simulator
自製寶可夢無限融合模擬器

資料來源與更新方式見 [docs/data.md](docs/data.md)；傷害計算見 [docs/damage.md](docs/damage.md)；融合規則見 [docs/fusion.md](docs/fusion.md)；排行標準見 [docs/ranking.md](docs/ranking.md)。

```bash
pnpm install
pnpm data       # 從遊戲最新版重建資料
pnpm test
pnpm typecheck
pnpm fuse 堅盾劍怪 大鋼蛇       # 融合結果（先頭後身體）
pnpm calc 瑪力露麗/請假王       # 攻擊招式依傷害排序
pnpm rank                       # 全部融合的攻擊力排行
```
