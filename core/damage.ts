// 傷害計算：照 Data/Scripts/011_Battle/002_Move/003_Move_Usage_Calculations.rb 逐段移植
//   pbCalcDamage（227–268 行）、pbCalcDamageMultipliers（270–461 行）、pbCalcTypeMod（30–83 行）
// 攻擊方特性：011_Battle/003_BattleHandlers_Abilities.rb 的 MoveBaseTypeModifierAbility（714–758 行）
//   與 DamageCalcUserAbility（864–1109 行）
//
// 倍率的套用順序、乘除寫法都照原始碼，避免浮點數誤差讓四捨五入的結果跟遊戲不同。
// 沒有移植的部分（道具、防守方特性、雙打與場地效果、招式的特殊算法）不會默默略過：
// 招式有特殊算法時會列在結果的 unmodeled。

export type MoveCategory = 'physical' | 'special' | 'status';
export type Status = 'SLEEP' | 'POISON' | 'BURN' | 'PARALYSIS' | 'FROZEN';
export type Weather = 'Sun' | 'HarshSun' | 'Rain' | 'HeavyRain' | 'Sandstorm' | 'Hail' | 'StrongWinds';
export type Gender = 'male' | 'female' | 'genderless';

export type MoveInfo = {
  id: string;
  type: string;
  category: MoveCategory;
  power: number;
  // 字母旗標（a 接觸、j 拳、k 聲音……），見 move_flag_def
  flags: string;
  effectChance: number;
  functionCode: string;
  // 效果代碼類別改寫的方法（move_function_method），用來判斷特殊算法
  overriddenMethods: readonly string[];
};

export type Attacker = {
  level: number;
  attack: number;
  spatk: number;
  totalHp: number;
  // 預設滿血
  hp?: number;
  types: readonly string[];
  ability?: string | null;
  status?: Status | null;
  gender?: Gender;
  // 能力階級 -6～+6
  attackStage?: number;
  spatkStage?: number;
  // 引火已發動
  flashFire?: boolean;
  // 慢啟動生效中（上場後 5 回合內）；預設 true，因為剛上場時一定生效
  slowStart?: boolean;
};

export type Defender = {
  defense: number;
  spdef: number;
  types: readonly string[];
  gender?: Gender;
  defenseStage?: number;
  spdefStage?: number;
};

export type Conditions = {
  weather?: Weather | null;
  critical?: boolean;
  // 招式打到的目標數（雙打的範圍招 > 1）
  numTargets?: number;
  // 分析：目標這回合已經行動，或這回合沒有使用招式
  targetMovedFirst?: boolean;
  // 監視：目標這回合正要換下場
  targetSwitchingOut?: boolean;
  // 正電／負電：同伴有正電或負電特性
  allyHasPlusOrMinus?: boolean;
};

export type DamageResult = {
  // 套用特性後的招式屬性（例如飛行皮膚把一般招變成飛行）
  moveType: string;
  // 屬性相剋倍率（0、0.25、0.5、1、2、4……）
  effectiveness: number;
  stab: number;
  critical: boolean;
  // 亂數 85～100 各自的傷害，共 16 個
  rolls: number[];
  min: number;
  max: number;
  average: number;
  // 沒有移植、可能影響結果的部分
  unmodeled: string[];
};

// 防守方的相剋資料：遊戲以防守方記錄弱點、抗性、免疫（GameData::Type）
export type TypeChart = ReadonlyMap<string, { weaknesses: ReadonlySet<string>; resistances: ReadonlySet<string>; immunities: ReadonlySet<string> }>;

export function buildTypeChart(rows: Iterable<{ attack_type: string; defend_type: string; multiplier: number }>): TypeChart {
  const chart = new Map<string, { weaknesses: Set<string>; resistances: Set<string>; immunities: Set<string> }>();
  for (const r of rows) {
    let t = chart.get(r.defend_type);
    if (!t) chart.set(r.defend_type, (t = { weaknesses: new Set(), resistances: new Set(), immunities: new Set() }));
    if (r.multiplier === 2) t.weaknesses.add(r.attack_type);
    else if (r.multiplier === 0.5) t.resistances.add(r.attack_type);
    else if (r.multiplier === 0) t.immunities.add(r.attack_type);
    else throw new Error(`不支援的相剋倍率 ${r.multiplier}`);
  }
  return chart;
}

// Effectiveness 模組（Data/Scripts/010_Data/002_PBS data/003_Type.rb）
const INEFFECTIVE = 0;
const NOT_VERY_EFFECTIVE_ONE = 1;
const NORMAL_EFFECTIVE_ONE = 2;
const SUPER_EFFECTIVE_ONE = 4;
const NORMAL_EFFECTIVE = NORMAL_EFFECTIVE_ONE ** 3;

