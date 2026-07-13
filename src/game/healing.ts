import type { BattleState, BattleUnit } from "../types/battle";
import type { SkillDefinition } from "../types/skill";
import { hasStatusEffect } from "./statusEffects";

/**
 * 回復がどの処理から発生したか。
 *
 * 将来、回復方法ごとに倍率を変えたい場合に使用できる。
 */
export type HealingSourceType = "skill" | "drain" | "status_effect" | "other";

export interface ApplyHealingInput {
  state: BattleState;

  /**
   * 回復効果を発生させたユニット。
   *
   * 毎ターンの自動回復など、
   * 回復者が存在しない場合はnullにできる。
   */
  healer: BattleUnit | null;

  /**
   * 回復を受けるユニット。
   */
  target: BattleUnit;

  /**
   * 各種補正前の回復量。
   */
  amount: number;

  /**
   * 回復の発生源。
   */
  sourceType: HealingSourceType;

  /**
   * 技による回復の場合の技情報。
   */
  skill?: SkillDefinition;
}

export interface AppliedHealingResult {
  target: BattleUnit;

  /**
   * 呼び出し側から渡された回復量。
   */
  requestedAmount: number;

  /**
   * 状態異常や補正を適用した後の回復量。
   *
   * 現時点ではrequestedAmountと同じだが、
   * 将来の回復強化・回復弱体化に使用する。
   */
  calculatedAmount: number;

  /**
   * 最大HPを考慮して実際に回復した量。
   */
  actualAmount: number;

  beforeHp: number;
  afterHp: number;

  /**
   * 回復無効によって阻止されたか。
   */
  blocked: boolean;

  /**
   * 戦闘不能などにより回復対象外だったか。
   */
  invalidTarget: boolean;
}

/**
 * 各種回復補正を計算する。
 *
 * 今後、
 * ・回復者の味方回復量強化
 * ・対象の被回復量増加
 * ・フィールドによる回復倍率
 * などをここへ追加する。
 */
function calculateHealingAmount(input: ApplyHealingInput): number {
  let amount = Math.max(0, Math.floor(input.amount));

  /*
   * 将来の例:
   *
   * if (
   *   input.healer &&
   *   hasStatusEffect(
   *     input.healer,
   *     "healing_power_up",
   *   )
   * ) {
   *   amount = Math.floor(
   *     amount * 1.5,
   *   );
   * }
   */

  return amount;
}

/**
 * HP回復を実行する共通処理。
 *
 * 通常回復、ドレイン、毎ターン回復など、
 * すべての回復はこの関数を経由させる。
 */
export function applyHealing(input: ApplyHealingInput): AppliedHealingResult {
  const beforeHp = input.target.currentHp;

  const requestedAmount = Math.max(0, Math.floor(input.amount));

  /**
   * 現在は戦闘不能ユニットを回復できない。
   * 蘇生は別の実行効果として扱う想定。
   */
  if (input.target.currentHp <= 0) {
    return {
      target: input.target,
      requestedAmount,
      calculatedAmount: 0,
      actualAmount: 0,
      beforeHp,
      afterHp: input.target.currentHp,
      blocked: false,
      invalidTarget: true,
    };
  }

  /**
   * 回復無効の判定はすべてここへ集約する。
   */
  if (hasStatusEffect(input.target, "heal_block")) {
    return {
      target: input.target,
      requestedAmount,
      calculatedAmount: 0,
      actualAmount: 0,
      beforeHp,
      afterHp: input.target.currentHp,
      blocked: true,
      invalidTarget: false,
    };
  }

  const calculatedAmount = calculateHealingAmount(input);

  input.target.currentHp = Math.min(
    input.target.maxHp,
    input.target.currentHp + calculatedAmount,
  );

  const actualAmount = input.target.currentHp - beforeHp;

  return {
    target: input.target,
    requestedAmount,
    calculatedAmount,
    actualAmount,
    beforeHp,
    afterHp: input.target.currentHp,
    blocked: false,
    invalidTarget: false,
  };
}
