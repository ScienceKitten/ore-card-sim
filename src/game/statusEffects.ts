import type {
  BattleState,
  BattleStatusEffect,
  BattleUnit,
} from "../types/battle";
import type { SkillId } from "../types/common";
import type {
  ChargedAttackStatusParams,
  CounterBattleStatusEffect,
  CounterStatusParams,
  StatusEffectCategory,
  StatusEffectId,
  StatusEffectParams,
} from "../types/statusEffect";
import { statusEffectDefinitions } from "../data/statusEffects";
import { addSpecialGauge, updateBattleResult } from "./battleQueries";
import type { SkillCategory, SkillDefinition } from "../types/skill";

export function getStatusEffectName(id: StatusEffectId): string {
  return statusEffectDefinitions[id].name;
}

export function getDefaultStatusDuration(id: StatusEffectId): number {
  return statusEffectDefinitions[id].defaultDuration;
}

export function hasStatusEffect(
  unit: BattleUnit,
  statusEffectId: StatusEffectId,
): boolean {
  return unit.statusEffects.some((effect) => effect.id === statusEffectId);
}

export function canActByStatus(unit: BattleUnit): boolean {
  return !hasStatusEffect(unit, "paralysis");
}

export function getCannotActMessage(unit: BattleUnit): string | null {
  if (hasStatusEffect(unit, "paralysis")) {
    return `${unit.definition.name} は麻痺している。`;
  }

  return null;
}

export interface AddStatusEffectInput {
  target: BattleUnit;
  statusEffectId: StatusEffectId;
  duration?: number;
  params?: StatusEffectParams;
  sourceUnitInstanceId: string;
  sourceSkillId: SkillId;
  state: BattleState;
}

/**
 * 同じ状態異常がすでにある場合は、残りターン数が長い方を採用する。
 */
export function addStatusEffect(input: AddStatusEffectInput): void {
  const duration =
    input.duration ?? getDefaultStatusDuration(input.statusEffectId);

  const existing = input.target.statusEffects.find(
    (effect) => effect.id === input.statusEffectId,
  );

  if (existing) {
    const before = existing.remainingTurns;

    if (duration > existing.remainingTurns) {
      existing.remainingTurns = duration;
      existing.sourceUnitInstanceId = input.sourceUnitInstanceId;
      existing.sourceSkillId = input.sourceSkillId;
      existing.params = cloneStatusEffectParams(input.params);

      input.state.logs.unshift(
        `${input.target.definition.name} の${getStatusEffectName(input.statusEffectId)}の継続ターンが ${before} から ${duration} に更新された。`,
      );
    } else {
      input.state.logs.unshift(
        `${input.target.definition.name} はすでに${getStatusEffectName(input.statusEffectId)}になっている。`,
      );
    }

    return;
  }

  input.target.statusEffects.push({
    id: input.statusEffectId,
    remainingTurns: duration,
    sourceUnitInstanceId: input.sourceUnitInstanceId,
    sourceSkillId: input.sourceSkillId,
    params: cloneStatusEffectParams(input.params),
  });

  input.state.logs.unshift(
    `${input.target.definition.name} は${getStatusEffectName(input.statusEffectId)}になった。`,
  );
}

/**
 * 行動終了時の状態異常効果。
 * 麻痺で行動不能だった場合でも呼ぶ。
 */
export function applyActionEndStatusEffects(
  state: BattleState,
  unit: BattleUnit,
): void {
  if (unit.currentHp <= 0) {
    decrementStatusDurations(state, unit);
    return;
  }

  for (const statusEffect of unit.statusEffects) {
    switch (statusEffect.id) {
      case "poison":
        applyPoisonDamage(state, unit);
        break;

      case "paralysis":
        // 麻痺は行動開始時に処理するので、ここでは何もしない
        break;
    }

    if (unit.currentHp <= 0) {
      break;
    }
  }

  updateBattleResult(state);

  decrementStatusDurations(state, unit);
}

