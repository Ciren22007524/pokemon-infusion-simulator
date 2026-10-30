// 攻擊力排行：每回合期望傷害（類似 DPS），對不指定防守方的參考對象計算
// 排名標準見 docs/ranking.md；這裡的規則改動時要同步更新文件
import { hitChance } from './accuracy.ts';
import { DAMAGE_ABILITIES, moveTypeFor, type DamageCalculator, type MoveCategory, type MoveInfo } from './damage.ts';
import type { Stats } from './stats.ts';

export type RankableMove = MoveInfo & { accuracy: number };

type Hits = { kind: 'fixed'; count: number } | { kind: 'twoToFive' } | { kind: 'tripleKick' };

// 招式在參考條件下的處理方式
//   參考條件：單打、無天氣與場地、雙方滿 HP、沒有異常狀態與能力變化、雙方都沒帶道具、親密度 255、
//   對方沒有屬性與特性、這回合先攻、招式第一次使用
type Rule = {
  // 已檢查過的改寫方法（不再視為未移植）
  handled: string[];
  reason: string;
  power?: number;
  type?: 'NORMAL' | 'USER_TYPE1';
  category?: 'HIGHER_ATTACK';
  critical?: boolean;
  alwaysHit?: boolean;
  hits?: Hits;
  baseDamageMultiplier?: number;
  fixedDamage?: number | 'LEVEL';
  exclude?: boolean;
};

const same = (handled: string[], reason: string): Rule => ({ handled, reason });
const exclude = (reason: string): Rule => ({ handled: [], reason, exclude: true });
const TWO_TURN = same(['pbAccuracyCheck'], '蓄力招：攻擊回合照常判定命中');

