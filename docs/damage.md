# 傷害計算

`core/damage.ts` 的 `DamageCalculator`，照遊戲 6.8.3 原始碼逐段移植。能力值在 `core/stats.ts`。

## 公式

來源：`Data/Scripts/011_Battle/002_Move/003_Move_Usage_Calculations.rb`（`pbCalcDamage`、`pbCalcDamageMultipliers`）

```
基礎傷害 = floor( floor( floor(2×等級÷5 + 2) × 威力 × 攻擊 ÷ 防禦 ) ÷ 50 ) + 2
實際傷害 = max( round(基礎傷害 × 最終倍率), 1 )
```

- 威力、攻擊、防禦各自先乘上自己的倍率，再四捨五入（最小 1）
- 最終倍率依序乘上：多目標、天氣、擊中要害（×1.5）、亂數 85～100%、本系、屬性相剋、灼傷；最後只四捨五入一次
- 屬性無效時傷害是 0：遊戲在傷害計算之前就判定招式失敗（`009_Battler_UseMove_SuccessChecks.rb` 408 行）

## 不指定防守方

`calculate(attacker, move)` 不傳防守方時，會對「參考對象」計算：沒有屬性、防禦和特防都是 100（可用 `referenceDefense` 調整）、性別不明。這樣算出的傷害只反映攻擊方的能力值、特性和招式，用來比較不同寶可夢的攻擊力。

## 已移植

| 項目 | 來源 |
| --- | --- |
| 能力值（HP、其他五項、個性、神奇守護 HP 1） | `014_Pokemon/001_Pokemon.rb` |
| 能力階級、擊中要害時忽略不利階級 | `pbCalcDamage` |
| 屬性相剋（最多 3 個屬性相乘）、膽量、德爾塔氣流 | `pbCalcTypeMod`、`pbCalcTypeModSingle` |
| 天氣（晴天、下雨、沙暴的岩石特防） | `pbCalcDamageMultipliers` |
| 本系、適應力、灼傷、根性 | `pbCalcDamageMultipliers` |
| 攻擊方特性：35 個傷害特性 | `003_BattleHandlers_Abilities.rb` 的 `DamageCalcUserAbility` |
| 改變招式屬性的特性：飛行皮膚、妖精皮膚、冰凍皮膚、電氣皮膚、濕潤之聲、一般皮膚 | `MoveBaseTypeModifierAbility` |

需要戰鬥狀態的特性，由呼叫端用參數指定：HP（猛火、激流、茂盛、蟲之預感、軟弱）、異常狀態（根性、毒暴走、熱暴走）、天氣（花之禮、太陽之力、沙之力）、引火、慢啟動（預設生效中）、分析、監視、正電／負電、性別（鬥爭心）。

## 尚未移植

結果的 `unmodeled` 會列出招式本身的特殊算法；下面其他項目目前不會提示。

- **招式的特殊算法**：效果代碼類別改寫了 `pbBaseDamage`、`pbModifyDamage` 等方法的招式（例如報恩、地震打挖洞中的對象、跺腳）。從 `move_function_method` 表判斷，會列在 `unmodeled`
- **道具**：攻擊方與防守方的道具都還沒有（講究頭帶、生命寶珠、粗骨頭……共 66 個攻擊方道具 handler）
- **防守方特性**：厚脂肪、過濾、純樸等
- **雙打與場地**：同伴特性、幫助、氣場、場地、玩水／玩泥巴、反射壁／光牆／極光幕、奇妙空間
- **抵銷天氣的特性**：無關天氣、氣閘
- **連擊次數、命中率、擊中要害機率**：不在單次傷害公式內，排名時再處理

## 試算

```bash
pnpm calc 烈咬陸鯊 --level 100 --nature 固執 --ev 252        # 列出可學的攻擊招式，依傷害排序
pnpm calc 烈咬陸鯊 --move 地震 --vs 大鋼蛇 --level 100        # 指定招式與防守方
```

寶可夢、招式、特性、個性都可以用台灣譯名、英文名稱或代號。目前只有單一寶可夢，融合等 `fuse()` 做好後再接上。可學招式只含該物種自己的清單，進化前才學得到的招式還沒算進去。