// 階級倍率（pbCalcDamage）
const STAGE_MUL = [2, 2, 2, 2, 2, 2, 2, 3, 4, 5, 6, 7, 8];
const STAGE_DIV = [8, 7, 6, 5, 4, 3, 2, 2, 2, 2, 2, 2, 2];

// 影響傷害計算、但還沒移植的招式方法
const DAMAGE_METHODS: Record<string, string> = {
  pbCalcDamage: '整個傷害計算另寫（例如固定傷害）',
  pbFixedDamage: '固定傷害',
  pbBaseDamage: '威力另算',
  pbBaseDamageMultiplier: '威力倍率另算',
  pbModifyDamage: '最終傷害倍率另算',
  pbGetAttackStats: '攻擊方能力值另取',
  pbGetDefenseStats: '防守方能力值另取',
  pbCalcTypeMod: '屬性相剋另算',
  pbCalcTypeModSingle: '屬性相剋另算',
  pbBaseType: '招式屬性另算',
  pbCritialOverride: '必定或不會擊中要害',
  'physicalMove?': '物理／特殊判定另算',
  'specialMove?': '物理／特殊判定另算',
  'damageReducedByBurn?': '灼傷減半另算',
};

// 檢查過、確認對融合寶可夢的結果沒有影響的改寫
const REVIEWED_OVERRIDES: Record<string, Record<string, string>> = {
  // 只有小智版甲賀忍蛙（form 2）的飛水手裡劍威力變 20，其他情況呼叫 super
  '0C0': { pbBaseDamage: 'only Ash-Greninja Water Shuriken' },
};

type Mults = { base: number; attack: number; defense: number; final: number };

type Ctx = {
  user: Required<Pick<Attacker, 'hp' | 'totalHp' | 'ability' | 'status' | 'flashFire' | 'slowStart' | 'gender'>> & Attacker;
  target: Defender & { gender: Gender };
  move: MoveInfo;
  conditions: Required<Conditions>;
  type: string;
  powerBoost: boolean;
  critical: boolean;
  typeMod: number;
  baseDmg: number;
  mults: Mults;
};

const physical = (m: MoveInfo) => m.category === 'physical';
const special = (m: MoveInfo) => m.category === 'special';
const hasFlag = (m: MoveInfo, f: string) => m.flags.includes(f);
const isSun = (w: Weather | null) => w === 'Sun' || w === 'HarshSun';
const lowHp = (c: Ctx) => c.user.hp <= Math.floor(c.user.totalHp / 3);

// MoveBaseTypeModifierAbility：回傳新的屬性與是否有 powerBoost；不改時回傳 null
type TypeModifier = (move: MoveInfo, type: string, gen: number) => { type: string; powerBoost: boolean } | null;
const ateAbility =
  (to: string): TypeModifier =>
  (_m, type) =>
    type === 'NORMAL' ? { type: to, powerBoost: true } : null;
const TYPE_MODIFIER_ABILITIES: Record<string, TypeModifier> = {
  AERILATE: ateAbility('FLYING'),
  GALVANIZE: ateAbility('ELECTRIC'),
  PIXILATE: ateAbility('FAIRY'),
  REFRIGERATE: ateAbility('ICE'),
  LIQUIDVOICE: (m) => (hasFlag(m, 'k') ? { type: 'WATER', powerBoost: false } : null),
  NORMALIZE: (_m, _t, gen) => ({ type: 'NORMAL', powerBoost: gen >= 7 }),
};