// 依效果代碼；來源都在 Data/Scripts/011_Battle/002_Move/
export const REFERENCE_MOVE_RULES: Record<string, Rule> = {
  '008': same(['pbBaseAccuracy'], '打雷：只有晴天、下雨時改變命中'),
  '00D': same(['pbBaseAccuracy'], '暴風雪：只有冰雹時必中'),
  '015': same(['pbBaseAccuracy'], '暴風：只有晴天、下雨時改變命中'),
  '044': same(['pbBaseDamage'], '重踏：只在青草場地減半'),
  '06A': { handled: ['pbCalcDamage', 'pbFixedDamage'], reason: '音爆：固定 20', fixedDamage: 20 },
  '06B': { handled: ['pbCalcDamage', 'pbFixedDamage'], reason: '龍之怒：固定 40', fixedDamage: 40 },
  '06C': exclude('對方 HP 的一半'),
  '06D': { handled: ['pbCalcDamage', 'pbFixedDamage'], reason: '地球上投、黑夜魔影：等於等級', fixedDamage: 'LEVEL' },
  '06E': exclude('依雙方 HP 差'),
  '06F': exclude('精神波：隨機固定傷害'),
  '070': exclude('一擊必殺'),
  '071': exclude('反擊：依受到的傷害'),
  '072': exclude('鏡面反射：依受到的傷害'),
  '073': exclude('金屬爆炸：依受到的傷害'),
  '075': same(['pbModifyDamage'], '衝浪：對方潛水時才加倍'),
  '076': same(['pbModifyDamage'], '地震：對方挖洞時加倍、青草場地減半'),
  '077': same(['pbBaseDamage'], '起風：對方在空中時才加倍'),
  '078': same(['pbBaseDamage'], '龍捲風：對方在空中時才加倍'),
  '079': same(['pbBaseDamageMultiplier'], '交錯閃電：接在交錯火焰之後才加倍'),
  '07A': same(['pbBaseDamageMultiplier'], '交錯火焰：接在交錯閃電之後才加倍'),
  '07B': same(['pbBaseDamage'], '毒液衝擊：對方中毒時才加倍'),
  '07C': same(['pbBaseDamage'], '清醒：對方麻痺時才加倍'),
  '07D': same(['pbBaseDamage'], '喚醒巴掌：對方睡著時才加倍'),
  '07E': same(['pbBaseDamage', 'damageReducedByBurn?'], '硬撐：自己有異常狀態時才加倍'),
  '07F': same(['pbBaseDamage'], '禍不單行：對方有異常狀態時才加倍'),
  '080': same(['pbBaseDamage'], '鹽水：對方 HP 一半以下才加倍'),
  '081': same(['pbBaseDamage'], '報復、雪崩：這回合先被打才加倍'),
  '082': same(['pbBaseDamage'], '惡意追擊：對方這回合已受傷才加倍'),
  '083': same(['pbBaseDamage'], '輪唱：同伴先用才加倍'),
  '084': same(['pbBaseDamage'], '以牙還牙：對方先行動才加倍'),
  '085': same(['pbBaseDamage'], '報仇：上回合有同伴倒下才加倍'),
  '086': { handled: ['pbBaseDamageMultiplier'], reason: '雜技：沒帶道具時威力 ×2', baseDamageMultiplier: 2 },
  '087': same(['pbBaseDamage', 'pbBaseType'], '氣象球：沒有天氣時是一般屬性、威力 50'),
  '088': same(['pbAccuracyCheck', 'pbBaseDamage'], '追打：對方換場時才必中且加倍'),
  '089': { handled: ['pbBaseDamage'], reason: '報恩：親密度 255 時威力 102', power: 102 },
  '08A': { handled: ['pbBaseDamage'], reason: '遷怒：親密度 255 時威力 1', power: 1 },
  '08B': same(['pbBaseDamage'], '噴火、噴水：滿 HP 時威力 150'),
  '08C': { handled: ['pbBaseDamage'], reason: '捏碎、絞緊：對方滿 HP 時威力 120', power: 120 },
  '08D': exclude('陀螺球：依雙方速度'),
  '08E': same(['pbBaseDamage'], '輔助力量、囂張：沒有能力提升時威力 20'),
  '08F': { handled: ['pbBaseDamage'], reason: '懲罰：對方沒有能力提升時威力 60', power: 60 },
  '090': exclude('覺醒力量：屬性與威力依個體值'),
  '091': same(['pbBaseDamage'], '連斬：第一次使用的威力（連續使用會加倍，未計）'),
  '092': same(['pbBaseDamage'], '回聲：第一次使用的威力（連續使用會增加，未計）'),
  '094': exclude('禮物：隨機'),
  '095': exclude('震級：隨機'),
  '096': exclude('自然之恩：需要樹果'),
  '097': exclude('王牌：依剩餘 PP'),
  '098': { handled: ['pbBaseDamage'], reason: '起死回生、抓狂：滿 HP 時威力 20', power: 20 },
  '099': exclude('電球：依雙方速度'),
  '09A': exclude('踢倒、打草結：依對方體重'),
  '09B': exclude('高溫重壓、重磅衝撞：依雙方體重'),
  '09F': { handled: ['pbBaseType'], reason: '沒帶道具時是一般屬性', type: 'NORMAL' },
  '0A0': { handled: ['pbCritialOverride'], reason: '必定擊中要害', critical: true },
  '0A5': { handled: ['pbAccuracyCheck'], reason: '必中', alwaysHit: true },
  '0A9': same(['pbGetDefenseStats'], '無視對方防禦階級（參考對象沒有能力變化）'),
  '0BD': { handled: ['pbNumHits'], reason: '固定 2 下', hits: { kind: 'fixed', count: 2 } },
  '0BE': { handled: ['pbNumHits'], reason: '固定 2 下', hits: { kind: 'fixed', count: 2 } },
  '0BF': { handled: ['pbNumHits', 'pbBaseDamage'], reason: '三連踢：威力 10、20、30，每下判定命中', hits: { kind: 'tripleKick' } },
  '0C0': { handled: ['pbNumHits', 'pbBaseDamage'], reason: '2～5 下', hits: { kind: 'twoToFive' } },
  '0C1': exclude('圍攻：依隊伍成員'),
  '0C3': TWO_TURN,
  '0C4': same(['pbAccuracyCheck', 'pbBaseDamageMultiplier'], '日光束：沒有天氣時不減半；蓄力招'),
  '0C5': TWO_TURN,
  '0C6': TWO_TURN,
  '0C7': TWO_TURN,
  '0C8': TWO_TURN,
  '0C9': TWO_TURN,
  '0CA': TWO_TURN,
  '0CB': TWO_TURN,
  '0CC': TWO_TURN,
  '0CD': TWO_TURN,
  '0CE': same(['pbAccuracyCheck', 'pbCalcTypeMod'], '自由落體：對飛行屬性無效（參考對象沒有屬性）'),
  '0D0': same(['pbModifyDamage'], '潮旋：對方潛水時才加倍'),
  '0D3': same(['pbBaseDamage'], '滾動、冰球：第一回合的威力（之後加倍，未計）'),
  '0D4': exclude('忍耐：依受到的傷害'),
  '0E0': exclude('使用後自己倒下'),
  '0E1': exclude('搏命：依自己的 HP，使用後倒下'),
  '0F0': same(['pbBaseDamage'], '拍落：對方沒帶道具時不加成'),
  '0F7': exclude('投擲：依道具'),
  '106': same(['pbBaseDamage', 'pbBaseType'], '誓約：合體只在雙打'),
  '107': same(['pbBaseDamage', 'pbBaseType'], '誓約：合體只在雙打'),
  '108': same(['pbBaseDamage', 'pbBaseType'], '誓約：合體只在雙打'),
  '111': exclude('預知未來、破滅之願：兩回合後才造成傷害'),
  '113': exclude('噴出：依蓄力次數'),
  '11C': same(['pbCalcTypeModSingle'], '千箭齊發、擊落：地面招打得到飛行（參考對象沒有屬性）'),
  '121': exclude('欺詐：用對方的攻擊'),
  '122': same(['pbGetDefenseStats'], '精神衝擊：打防禦（參考對象防禦 = 特防）'),
  '135': same(['pbCalcTypeModSingle'], '冷凍乾燥：對水屬性效果絕佳（參考對象沒有屬性）'),
  '139': { handled: ['pbAccuracyCheck'], reason: '必中', alwaysHit: true },
  '13A': { handled: ['pbAccuracyCheck'], reason: '必中', alwaysHit: true },
  '13B': { handled: ['pbAccuracyCheck'], reason: '必中', alwaysHit: true },
  '13C': { handled: ['pbAccuracyCheck'], reason: '必中', alwaysHit: true },
  '144': same(['pbCalcTypeModSingle'], '飛身重壓：加上飛行屬性的相剋（參考對象沒有屬性）'),
  '147': { handled: ['pbAccuracyCheck'], reason: '必中', alwaysHit: true },
  '14D': TWO_TURN,
  '15D': same(['pbCalcDamage'], '暗影偷盜：對方沒有能力提升時同一般招式'),
  '164': { handled: ['physicalMove?', 'specialMove?'], reason: '光子噴湧：攻擊 > 特攻時是物理招', category: 'HIGHER_ATTACK' },
  '166': same(['pbBaseDamage'], '跺腳：上回合招式失敗時才加倍'),
  '169': { handled: ['pbBaseType'], reason: '覺醒之舞：使用者的第一屬性', type: 'USER_TYPE1' },
  '175': { handled: ['pbNumHits'], reason: '固定 2 下', hits: { kind: 'fixed', count: 2 } },
};

