// 命中率：照 Data/Scripts/011_Battle/002_Move/003_Move_Usage_Calculations.rb 的 pbAccuracyCheck（92–150 行）
// 攻擊方特性：011_Battle/003_BattleHandlers_Abilities.rb 的 AccuracyCalcUserAbility（764–798 行）
// 防守方的特性、道具、重力、看穿等沒有移植

import type { MoveCategory } from './damage.ts';

// 命中、迴避的階級倍率
const STAGE_MUL = [3, 3, 3, 3, 3, 3, 3, 4, 5, 6, 7, 8, 9];
const STAGE_DIV = [9, 8, 7, 6, 5, 4, 3, 3, 3, 3, 3, 3, 3];

export type AccuracyInput = {
  // 招式的命中（0 = 必中）
  accuracy: number;
  category: MoveCategory;
  ability?: string | null;
  // 攻擊方的命中階級、防守方的迴避階級（-6～+6）
  accuracyStage?: number;
  evasionStage?: number;
};

// 回傳命中機率（0～1）
export function hitChance({ accuracy, category, ability = null, accuracyStage = 0, evasionStage = 0 }: AccuracyInput): number {
  let baseAccuracy = accuracy;
  if (baseAccuracy === 0) return 1;
  let accStageMod = accuracyStage;
  let evaStageMod = evasionStage;
  let accuracyMultiplier = 1.0;
  const evasionMultiplier = 1.0;

  // AccuracyCalcUserAbility
  switch (ability) {
    case 'COMPOUNDEYES':
      accuracyMultiplier *= 1.3;
      break;
    case 'HUSTLE':
      if (category === 'physical') accuracyMultiplier *= 0.8;
      break;
    case 'KEENEYE':
      // 第 6 世代以上才忽略迴避提升；遊戲是第 5 世代，沒有效果
      break;
    case 'NOGUARD':
      baseAccuracy = 0;
      break;
    case 'UNAWARE':
      if (category !== 'status') evaStageMod = 0;
      break;
    case 'VICTORYSTAR':
      accuracyMultiplier *= 1.1;
      break;
  }
  if (baseAccuracy === 0) return 1;

  const accStage = Math.min(Math.max(accStageMod, -6), 6) + 6;
  const evaStage = Math.min(Math.max(evaStageMod, -6), 6) + 6;
  let acc = (100.0 * STAGE_MUL[accStage]!) / STAGE_DIV[accStage]!;
  let eva = (100.0 * STAGE_MUL[evaStage]!) / STAGE_DIV[evaStage]!;
  acc = Math.round(acc * accuracyMultiplier);
  eva = Math.round(eva * evasionMultiplier);
  if (eva < 1) eva = 1;
  // pbRandom(100) < base_accuracy * accuracy / evasion，三個都是整數，所以是整數除法
  const threshold = Math.floor((baseAccuracy * acc) / eva);
  return Math.min(Math.max(threshold, 0), 100) / 100;
}
