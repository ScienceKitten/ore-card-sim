import type {
  BattleState,
  BattleStatusEffect,
  BattleUnit,
} from "../types/battle";
import type { SkillId } from "../types/common";
import type {
  BlessingBattleStatusEffect,
  BlessingStatusParams,
  ChargedAttackStatusParams,
  CounterBattleStatusEffect,
  CounterStatusParams,
  DamageChainStatusParams,
  FrostbiteStatusParams,
  StatChangeStatusParams,
  StatusEffectCategory,
  StatusEffectId,
  StatusEffectParams,
} from "../types/statusEffect";
import { statusEffectDefinitions } from "../data/statusEffects";
import { getBattleUnitByInstanceId, updateBattleResult } from "./battleQueries";
import type { SkillCategory, SkillDefinition } from "../types/skill";
import type { TargetingMode } from "../types/skillExecution";
import {
  applyBattleDamage,
  createDamageResolutionState,
  finalizePendingDefeats,
} from "./battleDamage";
import { applyHealing } from "./healing";
import { getEffectiveAttack } from "./statChanges";

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
  /**
   * 加護をアンデッドへ付与する場合、
   * 継続2ターンの呪いへ変換する。
   *
   * 変換後の呪いには再度種族変換を適用しない。
   */
  if (
    input.statusEffectId === "blessing" &&
    input.target.definition.species === "undead"
  ) {
    addCurseStatusEffect({
      ...input,
      statusEffectId: "curse",
      duration: 2,
      category: undefined,
      params: undefined,
    });
    input.state.logs.unshift(
      `${input.target.definition.name} はアンデッドのため、加護が呪いに変化した。`,
    );
    return;
  }
  /**
   * 呪いをアンデッドへ付与する場合、
   * 対象自身の攻撃力50%の加護へ変換する。
   *
   * 変換後の加護には再度種族変換を適用しない。
   */
  if (
    input.statusEffectId === "curse" &&
    input.target.definition.species === "undead"
  ) {
    const healAmount = Math.max(
      0,
      Math.floor(getEffectiveAttack(input.target) * 0.5),
    );
    addBlessingStatusEffect({
      ...input,
      statusEffectId: "blessing",
      /**
       * 変換後の加護はデフォルト99ターン。
       */
      duration: getDefaultStatusDuration("blessing"),
      /**
       * 変換後は加護のデフォルト分類benefit。
       */
      category: undefined,
      params: {
        type: "blessing",
        healAmount,
      },
    });
    input.state.logs.unshift(
      `${input.target.definition.name} はアンデッドのため、呪いが加護に変化した。`,
    );
    return;
  }
  const canApplyStatusEffect = resolveIncompatibleStatusEffects(input);
  if (!canApplyStatusEffect) {
    return;
  }
  if (input.statusEffectId === "blessing") {
    addBlessingStatusEffect(input);
    return;
  }
  if (input.statusEffectId === "curse") {
    addCurseStatusEffect(input);
    return;
  }
  if (input.statusEffectId === "frostbite") {
    addFrostbiteStatusEffect(input);
    return;
  }

  if (
    input.statusEffectId === "attack_change" ||
    input.statusEffectId === "speed_change"
  ) {
    addStatChangeStatusEffect(input);
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

  /**
   * 1. 加護を最初に処理する。
   */
  applyBlessingAtActionEnd(state, unit);

  /**
   * 2. 毒・猛毒を処理する。
   */
  if (unit.currentHp > 0) {
    applyPoisonStatusAtActionEnd(state, unit);
  }

  /**
   * 3. ほかの行動終了時効果があればここで処理。
   */

  /**
   * 4. 継続ターンを減らし、
   *    呪いの期限切れを処理する。
   */
  decrementStatusDurations(state, unit);

  updateBattleResult(state);
}

