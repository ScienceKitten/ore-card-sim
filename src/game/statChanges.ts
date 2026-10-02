import type { BattleStatusEffect, BattleUnit } from "../types/battle";
import type {
  StatChangeOperation,
  StatChangeStatusParams,
} from "../types/statusEffect";

/**
 * BattleStatusEffectが、有効な能力変化状態異常かを判定する。
 */
export function isStatChangeStatusEffect(
  statusEffect: BattleStatusEffect,
): statusEffect is BattleStatusEffect & {
  id: "attack_change" | "speed_change";
  params: StatChangeStatusParams;
} {
  if (
    statusEffect.id !== "attack_change" &&
    statusEffect.id !== "speed_change"
  ) {
    return false;
  }

  if (!statusEffect.params) {
    return false;
  }

  return (
    statusEffect.params.type === statusEffect.id &&
    Number.isFinite(statusEffect.params.change.value)
  );
}

/**
 * 1件の能力変化を現在値へ適用する。
 *
 * 各状態異常の適用直後に、Math.trunc()によって
 * 小数部分を0方向へ切り捨てる。
 *
 * この時点では最低0への制限を行わない。
 * 負数になった後、後続の負倍率などによって
 * 正数へ戻ることを許可するため。
 */
function applyStatChangeOperation(
  currentValue: number,
  operation: StatChangeOperation,
): number {
  if (operation.kind === "flat") {
    return Math.trunc(currentValue + operation.value);
  }

  return Math.trunc(currentValue * operation.value);
}

/**
 * 基準値へ、指定された種類の能力変化を
 * 状態異常配列の格納順に適用する。
 *
 * statusEffectsはpush順を維持するため、
 * 通常は付与された順番と一致する。
 */
function calculateEffectiveStat(
  unit: BattleUnit,
  statusEffectId: "attack_change" | "speed_change",
  baseValue: number,
): number {
  let value = baseValue;

  for (const statusEffect of unit.statusEffects) {
    if (statusEffect.id !== statusEffectId) {
      continue;
    }

    if (!isStatChangeStatusEffect(statusEffect)) {
      continue;
    }

    value = applyStatChangeOperation(value, statusEffect.params.change);
  }

  /**
   * 最低値制限は、すべての能力変化を
   * 適用し終えた後にだけ行う。
   */
  return Math.max(0, value);
}

/**
 * 状態異常適用後の実効攻撃力。
 *
 * unit.attack自体は、ユニット基本値、
 * チームボーナス、アイテム補正を含む
 * 基準攻撃力として維持する。
 */
export function getEffectiveAttack(unit: BattleUnit): number {
  return calculateEffectiveStat(unit, "attack_change", unit.attack);
}

/**
 * 状態異常適用後の実効素早さ。
 *
 * unit.speed自体は、ユニット基本値、
 * チームボーナス、アイテム補正を含む
 * 基準素早さとして維持する。
 */
export function getEffectiveSpeed(unit: BattleUnit): number {
  return calculateEffectiveStat(unit, "speed_change", unit.speed);
}

/**
 * 戦闘画面で能力変化量を表示する。
 *
 * 例:
 * +10
 * -5
 * ×2
 * ×0.5
 * ×-1
 */
export function formatStatChangeValue(operation: StatChangeOperation): string {
  if (operation.kind === "flat") {
    return operation.value >= 0 ? `+${operation.value}` : `${operation.value}`;
  }

  return `×${operation.value}`;
}

/**
 * 通常の状態異常には空文字を返し、
 * 攻撃変化・素早さ変化だけ変化量を返す。
 */
export function getStatusEffectValueText(
  statusEffect: BattleStatusEffect,
): string {
  if (!isStatChangeStatusEffect(statusEffect)) {
    return "";
  }

  return formatStatChangeValue(statusEffect.params.change);
}
