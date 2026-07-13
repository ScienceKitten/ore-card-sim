import type { SkillCategory, EffectAction } from "./skill";
import type { BattleStatusEffect } from "../types/battle";
import type { SkillId } from "./common";
``;

export type StatusEffectId =
  | "paralysis"
  | "poison"
  | "confusion"
  | "seal_physical"
  | "seal_magic"
  | "seal_breath"
  | "seal_change_reel"
  | "counter"
  | "charged_attack";

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
  | ChargedAttackStatusParams;

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

export type StatusEffectCategory = "harmful" | "benefit" | "neutral" | "except";