function applyPoisonLikeEffect(
  state: BattleState,
  unit: BattleUnit,
  hpRate: number,
  statusName: string,
): void {
  if (unit.currentHp <= 0) {
    return;
  }

  const amount = Math.max(1, Math.floor(unit.currentHp * hpRate));

  /*
   * アンデッドは毒・猛毒でダメージを受けず、
   * 同じ量だけ回復する。
   */
  if (unit.definition.species === "undead") {
    applyPoisonLikeHealing(state, unit, amount, statusName);

    return;
  }

  applyPoisonLikeDamage(state, unit, amount, statusName);
}

function applyPoisonLikeDamage(
  state: BattleState,
  unit: BattleUnit,
  amount: number,
  statusName: string,
): void {
  const damageResolution = createDamageResolutionState(state);

  applyBattleDamage({
    state,
    target: unit,
    amount,

    origin: {
      type: "direct",
      source: "status_effect",
    },

    damageResolution,

    /*
     * 毒・猛毒では被ダメージゲージも
     * 撃破時ゲージも増やさない。
     */
    grantsSpecialGauge: false,

    damageMessage: (damage) => {
      return `${unit.definition.name} は${statusName}で ${damage} ダメージを受けた。`;
    },
  });

  finalizePendingDefeats(state, damageResolution);
}

function applyPoisonLikeHealing(
  state: BattleState,
  unit: BattleUnit,
  amount: number,
  statusName: string,
): void {
  const healingResult = applyHealing({
    state,
    healer: unit,
    target: unit,
    amount,
    sourceType: "status_effect",
  });

  if (healingResult.invalidTarget) {
    return;
  }

  if (healingResult.blocked) {
    state.logs.unshift(
      `${unit.definition.name} は回復無効により${statusName}の効果でHPを回復できなかった。`,
    );

    return;
  }

  if (healingResult.actualAmount <= 0) {
    state.logs.unshift(
      `${unit.definition.name} は${statusName}の効果を受けたが、HPは回復しなかった。`,
    );

    return;
  }

  state.logs.unshift(
    `${unit.definition.name} は${statusName}の効果でHPが ${healingResult.actualAmount} 回復した。`,
  );
}

