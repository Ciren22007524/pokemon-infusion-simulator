# pokemon-infusion-simulator
自製寶可夢無限融合模擬器

> 非官方、非商業的同人工具，與 Nintendo、Creatures、GAME FREAK、The Pokémon Company 及 Pokémon Infinite Fusion 團隊無關。Pokémon 與寶可夢名稱是 Nintendo、Creatures、GAME FREAK 的商標。
>
> `LICENSE`（MIT）只涵蓋本專案自己寫的程式碼與文件；`data/` 的資料權利屬於原作者，不在 MIT 授權範圍內。詳見 [NOTICE](NOTICE)。

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