// DamageCalcUserAbility
const USER_ABILITIES: Record<string, (c: Ctx) => void> = {
  AERILATE: (c) => void (c.powerBoost && (c.mults.base *= 1.2)),
  ANALYTIC: (c) => void (c.conditions.targetMovedFirst && (c.mults.base *= 1.3)),
  BLAZE: (c) => void (lowHp(c) && c.type === 'FIRE' && (c.mults.attack *= 1.5)),
  DEFEATIST: (c) => void (c.user.hp <= Math.floor(c.user.totalHp / 2) && (c.mults.attack /= 2)),
  FLAREBOOST: (c) => void (c.user.status === 'BURN' && special(c.move) && (c.mults.base *= 1.5)),
  FLASHFIRE: (c) => void (c.user.flashFire && c.type === 'FIRE' && (c.mults.attack *= 1.5)),
  FLOWERGIFT: (c) => void (physical(c.move) && isSun(c.conditions.weather) && (c.mults.attack *= 1.5)),
  // 昏睡（只對夢夢熊有效）視為有異常狀態的情況沒有處理
  GUTS: (c) => void (c.user.status !== null && physical(c.move) && (c.mults.attack *= 1.5)),
  HUGEPOWER: (c) => void (physical(c.move) && (c.mults.attack *= 2)),
  HUSTLE: (c) => void (physical(c.move) && (c.mults.attack *= 1.5)),
  IRONFIST: (c) => void (hasFlag(c.move, 'j') && (c.mults.base *= 1.2)),
  MEGALAUNCHER: (c) => void (hasFlag(c.move, 'm') && (c.mults.base *= 1.5)),
  MINUS: (c) => void (special(c.move) && c.conditions.allyHasPlusOrMinus && (c.mults.attack *= 1.5)),
  NEUROFORCE: (c) => void (c.typeMod > NORMAL_EFFECTIVE && (c.mults.final *= 1.25)),
  OVERGROW: (c) => void (lowHp(c) && c.type === 'GRASS' && (c.mults.attack *= 1.5)),
  RECKLESS: (c) => void (c.move.overriddenMethods.includes('recoilMove?') && (c.mults.base *= 1.2)),
  RIVALRY: (c) => {
    if (c.user.gender === 'genderless' || c.target.gender === 'genderless') return;
    if (c.user.gender === c.target.gender) c.mults.base *= 1.25;
    else c.mults.base *= 0.75;
  },
  SANDFORCE: (c) =>
    void (c.conditions.weather === 'Sandstorm' && ['ROCK', 'GROUND', 'STEEL'].includes(c.type) && (c.mults.base *= 1.3)),
  SHEERFORCE: (c) => void (c.move.effectChance > 0 && (c.mults.base *= 1.3)),
  SLOWSTART: (c) => void (c.user.slowStart && physical(c.move) && (c.mults.attack /= 2)),
  SOLARPOWER: (c) => void (special(c.move) && isSun(c.conditions.weather) && (c.mults.attack *= 1.5)),
  SNIPER: (c) => void (c.critical && (c.mults.final *= 1.5)),
  STAKEOUT: (c) => void (c.conditions.targetSwitchingOut && (c.mults.attack *= 2)),
  STEELWORKER: (c) => void (c.type === 'STEEL' && (c.mults.attack *= 1.5)),
  STRONGJAW: (c) => void (hasFlag(c.move, 'i') && (c.mults.base *= 1.5)),
  SWARM: (c) => void (lowHp(c) && c.type === 'BUG' && (c.mults.attack *= 1.5)),
  TECHNICIAN: (c) => void (c.move.id !== 'STRUGGLE' && c.baseDmg * c.mults.base <= 60 && (c.mults.base *= 1.5)),
  TINTEDLENS: (c) => void (c.typeMod < NORMAL_EFFECTIVE && (c.mults.final *= 2)),
  TORRENT: (c) => void (lowHp(c) && c.type === 'WATER' && (c.mults.attack *= 1.5)),
  TOUGHCLAWS: (c) => void (hasFlag(c.move, 'a') && (c.mults.base *= 4 / 3.0)),
  TOXICBOOST: (c) => void (c.user.status === 'POISON' && physical(c.move) && (c.mults.base *= 1.5)),
  WATERBUBBLE: (c) => void (c.type === 'WATER' && (c.mults.attack *= 2)),
};
// BattleHandlers::DamageCalcUserAbility.copy
USER_ABILITIES['PIXILATE'] = USER_ABILITIES['REFRIGERATE'] = USER_ABILITIES['GALVANIZE'] = USER_ABILITIES['AERILATE'];
USER_ABILITIES['PUREPOWER'] = USER_ABILITIES['HUGEPOWER'];
USER_ABILITIES['PLUS'] = USER_ABILITIES['MINUS'];

export const SUPPORTED_USER_ABILITIES: readonly string[] = Object.keys(USER_ABILITIES).sort();

// pbCalcType → pbBaseType：套用改變招式屬性的特性
export function moveTypeFor(move: MoveInfo, ability: string | null | undefined, gen: number): { type: string; powerBoost: boolean } {
  const modified = ability ? TYPE_MODIFIER_ABILITIES[ability]?.(move, move.type, gen) : null;
  return modified ?? { type: move.type, powerBoost: false };
}

