import type { BattleState, BattleUnit } from "../types/battle";
import type { SkillId } from "../types/common";
import type { StatusEffectId } from "../types/statusEffect";
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