function applyPoisonDamage(state: BattleState, unit: BattleUnit): void {
  if (unit.currentHp <= 0) return;

  const beforeHp = unit.currentHp;
  const damage = Math.max(1, Math.floor(unit.currentHp * 0.1));

  unit.currentHp = Math.max(0, unit.currentHp - damage);

  state.logs.unshift(
    `${unit.definition.name} は毒で ${damage} ダメージを受けた。`,
  );

  const targetTeam = unit.side === "ally" ? state.allyTeam : state.enemyTeam;

  // 攻撃ではないが「ダメージを受けた」としてゲージを増やすならここで加算
  addSpecialGauge(targetTeam, 1);

  if (beforeHp > 0 && unit.currentHp === 0) {
    state.logs.unshift(`${unit.definition.name} は毒で倒れた。`);
    addSpecialGauge(targetTeam, 1);
  }
}

function decrementStatusDurations(state: BattleState, unit: BattleUnit): void {
  const expiredNames: string[] = [];

  for (const statusEffect of unit.statusEffects) {
    statusEffect.remainingTurns -= 1;
  }

  unit.statusEffects = unit.statusEffects.filter((statusEffect) => {
    if (statusEffect.remainingTurns <= 0) {
      expiredNames.push(getStatusEffectName(statusEffect.id));
      return false;
    }

    return true;
  });

  for (const name of expiredNames) {
    state.logs.unshift(`${unit.definition.name} の${name}が解けた。`);
  }
}

const sealedCategoryByStatusEffect: Partial<
  Record<StatusEffectId, SkillCategory>
> = {
  seal_physical: "physical",
  seal_magic: "magic",
  seal_breath: "breath",
  seal_change_reel: "change_reel",
};

export function getSealedSkillCategories(unit: BattleUnit): SkillCategory[] {
  return unit.statusEffects
    .map((statusEffect) => sealedCategoryByStatusEffect[statusEffect.id])
    .filter((category): category is SkillCategory => category !== undefined);
}

export function isSkillSealedByStatus(
  unit: BattleUnit,
  skill: SkillDefinition,
): boolean {
  const sealedCategories = getSealedSkillCategories(unit);

  return sealedCategories.includes(skill.category);
}

export function getSkillSealMessage(
  unit: BattleUnit,
  skill: SkillDefinition,
): string | null {
  if (!isSkillSealedByStatus(unit, skill)) {
    return null;
  }

  return `${skill.name}は封印されている。`;
}

export function getCounterStatusEffect(
  unit: BattleUnit,
): CounterBattleStatusEffect | null {
  const statusEffect = unit.statusEffects.find((effect) => {
    return effect.id === "counter" && effect.params?.type === "counter";
  });

  return (statusEffect as CounterBattleStatusEffect | undefined) ?? null;
}

export function consumeCounterCount(unit: BattleUnit): void {
  const counterStatus = getCounterStatusEffect(unit);

  if (!counterStatus) return;

  const params = counterStatus.params;
  const remainingCounterCount = getRemainingCounterCount(params);

  // null は回数無制限
  if (remainingCounterCount === null) {
    params.remainingCounterCount = null;
    return;
  }

  const nextCount = remainingCounterCount - 1;
  params.remainingCounterCount = nextCount;

  if (nextCount <= 0) {
    unit.statusEffects = unit.statusEffects.filter((effect) => {
      return effect !== counterStatus;
    });
  }
}

function cloneStatusEffectParams(
  params: StatusEffectParams | undefined,
): StatusEffectParams | undefined {
  if (!params) return undefined;

  switch (params.type) {
    case "counter":
      return cloneCounterStatusParams(params);

    case "charged_attack":
      return cloneChargedAttackStatusParams(params);
  }
}