// 會影響傷害計算的攻擊方特性（其他特性對傷害沒有作用）
export const DAMAGE_ABILITIES: ReadonlySet<string> = new Set([
  ...Object.keys(USER_ABILITIES),
  ...Object.keys(TYPE_MODIFIER_ABILITIES),
  'ADAPTABILITY',
  'GUTS',
  'SCRAPPY',
  'UNAWARE',
]);

export type DamageCalculatorOptions = {
  typeChart: TypeChart;
  // 遊戲設定 MECHANICS_GENERATION（6.8.3 是 5）
  mechanicsGeneration: number;
  // 不指定防守方時使用的參考對象：無屬性、防禦與特防相同、性別不明
  referenceDefense?: number;
};

export class DamageCalculator {
  readonly referenceDefender: Defender;
  private readonly typeChart: TypeChart;
  private readonly gen: number;

  constructor({ typeChart, mechanicsGeneration, referenceDefense = 100 }: DamageCalculatorOptions) {
    // 徽章加成在第 4 世代以上的門檻是 999 個徽章（002_BattleSettings.rb 38–41 行），等於不會發生
    if (mechanicsGeneration < 4) throw new Error('MECHANICS_GENERATION < 4 的徽章加成沒有移植');
    this.typeChart = typeChart;
    this.gen = mechanicsGeneration;
    this.referenceDefender = { defense: referenceDefense, spdef: referenceDefense, types: [] };
  }

  // 不指定 defender 時，對參考對象計算：只反映攻擊方的能力值、特性與招式
  calculate(attacker: Attacker, move: MoveInfo, defender?: Defender | null, conditions: Conditions = {}): DamageResult {
    if (move.category === 'status') throw new Error(`${move.id} 是變化招，沒有傷害`);
    const user = {
      ...attacker,
      hp: attacker.hp ?? attacker.totalHp,
      ability: attacker.ability ?? null,
      status: attacker.status ?? null,
      flashFire: attacker.flashFire ?? false,
      slowStart: attacker.slowStart ?? true,
      gender: attacker.gender ?? 'genderless',
    };
    const def = defender ?? this.referenceDefender;
    const target = { ...def, gender: def.gender ?? 'genderless' };
    const cond: Required<Conditions> = {
      weather: conditions.weather ?? null,
      critical: conditions.critical ?? false,
      numTargets: conditions.numTargets ?? 1,
      targetMovedFirst: conditions.targetMovedFirst ?? false,
      targetSwitchingOut: conditions.targetSwitchingOut ?? false,
      allyHasPlusOrMinus: conditions.allyHasPlusOrMinus ?? false,
    };
    const unmodeled = this.unmodeledParts(move);

    const { type, powerBoost } = moveTypeFor(move, user.ability, this.gen);

    const typeMod = this.typeMod(type, user, target, cond.weather);
    const stab = user.types.includes(type) ? (user.ability === 'ADAPTABILITY' ? 2 : 1.5) : 1;
    const base = { moveType: type, effectiveness: typeMod / NORMAL_EFFECTIVE, stab, critical: cond.critical, unmodeled };
    // 屬性無效時招式在傷害計算前就失敗（009_Battler_UseMove_SuccessChecks.rb 408 行）
    if (typeMod === INEFFECTIVE) return { ...base, rolls: Array(16).fill(0), min: 0, max: 0, average: 0 };

    const rolls: number[] = [];
    for (let random = 85; random <= 100; random++)
      rolls.push(this.calcDamage({ user, target, move, conditions: cond, type, powerBoost, critical: cond.critical, typeMod, baseDmg: move.power, mults: { base: 1, attack: 1, defense: 1, final: 1 } }, random));
    return { ...base, rolls, min: rolls[0]!, max: rolls[15]!, average: rolls.reduce((a, b) => a + b, 0) / rolls.length };
  }

  // pbCalcDamage（亂數由外部指定）
  private calcDamage(c: Ctx, random: number): number {
    const { user, target, move } = c;
    // pbGetAttackStats / pbGetDefenseStats
    let atk = special(move) ? user.spatk : user.attack;
    let atkStage = (special(move) ? (user.spatkStage ?? 0) : (user.attackStage ?? 0)) + 6;
    let defense = special(move) ? target.spdef : target.defense;
    let defStage = (special(move) ? (target.spdefStage ?? 0) : (target.defenseStage ?? 0)) + 6;
    // 防守方的純樸（UNAWARE）沒有移植，一律套用攻擊方的階級
    if (c.critical && atkStage < 6) atkStage = 6;
    atk = Math.floor((atk * STAGE_MUL[atkStage]!) / STAGE_DIV[atkStage]!);
    if (user.ability !== 'UNAWARE') {
      if (c.critical && defStage > 6) defStage = 6;
      defense = Math.floor((defense * STAGE_MUL[defStage]!) / STAGE_DIV[defStage]!);
    }
    this.calcMultipliers(c, random);
    const baseDmg = Math.max(Math.round(c.baseDmg * c.mults.base), 1);
    atk = Math.max(Math.round(atk * c.mults.attack), 1);
    defense = Math.max(Math.round(defense * c.mults.defense), 1);
    const damage = Math.floor(Math.floor((Math.floor((2.0 * user.level) / 5 + 2) * baseDmg * atk) / defense) / 50) + 2;
    return Math.max(Math.round(damage * c.mults.final), 1);
  }

