import type { SkillCategory, EffectAction } from "./skill";
import type { BattleStatusEffect } from "../types/battle";
import type { SkillId } from "./common";
``;

export type StatusEffectId =
  | "paralysis"
  | "poison"
  | "strong_poison"
  | "confusion"
  | "seal_physical"
  | "seal_magic"
  | "seal_breath"
  | "seal_change_reel"
  | "heal_block"
  | "frostbite"
  | "counter"
  | "charged_attack"
  | "damage_chain"
  | "blessing"
  | "curse"
  | "attack_change"
  | "speed_change";

export interface StatusEffectDefinition {
  id: StatusEffectId;
  name: string;

  /**
   * harmful: 不利な状態異常
   * benefit: 有利な状態変化
   * neutral: 有利不利どちらでもない状態
   * except: 特殊扱い。通常の解除対象から外したいものなど
   */
  category: StatusEffectCategory;

  /**
   * 実行効果側で継続ターン数を指定しない場合に使う。
   */
  defaultDuration: number;
}

export type StatusEffectParams =
  | CounterStatusParams
  | ChargedAttackStatusParams
  | FrostbiteStatusParams
  | DamageChainStatusParams
  | BlessingStatusParams
  | AppliedBlessingStatusParams
  | AttackChangeStatusParams
  | SpeedChangeStatusParams;

export interface CounterStatusParams {
  type: "counter";

  /**
   * true の場合、ダメージを含む技を受けたときだけ、
   * 無効化・反撃の対象になる。
   *
   * デフォルトは true として扱う予定。
   */
  requireDamage?: boolean;

  /**
   * true の場合、カウンターユニットのHPが0になっていても反撃できる。
   *
   * デフォルトは false。
   */
  canCounterOnDeath?: boolean;

  /**
   * 無効化する技カテゴリ。
   *
   * 例:
   * ['physical', 'magic']
   */
  nullifyCategories: SkillCategory[];

  /**
   * 反撃する技カテゴリ。
   *
   * 例:
   * ['physical']
   */
  counterCategories: SkillCategory[];

  /**
   * 反撃できる最大回数。
   *
   * null の場合は回数制限なし。
   */
  maxCounterCount: number | null;

  /**
   * 戦闘中に残っている反撃回数。
   *
   * 状態異常付与時に maxCounterCount と同じ値で初期化する想定。
   * null の場合は回数制限なし。
   */
  remainingCounterCount?: number | null;

  /**
   * 攻撃者に対して実行する反撃効果。
   */
  counterActionsToAttacker: EffectAction[];

  /**
   * カウンターユニット自身に対して実行する反撃効果。
   */
  counterActionsToSelf: EffectAction[];
}

export interface ChargedAttackStatusParams {
  type: "charged_attack";

  /**
   * チャージ完了時に自動使用する技ID。
   */
  skillId: SkillId;

  /**
   * trueなら、チャージ中でも通常行動できる。
   * false または未指定なら、残り2ターン以上の間は行動できない。
   */
  canMoveWhileCharge?: boolean;

  /**
   * 1回の damage 実行でこの数値を超えるダメージを受けた場合、
   * チャージ状態を解除する。
   *
   * 未指定または0以下なら、ダメージ解除は発生しない。
   */
  cancelDamage?: number;
}

export type CounterBattleStatusEffect = BattleStatusEffect & {
  id: "counter";
  params: CounterStatusParams;
};

export interface FrostbiteStatusParams {
  type: "frostbite";

  /**
   * 凍傷レベル。
   *
   * 1～3の整数。
   * 未指定時は1。
   */
  level?: number;

  /**
   * 凍傷の対象となる技リール枠。
   *
   * 0～5の整数を格納する。
   * 技データでは指定せず、状態異常付与時に生成する。
   */
  freezingReelNums?: number[];
}

export interface DamageChainStatusParams {
  type: "damage_chain";

  /**
   * 元の計算ダメージに乗算する倍率。
   *
   * 例:
   * 0.5 = 元ダメージの50%
   * 1   = 元ダメージと同じ
   */
  multiplier: number;
}

export type BlessingStatusParams =
  | {
      type: "blessing";

      /**
       * 毎回の回復量を直接指定する。
       */
      healAmount: number;

      attackMultiplier?: never;
    }
  | {
      type: "blessing";

      /**
       * 付与者の戦闘中攻撃力に乗算する。
       *
       * 例:
       * 0.5 = 攻撃力の50%
       */
      attackMultiplier: number;

      healAmount?: never;
    };

export interface AppliedBlessingStatusParams {
  type: "blessing";
  healAmount: number;
}

export type BlessingBattleStatusEffect = BattleStatusEffect & {
  id: "blessing";
  params: {
    type: "blessing";
    healAmount: number;
  };
};

/**
 * 能力変化の重複方式。
 *
 * same_skill:
 *   同じ能力変化IDかつ同じ付与元技IDなら、
 *   既存インスタンスを更新する。
 *
 * always_stack:
 *   付与元技IDを問わず、必ず別インスタンスとして追加する。
 */
export type StatChangeStackingMode = "same_skill" | "always_stack";

/**
 * 攻撃変化・素早さ変化で指定する演算。
 *
 * flat:
 *   現在値へvalueを加算する。
 *
 * multiplier:
 *   現在値へvalueを乗算する。
 */
export type StatChangeOperation =
  | {
      kind: "flat";
      value: number;
    }
  | {
      kind: "multiplier";
      value: number;
    };

export interface AttackChangeStatusParams {
  type: "attack_change";
  change: StatChangeOperation;
  /**
   * 未指定時はsame_skill。
   */
  stackingMode?: StatChangeStackingMode;
}

export interface SpeedChangeStatusParams {
  type: "speed_change";
  change: StatChangeOperation;
  /**
   * 未指定時はsame_skill。
   */
  stackingMode?: StatChangeStackingMode;
}

export type StatChangeStatusParams =
  | AttackChangeStatusParams
  | SpeedChangeStatusParams;

export type AttackChangeBattleStatusEffect = BattleStatusEffect & {
  id: "attack_change";
  params: AttackChangeStatusParams;
};

export type SpeedChangeBattleStatusEffect = BattleStatusEffect & {
  id: "speed_change";
  params: SpeedChangeStatusParams;
};

export type StatChangeBattleStatusEffect =
  | AttackChangeBattleStatusEffect
  | SpeedChangeBattleStatusEffect;

export type StatusEffectCategory = "harmful" | "benefit" | "neutral" | "except";