function cloneCounterStatusParams(
  params: CounterStatusParams,
): CounterStatusParams {
  const maxCounterCount = params.maxCounterCount;

  return {
    type: "counter",
    requireDamage: params.requireDamage,
    canCounterOnDeath: params.canCounterOnDeath,
    nullifyCategories: [...params.nullifyCategories],
    counterCategories: [...params.counterCategories],
    maxCounterCount,
    remainingCounterCount:
      params.remainingCounterCount !== undefined
        ? params.remainingCounterCount
        : maxCounterCount,

    counterActionsToAttacker: params.counterActionsToAttacker.map((action) => ({
      ...action,
    })),
    counterActionsToSelf: params.counterActionsToSelf.map((action) => ({
      ...action,
    })),
  };
}

export function getRemainingCounterCount(
  params: CounterStatusParams,
): number | null {
  return params.remainingCounterCount !== undefined
    ? params.remainingCounterCount
    : params.maxCounterCount;
}

export function getStatusEffectCategory(
  id: StatusEffectId,
): StatusEffectCategory {
  return statusEffectDefinitions[id].category;
}

export interface RemoveStatusEffectCondition {
  statusEffectIds?: StatusEffectId[];
  categories?: StatusEffectCategory[];
  sourceSkillIds?: SkillId[];
}

function hasFilter<T>(items: T[] | undefined): items is T[] {
  return Array.isArray(items) && items.length > 0;
}

function matchesRemoveStatusEffectCondition(
  statusEffect: BattleStatusEffect,
  condition: RemoveStatusEffectCondition,
): boolean {
  if (
    hasFilter(condition.statusEffectIds) &&
    !condition.statusEffectIds.includes(statusEffect.id)
  ) {
    return false;
  }

  const category = getStatusEffectCategory(statusEffect.id);

  if (
    hasFilter(condition.categories) &&
    !condition.categories.includes(category)
  ) {
    return false;
  }

  if (
    hasFilter(condition.sourceSkillIds) &&
    !condition.sourceSkillIds.includes(statusEffect.sourceSkillId)
  ) {
    return false;
  }

  return true;
}

export function removeStatusEffectsByCondition(
  unit: BattleUnit,
  condition: RemoveStatusEffectCondition,
): BattleStatusEffect[] {
  const removed: BattleStatusEffect[] = [];

  unit.statusEffects = unit.statusEffects.filter((statusEffect) => {
    const shouldRemove = matchesRemoveStatusEffectCondition(
      statusEffect,
      condition,
    );

    if (shouldRemove) {
      removed.push(statusEffect);
      return false;
    }

    return true;
  });

  return removed;
}

export type ChargedAttackBattleStatusEffect = BattleStatusEffect & {
  id: "charged_attack";
  params: ChargedAttackStatusParams;
};

export function getChargedAttackStatusEffect(
  unit: BattleUnit,
): ChargedAttackBattleStatusEffect | null {
  const statusEffect = unit.statusEffects.find((effect) => {
    return (
      effect.id === "charged_attack" && effect.params?.type === "charged_attack"
    );
  });

  return (statusEffect as ChargedAttackBattleStatusEffect | undefined) ?? null;
}

export function removeStatusEffectInstance(
  unit: BattleUnit,
  statusEffect: BattleStatusEffect,
): void {
  unit.statusEffects = unit.statusEffects.filter((effect) => {
    return effect !== statusEffect;
  });
}

function cloneChargedAttackStatusParams(
  params: ChargedAttackStatusParams,
): ChargedAttackStatusParams {
  return {
    type: "charged_attack",
    skillId: params.skillId,
    canMoveWhileCharge: params.canMoveWhileCharge,
    cancelDamage: params.cancelDamage,
  };
}

export function cancelChargedAttackByDamage(
  state: BattleState,
  unit: BattleUnit,
  damage: number,
): void {
  const chargedStatus = getChargedAttackStatusEffect(unit);

  if (!chargedStatus) return;

  const cancelDamage = chargedStatus.params.cancelDamage ?? 0;

  if (cancelDamage <= 0) return;

  if (damage <= cancelDamage) return;

  removeStatusEffectInstance(unit, chargedStatus);

  state.logs.unshift(
    `${unit.definition.name} のチャージ攻撃はダメージにより解除された。`,
  );
}