// 影響傷害、命中、次數的方法；改寫了卻沒有規則的招式一律排除
const RELEVANT_METHODS = new Set([
  'pbCalcDamage',
  'pbFixedDamage',
  'pbBaseDamage',
  'pbBaseDamageMultiplier',
  'pbModifyDamage',
  'pbGetAttackStats',
  'pbGetDefenseStats',
  'pbCalcTypeMod',
  'pbCalcTypeModSingle',
  'pbBaseType',
  'pbCritialOverride',
  'physicalMove?',
  'specialMove?',
  'damageReducedByBurn?',
  'pbBaseAccuracy',
  'pbAccuracyCheck',
  'pbNumHits',
]);

// 2～5 下：[2,2,3,3,4,5] 隨機取一（PokeBattle_Move_0C0#pbNumHits）
const TWO_TO_FIVE_AVERAGE = (2 + 2 + 3 + 3 + 4 + 5) / 6;

export type PreparedMove = {
  move: MoveInfo;
  accuracy: number;
  rule: Rule | null;
  // 每回合的倍率：需要休息、蓄力的招式兩回合打一次
  perTurn: number;
  flags: string[];
  excluded: string | null;
};

export function prepareMove(m: RankableMove): PreparedMove {
  const rule = REFERENCE_MOVE_RULES[m.functionCode] ?? null;
  const handled = new Set(rule?.handled ?? []);
  const unhandled = m.overriddenMethods.filter((x) => RELEVANT_METHODS.has(x) && !handled.has(x));
  const flags: string[] = [];
  let perTurn = 1;
  // 破壞光線類：使用後下回合要休息（PokeBattle_Move_0C2）
  if (m.functionCode === '0C2') {
    perTurn = 0.5;
    flags.push('需休息');
  }
  if (m.overriddenMethods.includes('chargingTurnMove?')) {
    perTurn = 0.5;
    flags.push('蓄力');
  }
  if (m.functionCode === '0D2') flags.push('鎖招');
  if (m.overriddenMethods.includes('recoilMove?')) flags.push('反作用');
  if (m.overriddenMethods.includes('pbSelfKO')) flags.push('自損');
  const excluded = m.category === 'status' ? '變化招' : rule?.exclude ? rule.reason : unhandled.length ? `未移植：${unhandled.join(', ')}` : null;
  const move: MoveInfo = {
    ...m,
    power: rule?.power ?? m.power,
    type: rule?.type === 'NORMAL' ? 'NORMAL' : m.type,
    overriddenMethods: m.overriddenMethods.filter((x) => !handled.has(x)),
    ...(rule?.baseDamageMultiplier !== undefined ? { baseDamageMultiplier: rule.baseDamageMultiplier } : {}),
  };
  return { move, accuracy: m.accuracy, rule, perTurn, flags, excluded };
}