  // pbCalcDamageMultipliers
  private calcMultipliers(c: Ctx, random: number) {
    const m = c.mults;
    // 全場特性（暗黑氣場、妖精氣場）：需要知道場上其他寶可夢，沒有移植
    if (c.user.ability) USER_ABILITIES[c.user.ability]?.(c);
    // 同伴與防守方的特性、雙方道具、幫助、充電、玩水、玩泥巴、場地：沒有移植
    // 徽章加成：第 4 世代以上不會發生（見 constructor）
    if (c.conditions.numTargets > 1) m.final *= 0.75;
    switch (c.conditions.weather) {
      case 'Sun':
      case 'HarshSun':
        if (c.type === 'FIRE') m.final *= 1.5;
        else if (c.type === 'WATER') m.final /= 2;
        break;
      case 'Rain':
      case 'HeavyRain':
        if (c.type === 'FIRE') m.final /= 2;
        else if (c.type === 'WATER') m.final *= 1.5;
        break;
      case 'Sandstorm':
        // 122 = 精神衝擊
        if (c.target.types.includes('ROCK') && special(c.move) && c.move.functionCode !== '122') m.defense *= 1.5;
        break;
    }
    // NEW_CRITICAL_HIT_RATE_MECHANICS = MECHANICS_GENERATION >= 5
    if (c.critical) m.final *= this.gen >= 5 ? 1.5 : 2;
    m.final *= random / 100.0;
    if (c.user.types.includes(c.type)) m.final *= c.user.ability === 'ADAPTABILITY' ? 2 : 1.5;
    m.final *= c.typeMod / NORMAL_EFFECTIVE;
    // 根性時灼傷不減半
    if (c.user.status === 'BURN' && physical(c.move) && c.user.ability !== 'GUTS') m.final /= 2;
    // 反射壁、光牆、極光幕、變小：沒有移植
  }

  // pbCalcTypeMod / pbCalcTypeModSingle
  private typeMod(moveType: string, user: { ability: string | null }, target: Defender, weather: Weather | null): number {
    const mods = [NORMAL_EFFECTIVE_ONE, NORMAL_EFFECTIVE_ONE, NORMAL_EFFECTIVE_ONE];
    target.types.slice(0, 3).forEach((defType, i) => {
      let ret = this.effectivenessOne(moveType, defType);
      // 膽量：一般、格鬥招打得到幽靈
      if (user.ability === 'SCRAPPY' && defType === 'GHOST' && ret === INEFFECTIVE) ret = NORMAL_EFFECTIVE_ONE;
      // 德爾塔氣流：飛行的弱點變成普通
      if (weather === 'StrongWinds' && defType === 'FLYING' && ret === SUPER_EFFECTIVE_ONE) ret = NORMAL_EFFECTIVE_ONE;
      mods[i] = ret;
    });
    return mods[0]! * mods[1]! * mods[2]!;
  }

  // Effectiveness.calculate_one → GameData::Type#effectiveness
  private effectivenessOne(attackType: string, defendType: string): number {
    const t = this.typeChart.get(defendType);
    if (!t) return NORMAL_EFFECTIVE_ONE;
    if (t.weaknesses.has(attackType)) return SUPER_EFFECTIVE_ONE;
    if (t.resistances.has(attackType)) return NOT_VERY_EFFECTIVE_ONE;
    if (t.immunities.has(attackType)) return INEFFECTIVE;
    return NORMAL_EFFECTIVE_ONE;
  }

  private unmodeledParts(move: MoveInfo): string[] {
    const reviewed = REVIEWED_OVERRIDES[move.functionCode] ?? {};
    return move.overriddenMethods
      .filter((m) => m in DAMAGE_METHODS && !(m in reviewed))
      .map((m) => `效果代碼 ${move.functionCode} 改寫了 ${m}（${DAMAGE_METHODS[m]}），尚未移植`);
  }
}