function decrementStatusDurations(state: BattleState, unit: BattleUnit): void {
  const expiredNames: string[] = [];

  let curseExpired = false;

  for (const statusEffect of unit.statusEffects) {
    statusEffect.remainingTurns -= 1;

    if (statusEffect.id === "curse" && statusEffect.remainingTurns <= 0) {
      curseExpired = true;
    }
  }

  unit.statusEffects = unit.statusEffects.filter((statusEffect) => {
    if (statusEffect.remainingTurns > 0) {
      return true;
    }

    /**
     * 呪いは専用ログを出すため、
     * 通常の解除ログには含めない。
     */
    if (statusEffect.id !== "curse") {
      expiredNames.push(getStatusEffectName(statusEffect.id));
    }

    return false;
  });

  for (const name of expiredNames) {
    state.logs.unshift(`${unit.definition.name} の${name}が解けた。`);
  }

  /**
   * 呪いはダメージではなく即死。
   *
   * ゲージ増加、チャージ解除、
   * ダメージチェーンなどは発生しない。
   */
  if (curseExpired && unit.currentHp > 0) {
    unit.currentHp = 0;

    state.logs.unshift(`${unit.definition.name} は呪いにより命を失った。`);
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

    case "blessing":
      return cloneBlessingStatusParams(params);

    case "attack_change":
    case "speed_change":
      return cloneStatChangeStatusParams(params);
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

  /*
   * 既存の混乱・チャージ攻撃の排他処理
   */
  if (input.statusEffectId === "confusion") {
    const hasChargedAttack = target.statusEffects.some((statusEffect) => {
      return statusEffect.id === "charged_attack";
    });

    if (hasChargedAttack) {
      target.statusEffects = target.statusEffects.filter((statusEffect) => {
        return statusEffect.id !== "charged_attack";
      });

      input.state.logs.unshift(
        `${target.definition.name} のチャージ攻撃は混乱により解除された。`,
      );
    }

    return true;
  }

  if (
    input.statusEffectId === "charged_attack" &&
    hasStatusEffect(target, "confusion")
  ) {
    input.state.logs.unshift(
      `${target.definition.name} は混乱しているためチャージ攻撃状態になれなかった。`,
    );

    return false;
  }

  /*
   * 猛毒を付与するときは、既存の毒を解除する。
   */
  if (input.statusEffectId === "strong_poison") {
    const hadPoison = hasStatusEffect(target, "poison");

    if (hadPoison) {
      target.statusEffects = target.statusEffects.filter((statusEffect) => {
        return statusEffect.id !== "poison";
      });

      input.state.logs.unshift(
        `${target.definition.name} の毒が猛毒に上書きされた。`,
      );
    }

    return true;
  }

  /*
   * 猛毒を持つユニットには、
   * 通常の毒を付与できない。
   */
  if (
    input.statusEffectId === "poison" &&
    hasStatusEffect(target, "strong_poison")
  ) {
    input.state.logs.unshift(
      `${target.definition.name} は猛毒状態のため、毒にはならなかった。`,
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

function isBlessingStatusEffect(
  statusEffect: BattleStatusEffect,
): statusEffect is BlessingBattleStatusEffect {
  return (
    statusEffect.id === "blessing" &&
    statusEffect.params?.type === "blessing" &&
    typeof statusEffect.params.healAmount === "number"
  );
}

export function getBlessingStatusEffect(
  unit: BattleUnit,
): BlessingBattleStatusEffect | null {
  return unit.statusEffects.find(isBlessingStatusEffect) ?? null;
}

function cloneBlessingStatusParams(
  params: BlessingStatusParams,
): BlessingStatusParams {
  if (params.healAmount !== undefined) {
    return {
      type: "blessing",
      healAmount: params.healAmount,
    };
  }

  return {
    type: "blessing",
    attackMultiplier: params.attackMultiplier,
  };
}

function resolveBlessingHealAmount(input: AddStatusEffectInput): number | null {
  const params = input.params?.type === "blessing" ? input.params : undefined;

  if (!params) {
    input.state.logs.unshift(
      `${input.target.definition.name} への加護付与に必要な回復量が設定されていません。`,
    );

    return null;
  }

  /**
   * 固定回復量。
   */
  if (params.healAmount !== undefined) {
    return Math.max(0, Math.floor(params.healAmount));
  }

  /**
   * アイテム由来では倍率指定を禁止する。
   */
  if (input.sourceSkillId.startsWith("item:")) {
    input.state.logs.unshift(
      "アイテムによる加護にはattackMultiplierを指定できません。",
    );

    return null;
  }

  const sourceUnit = getBattleUnitByInstanceId(
    input.state,
    input.sourceUnitInstanceId,
  );

  if (!sourceUnit) {
    input.state.logs.unshift("加護の回復量を計算する付与者が見つかりません。");

    return null;
  }

  return Math.max(
    0,
    Math.floor(getEffectiveAttack(sourceUnit) * params.attackMultiplier),
  );
}

function addBlessingStatusEffect(input: AddStatusEffectInput): void {
  const duration = input.duration ?? getDefaultStatusDuration("blessing");

  const category = resolveAppliedStatusEffectCategory(
    "blessing",
    input.category,
  );

  const healAmount = resolveBlessingHealAmount(input);

  if (healAmount === null) {
    return;
  }

  const existing = getBlessingStatusEffect(input.target);

  if (!existing) {
    input.target.statusEffects.push({
      id: "blessing",
      remainingTurns: duration,
      sourceUnitInstanceId: input.sourceUnitInstanceId,
      sourceSkillId: input.sourceSkillId,
      category,
      params: {
        type: "blessing",
        healAmount,
      },
    });

    input.state.logs.unshift(
      `${input.target.definition.name} は回復量${healAmount}の加護を得た。`,
    );

    return;
  }

  const existingHealAmount = existing.params.healAmount;

  const shouldReplace =
    healAmount > existingHealAmount ||
    (healAmount === existingHealAmount && duration > existing.remainingTurns);

  if (!shouldReplace) {
    input.state.logs.unshift(
      `${input.target.definition.name} の既存の加護は新しい加護より強かった。`,
    );

    return;
  }

  const beforeHealAmount = existingHealAmount;

  const beforeDuration = existing.remainingTurns;

  existing.remainingTurns = duration;

  existing.sourceUnitInstanceId = input.sourceUnitInstanceId;

  existing.sourceSkillId = input.sourceSkillId;

  existing.category = category;

  existing.params = {
    type: "blessing",
    healAmount,
  };

  input.state.logs.unshift(
    `${input.target.definition.name} の加護が回復量${beforeHealAmount}・${beforeDuration}ターンから、回復量${healAmount}・${duration}ターンに更新された。`,
  );
}

function addCurseStatusEffect(input: AddStatusEffectInput): void {
  const duration = input.duration ?? getDefaultStatusDuration("curse");

  const normalizedDuration = Math.max(0, Math.floor(duration));

  const category = resolveAppliedStatusEffectCategory("curse", input.category);

  const existing = input.target.statusEffects.find((statusEffect) => {
    return statusEffect.id === "curse";
  });

  if (!existing) {
    input.target.statusEffects.push({
      id: "curse",
      remainingTurns: normalizedDuration,
      sourceUnitInstanceId: input.sourceUnitInstanceId,
      sourceSkillId: input.sourceSkillId,
      category,
      params: undefined,
    });

    input.state.logs.unshift(
      `${input.target.definition.name} は呪いを受けた。`,
    );

    return;
  }

  /**
   * 呪いは短い継続ターンを優先する。
   */
  if (normalizedDuration >= existing.remainingTurns) {
    input.state.logs.unshift(
      `${input.target.definition.name} はすでにより強い呪いを受けている。`,
    );

    return;
  }

  const beforeDuration = existing.remainingTurns;

  existing.remainingTurns = normalizedDuration;

  existing.sourceUnitInstanceId = input.sourceUnitInstanceId;

  existing.sourceSkillId = input.sourceSkillId;

  existing.category = category;

  input.state.logs.unshift(
    `${input.target.definition.name} の呪いの残りターンが ${beforeDuration} から ${normalizedDuration} に短縮された。`,
  );
}

function applyBlessingAtActionEnd(state: BattleState, unit: BattleUnit): void {
  const blessing = getBlessingStatusEffect(unit);

  if (!blessing) {
    return;
  }

  const healingResult = applyHealing({
    state,
    healer: unit,
    target: unit,
    amount: blessing.params.healAmount,
    sourceType: "status_effect",
  });

  if (healingResult.invalidTarget) {
    return;
  }

  if (healingResult.blocked) {
    state.logs.unshift(
      `${unit.definition.name} は回復無効により加護の効果でHPを回復できなかった。`,
    );

    return;
  }

  if (healingResult.actualAmount <= 0) {
    state.logs.unshift(
      `${unit.definition.name} は加護の効果を受けたが、HPは回復しなかった。`,
    );

    return;
  }

  state.logs.unshift(
    `${unit.definition.name} は加護の効果でHPが ${healingResult.actualAmount} 回復した。`,
  );
}

function applyPoisonStatusAtActionEnd(
  state: BattleState,
  unit: BattleUnit,
): void {
  if (hasStatusEffect(unit, "strong_poison")) {
    applyPoisonLikeEffect(state, unit, 0.2, "猛毒");

    return;
  }

  if (hasStatusEffect(unit, "poison")) {
    applyPoisonLikeEffect(state, unit, 0.1, "毒");
  }
}

function isMatchingStatChangeParams(
  statusEffectId: "attack_change" | "speed_change",
  params: StatusEffectParams | undefined,
): params is StatChangeStatusParams {
  return params?.type === statusEffectId;
}

function cloneStatChangeStatusParams(
  params: StatChangeStatusParams,
): StatChangeStatusParams {
  return {
    type: params.type,
    change: {
      kind: params.change.kind,
      value: params.change.value,
    },
    stackingMode: params.stackingMode ?? "same_skill",
  };
}

function getStatChangeLogValue(params: StatChangeStatusParams): string {
  if (params.change.kind === "flat") {
    return params.change.value >= 0
      ? `+${params.change.value}`
      : `${params.change.value}`;
  }

  return `×${params.change.value}`;
}

function addStatChangeStatusEffect(input: AddStatusEffectInput): void {
  if (
    input.statusEffectId !== "attack_change" &&
    input.statusEffectId !== "speed_change"
  ) {
    return;
  }

  if (!isMatchingStatChangeParams(input.statusEffectId, input.params)) {
    input.state.logs.unshift(
      `${input.target.definition.name} への${getStatusEffectName(
        input.statusEffectId,
      )}付与に必要な変化量が設定されていません。`,
    );
    return;
  }

  if (!Number.isFinite(input.params.change.value)) {
    input.state.logs.unshift(
      `${input.target.definition.name} への${getStatusEffectName(
        input.statusEffectId,
      )}の変化量が不正です。`,
    );
    return;
  }

  const duration =
    input.duration ?? getDefaultStatusDuration(input.statusEffectId);

  const normalizedDuration = Math.max(0, Math.trunc(duration));

  const category = resolveAppliedStatusEffectCategory(
    input.statusEffectId,
    input.category,
  );

  const incomingParams = cloneStatChangeStatusParams(input.params);

  const stackingMode = incomingParams.stackingMode ?? "same_skill";

  /**
   * always_stackでは既存状態を一切検索せず、
   * 必ず新しいインスタンスとして末尾へ追加する。
   */
  if (stackingMode === "always_stack") {
    input.target.statusEffects.push({
      id: input.statusEffectId,
      remainingTurns: normalizedDuration,
      sourceUnitInstanceId: input.sourceUnitInstanceId,
      sourceSkillId: input.sourceSkillId,
      category,
      params: incomingParams,
    });

    input.state.logs.unshift(
      `${input.target.definition.name} に${getStatusEffectName(
        input.statusEffectId,
      )}${getStatChangeLogValue(incomingParams)}が付与された。`,
    );

    return;
  }

  /**
   * same_skillでは、
   * 同じ状態異常IDかつ同じ付与元技IDのものだけ
   * 更新対象とする。
   *
   * always_stackによって同じ技IDの状態が複数ある場合も
   * 考えられるが、same_skillによる再付与では
   * 最初に見つかったものを更新する。
   */
  const existing = input.target.statusEffects.find((statusEffect) => {
    return (
      statusEffect.id === input.statusEffectId &&
      statusEffect.sourceSkillId === input.sourceSkillId
    );
  });

  if (!existing) {
    input.target.statusEffects.push({
      id: input.statusEffectId,
      remainingTurns: normalizedDuration,
      sourceUnitInstanceId: input.sourceUnitInstanceId,
      sourceSkillId: input.sourceSkillId,
      category,
      params: incomingParams,
    });

    input.state.logs.unshift(
      `${input.target.definition.name} に${getStatusEffectName(
        input.statusEffectId,
      )}${getStatChangeLogValue(incomingParams)}が付与された。`,
    );

    return;
  }

  const beforeDuration = existing.remainingTurns;

  const beforeValue =
    existing.params &&
    isMatchingStatChangeParams(input.statusEffectId, existing.params)
      ? getStatChangeLogValue(existing.params)
      : "未設定";

  /**
   * 継続ターンは長い方を採用する。
   */
  existing.remainingTurns = Math.max(
    existing.remainingTurns,
    normalizedDuration,
  );

  /**
   * 変化量、分類、付与者は新しい付与内容へ更新する。
   *
   * statusEffects配列内の位置は変えないため、
   * 最初に付与された計算順が維持される。
   */
  existing.sourceUnitInstanceId = input.sourceUnitInstanceId;
  existing.category = category;
  existing.params = incomingParams;

  /**
   * sourceSkillIdは一致しているが、
   * 新しい値を明示的に再代入しておく。
   */
  existing.sourceSkillId = input.sourceSkillId;

  input.state.logs.unshift(
    `${input.target.definition.name} の${getStatusEffectName(
      input.statusEffectId,
    )}が${beforeValue}・${beforeDuration}ターンから、${getStatChangeLogValue(
      incomingParams,
    )}・${existing.remainingTurns}ターンに更新された。`,
  );
}