export type RankAttacker = {
  level: number;
  stats: Stats;
  types: readonly string[];
};

export type MoveEvaluation = {
  ability: string | null;
  move: MoveInfo;
  moveType: string;
  category: MoveCategory;
  // 每下的平均傷害（亂數 85～100 的平均）
  averagePerHit: number;
  hitChance: number;
  expectedHits: number;
  // 每回合期望傷害（排名主標準）
  expectedPerTurn: number;
  flags: string[];
};

// 特性對攻擊的影響（其他特性一律視為「無影響」，共用計算結果）
const RANKING_ABILITIES = new Set([...DAMAGE_ABILITIES, 'COMPOUNDEYES', 'HUSTLE', 'NOGUARD', 'VICTORYSTAR', 'SKILLLINK', 'TRUANT']);
export const abilityMatters = (ability: string | null) => ability !== null && RANKING_ABILITIES.has(ability);

export class Ranker {
  private readonly cache = new Map<string, number>();
  private readonly calc: DamageCalculator;
  private readonly gen: number;

  constructor(calc: DamageCalculator, mechanicsGeneration: number) {
    this.calc = calc;
    this.gen = mechanicsGeneration;
  }

  // 每下的平均傷害，依（招式、特性、相關能力值、本系、屬性）快取
  private averagePerHit(attacker: RankAttacker, ability: string | null, move: MoveInfo, critical: boolean): { average: number; type: string } {
    const { type } = moveTypeFor(move, ability, this.gen);
    const stat = move.category === 'special' ? attacker.stats.SPECIAL_ATTACK : attacker.stats.ATTACK;
    const stab = attacker.types.includes(type);
    const key = `${move.id}|${move.type}|${move.category}|${move.power}|${ability}|${stat}|${stab ? 1 : 0}|${critical ? 1 : 0}|${attacker.level}`;
    let average = this.cache.get(key);
    if (average === undefined) {
      const r = this.calc.calculate(
        { level: attacker.level, attack: attacker.stats.ATTACK, spatk: attacker.stats.SPECIAL_ATTACK, totalHp: attacker.stats.HP, types: attacker.types, ability },
        move,
        null,
        { critical },
      );
      if (r.unmodeled.length) throw new Error(`${move.id} 仍有未移植的部分：${r.unmodeled.join('；')}`);
      average = r.average;
      this.cache.set(key, average);
    }
    return { average, type };
  }

