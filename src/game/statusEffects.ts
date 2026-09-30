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
  DamageChainStatusParams,
  FrostbiteStatusParams,
  StatusEffectCategory,
  StatusEffectId,
  StatusEffectParams,
} from "../types/statusEffect";
import { statusEffectDefinitions } from "../data/statusEffects";
import { addSpecialGauge, updateBattleResult } from "./battleQueries";
import type { SkillCategory, SkillDefinition } from "../types/skill";
import type { TargetingMode } from "../types/skillExecution";
import {
  applyBattleDamage,
  createDamageResolutionState,
  finalizePendingDefeats,
} from "./battleDamage";
import { applyHealing } from "./healing";

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

export function isConfused(unit: BattleUnit): boolean {
  return hasStatusEffect(unit, "confusion");
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

  /**
   * この付与で適用する状態異常分類。
   *
   * 未指定の場合は定義側の分類を使う。
   */
  category?: StatusEffectCategory;

  params?: StatusEffectParams;
  sourceUnitInstanceId: string;
  sourceSkillId: SkillId;
  state: BattleState;
}

/**
 * 同じ状態異常がすでにある場合は、残りターン数が長い方を採用する。
 */
export function addStatusEffect(input: AddStatusEffectInput): void {
  const canApplyStatusEffect = resolveIncompatibleStatusEffects(input);

  if (!canApplyStatusEffect) {
    return;
  }

  if (input.statusEffectId === "frostbite") {
    addFrostbiteStatusEffect(input);

    return;
  }

  const duration =
    input.duration ?? getDefaultStatusDuration(input.statusEffectId);

  const category = resolveAppliedStatusEffectCategory(
    input.statusEffectId,
    input.category,
  );

  const existing = input.target.statusEffects.find((effect) => {
    return effect.id === input.statusEffectId;
  });

  if (existing) {
    const before = existing.remainingTurns;

    if (duration > existing.remainingTurns) {
      existing.remainingTurns = duration;

      existing.sourceUnitInstanceId = input.sourceUnitInstanceId;

      existing.sourceSkillId = input.sourceSkillId;

      /**
       * 継続ターンが更新される場合は、
       * 新しく付与した技の分類も反映する。
       */
      existing.category = category;

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
    category,
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
  if (unit.currentHp <= 0) {
    return;
  }

  /**
   * 毒の効果量。
   *
   * 通常種族:
   *   現在HPの10%ダメージ
   *
   * アンデッド:
   *   現在HPの10%回復
   */
  const amount = Math.max(1, Math.floor(unit.currentHp * 0.1));

  /**
   * アンデッドは毒ダメージを受けず、
   * 代わりに同じ数値だけ回復する。
   */
  if (unit.definition.species === "undead") {
    applyPoisonHealing(state, unit, amount);

    return;
  }

  applyPoisonDirectDamage(state, unit, amount);
}
function applyPoisonDirectDamage(
  state: BattleState,
  unit: BattleUnit,
  damage: number,
): void {
  const damageResolution = createDamageResolutionState(state);

  applyBattleDamage({
    state,
    target: unit,
    amount: damage,

    /**
     * 毒は状態異常による直接ダメージ。
     *
     * 技ダメージではないため、
     * ダメージチェーンは発動しない。
     */
    origin: {
      type: "direct",
      source: "status_effect",
    },

    damageResolution,

    /**
     * 毒ダメージでは必殺技ゲージを増加させない。
     *
     * 毒で戦闘不能になった場合の
     * 撃破時ゲージも増加しない。
     */
    grantsSpecialGauge: false,

    damageMessage: (appliedDamage) => {
      return `${unit.definition.name} は毒で ${appliedDamage} ダメージを受けた。`;
    },
  });

  /**
   * 毒は単発の直接効果なので、
   * ダメージ適用後すぐに死亡を確定する。
   */
  finalizePendingDefeats(state, damageResolution);
}

function applyPoisonHealing(
  state: BattleState,
  unit: BattleUnit,
  amount: number,
): void {
  const healingResult = applyHealing({
    state,

    /**
     * 毒による自己回復なので、
     * 回復者と対象は同じユニットとする。
     */
    healer: unit,
    target: unit,
    amount,

    /**
     * 技ではなく状態異常による回復。
     */
    sourceType: "status_effect",
  });

  if (healingResult.invalidTarget) {
    return;
  }

  /**
   * 回復無効状態なら、毒による回復も無効。
   */
  if (healingResult.blocked) {
    state.logs.unshift(
      `${unit.definition.name} は回復無効により毒の効果でHPを回復できなかった。`,
    );

    return;
  }

  if (healingResult.actualAmount <= 0) {
    state.logs.unshift(
      `${unit.definition.name} は毒の効果を受けたが、HPは回復しなかった。`,
    );

    return;
  }

  state.logs.unshift(
    `${unit.definition.name} は毒の効果でHPが ${healingResult.actualAmount} 回復した。`,
  );
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

    case "frostbite":
      return cloneFrostbiteStatusParams(params);

    case "damage_chain":
      return cloneDamageChainStatusParams(params);
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

  const category = getAppliedStatusEffectCategory(statusEffect);

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

/**
 * 技実行開始時の対象選択モードを、
 * 使用者の現在の状態異常から決定する。
 *
 * 状態異常の具体的な判定をexecuteSkill.tsへ
 * 直接書かないための窓口。
 */
export function getTargetingModeByStatus(unit: BattleUnit): TargetingMode {
  if (hasStatusEffect(unit, "confusion")) {
    return "reverse_team";
  }

  return "normal";
}

/**
 * 新しい状態異常を付与する前に、
 * 同時に存在できない状態異常を処理する。
 *
 * 戻り値:
 * true:
 *   新しい状態異常の付与処理を続ける
 *
 * false:
 *   新しい状態異常を付与せず終了する
 */
function resolveIncompatibleStatusEffects(
  input: AddStatusEffectInput,
): boolean {
  const target = input.target;

  /**
   * 混乱を付与するとき、
   * すでに持っているチャージ攻撃状態を解除する。
   */
  if (input.statusEffectId === "confusion") {
    const chargedAttackEffects = target.statusEffects.filter((statusEffect) => {
      return statusEffect.id === "charged_attack";
    });

    if (chargedAttackEffects.length > 0) {
      target.statusEffects = target.statusEffects.filter((statusEffect) => {
        return statusEffect.id !== "charged_attack";
      });

      input.state.logs.unshift(
        `${target.definition.name} のチャージ攻撃は混乱により解除された。`,
      );
    }

    return true;
  }

  /**
   * 混乱中にチャージ攻撃状態を付与しようとしても、
   * チャージ攻撃状態は残らない。
   */
  if (
    input.statusEffectId === "charged_attack" &&
    hasStatusEffect(target, "confusion")
  ) {
    input.state.logs.unshift(
      `${target.definition.name} は混乱しているためチャージ攻撃状態になれなかった。`,
    );

    return false;
  }

  return true;
}

export type FrostbiteBattleStatusEffect = BattleStatusEffect & {
  id: "frostbite";
  params: FrostbiteStatusParams & {
    level: number;
    freezingReelNums: number[];
  };
};

export function getFrostbiteStatusEffect(
  unit: BattleUnit,
): FrostbiteBattleStatusEffect | null {
  const statusEffect = unit.statusEffects.find((effect) => {
    return effect.id === "frostbite" && effect.params?.type === "frostbite";
  });

  return (statusEffect as FrostbiteBattleStatusEffect | undefined) ?? null;
}

function normalizeFrostbiteLevel(level: number | undefined): number {
  const integerLevel = Math.trunc(level ?? 1);

  return Math.min(3, Math.max(1, integerLevel));
}

function createFreezingReelNums(level: number): number[] {
  const reelSlotIndexes = [0, 1, 2, 3, 4, 5];

  /**
   * Fisher-Yates方式でシャッフルする。
   */
  for (let index = reelSlotIndexes.length - 1; index > 0; index--) {
    const randomIndex = Math.floor(Math.random() * (index + 1));

    [reelSlotIndexes[index], reelSlotIndexes[randomIndex]] = [
      reelSlotIndexes[randomIndex],
      reelSlotIndexes[index],
    ];
  }

  return reelSlotIndexes.slice(0, level * 2).sort((a, b) => a - b);
}

function cloneFrostbiteStatusParams(
  params: FrostbiteStatusParams,
): FrostbiteStatusParams {
  const level = normalizeFrostbiteLevel(params.level);

  return {
    type: "frostbite",
    level,
    freezingReelNums: params.freezingReelNums
      ? [...params.freezingReelNums]
      : createFreezingReelNums(level),
  };
}

function addFrostbiteStatusEffect(input: AddStatusEffectInput): void {
  const duration = input.duration ?? getDefaultStatusDuration("frostbite");

  const category = resolveAppliedStatusEffectCategory(
    "frostbite",
    input.category,
  );

  const incomingParams =
    input.params?.type === "frostbite" ? input.params : undefined;

  const incomingLevel = normalizeFrostbiteLevel(incomingParams?.level);

  const existing = getFrostbiteStatusEffect(input.target);

  if (!existing) {
    const freezingReelNums = createFreezingReelNums(incomingLevel);

    input.target.statusEffects.push({
      id: "frostbite",
      remainingTurns: duration,
      sourceUnitInstanceId: input.sourceUnitInstanceId,
      sourceSkillId: input.sourceSkillId,
      category,
      params: {
        type: "frostbite",
        level: incomingLevel,
        freezingReelNums,
      },
    });

    input.state.logs.unshift(
      `${input.target.definition.name} はレベル${incomingLevel}の凍傷になった。`,
    );

    return;
  }

  const beforeLevel = existing.params.level;

  const nextLevel = Math.min(3, beforeLevel + incomingLevel);

  const beforeDuration = existing.remainingTurns;

  const nextDuration = Math.max(existing.remainingTurns, duration);

  const nextFreezingReelNums = createFreezingReelNums(nextLevel);

  existing.remainingTurns = nextDuration;

  existing.sourceUnitInstanceId = input.sourceUnitInstanceId;

  existing.sourceSkillId = input.sourceSkillId;

  /**
   * 凍傷は再付与が必ず有効なので、
   * 新しく付与された分類へ更新する。
   */
  existing.category = category;

  existing.params = {
    type: "frostbite",
    level: nextLevel,
    freezingReelNums: nextFreezingReelNums,
  };

  input.state.logs.unshift(
    `${input.target.definition.name} の凍傷がレベル${beforeLevel}からレベル${nextLevel}に強化された。`,
  );

  if (beforeDuration !== nextDuration) {
    input.state.logs.unshift(
      `${input.target.definition.name} の凍傷の継続ターンが ${beforeDuration} から ${nextDuration} に更新された。`,
    );
  }
}

export function resolveFrostbiteOnReelSelection(
  state: BattleState,
  unit: BattleUnit,
  slotIndex: number,
): boolean {
  const frostbite = getFrostbiteStatusEffect(unit);

  if (!frostbite) {
    return false;
  }

  const isFrozenSlot = frostbite.params.freezingReelNums.includes(slotIndex);

  if (!isFrozenSlot) {
    return false;
  }

  const level = frostbite.params.level;

  const damage = Math.max(1, Math.floor(unit.maxHp * 0.2 * level));

  const damageResolution = createDamageResolutionState(state);

  applyBattleDamage({
    state,
    target: unit,
    amount: damage,

    origin: {
      type: "direct",
      source: "status_effect",
    },

    damageResolution,

    grantsSpecialGauge: false,

    damageMessage: null,
  });

  removeStatusEffectInstance(unit, frostbite);

  state.logs.unshift(
    `${unit.definition.name} は凍傷で行動に失敗し、${damage}ダメージを受けた。`,
  );

  finalizePendingDefeats(state, damageResolution);

  return true;
}

export function getDefaultStatusEffectCategory(
  id: StatusEffectId,
): StatusEffectCategory {
  return statusEffectDefinitions[id].category;
}

/**
 * 状態異常付与時に使う最終的な分類を決定する。
 *
 * 技側のcategoryが指定されていればそれを優先し、
 * 未指定なら状態異常定義側のcategoryを使う。
 */
function resolveAppliedStatusEffectCategory(
  statusEffectId: StatusEffectId,
  category: StatusEffectCategory | undefined,
): StatusEffectCategory {
  return category ?? getDefaultStatusEffectCategory(statusEffectId);
}

/**
 * 戦闘中の状態異常に実際に適用されている分類を返す。
 *
 * categoryが保存されていない古いデータでは、
 * 状態異常定義側の分類へフォールバックする。
 */
export function getAppliedStatusEffectCategory(
  statusEffect: BattleStatusEffect,
): StatusEffectCategory {
  return (
    statusEffect.category ?? getDefaultStatusEffectCategory(statusEffect.id)
  );
}

function cloneDamageChainStatusParams(
  params: DamageChainStatusParams,
): DamageChainStatusParams {
  return {
    type: "damage_chain",
    multiplier: params.multiplier,
  };
}