  evaluate(attacker: RankAttacker, ability: string | null, p: PreparedMove): MoveEvaluation | null {
    if (p.excluded) return null;
    const rule = p.rule;
    let move = p.move;
    if (rule?.type === 'USER_TYPE1') move = { ...move, type: attacker.types[0]! };
    if (rule?.category === 'HIGHER_ATTACK')
      move = { ...move, category: attacker.stats.ATTACK > attacker.stats.SPECIAL_ATTACK ? 'physical' : 'special' };

    const chance = rule?.alwaysHit ? 1 : hitChance({ accuracy: p.accuracy, category: move.category, ability });
    const truant = ability === 'TRUANT' ? 0.5 : 1;
    const flags = ability === 'TRUANT' ? [...p.flags, '懶惰'] : p.flags;

    if (rule?.fixedDamage !== undefined) {
      const dmg = rule.fixedDamage === 'LEVEL' ? attacker.level : rule.fixedDamage;
      return { ability, move, moveType: move.type, category: move.category, averagePerHit: dmg, hitChance: chance, expectedHits: 1, expectedPerTurn: dmg * chance * p.perTurn * truant, flags };
    }

    const critical = rule?.critical ?? false;
    const hits = rule?.hits;
    if (hits?.kind === 'tripleKick') {
      // 威力依序 10、20、30；每一下都判定命中，沒中就停止；連續攻擊只判定第一下（PokeBattle_Move_0BF）
      const perHit = [1, 2, 3].map((k) => this.averagePerHit(attacker, ability, { ...move, power: move.power * k }, critical));
      const skillLink = ability === 'SKILLLINK';
      let expected = 0;
      let reach = 1;
      for (const h of perHit) {
        // 打到第 k 下的機率
        reach = skillLink ? chance : reach * chance;
        expected += reach * h.average;
      }
      const expectedHits = skillLink ? 3 * chance : chance + chance ** 2 + chance ** 3;
      return { ability, move, moveType: perHit[0]!.type, category: move.category, averagePerHit: perHit.reduce((a, h) => a + h.average, 0) / 3, hitChance: chance, expectedHits, expectedPerTurn: expected * p.perTurn * truant, flags };
    }

    const { average, type } = this.averagePerHit(attacker, ability, move, critical);
    const count = hits?.kind === 'fixed' ? hits.count : hits?.kind === 'twoToFive' ? (ability === 'SKILLLINK' ? 5 : TWO_TO_FIVE_AVERAGE) : 1;
    // 命中只判定第一下；沒中就全部落空
    const expectedPerTurn = average * count * chance * p.perTurn * truant;
    return { ability, move, moveType: type, category: move.category, averagePerHit: average, hitChance: chance, expectedHits: count * chance, expectedPerTurn, flags };
  }

  // 在所有可選特性 × 可學招式中，取每回合期望傷害最高的組合
  best(attacker: RankAttacker, abilities: readonly string[], moves: readonly PreparedMove[]): MoveEvaluation | null {
    const relevant = [...new Set(abilities.map((a) => (abilityMatters(a) ? a : null)))];
    let best: MoveEvaluation | null = null;
    for (const ability of relevant)
      for (const p of moves) {
        const e = this.evaluate(attacker, ability, p);
        if (e && (!best || e.expectedPerTurn > best.expectedPerTurn)) best = e;
      }
    return best;
  }
}

// 主標準相同時依序比：速度、HP、代號
export function compareRanked(
  a: { score: number; stats: Stats; id: string },
  b: { score: number; stats: Stats; id: string },
): number {
  return b.score - a.score || b.stats.SPEED - a.stats.SPEED || b.stats.HP - a.stats.HP || a.id.localeCompare(b.id);
}
