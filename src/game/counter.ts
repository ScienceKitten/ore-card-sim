import type { BattleState, BattleUnit } from "../types/battle";
import type { EffectAction, SkillDefinition } from "../types/skill";
import type { CounterEvent, SkillExecutionInfo } from "../types/counter";
import { getBattleUnitByInstanceId, updateBattleResult } from "./battleQueries";
import {
  consumeCounterCount,
  getCounterStatusEffect,
  getRemainingCounterCount,
} from "./statusEffects";
import { applyEffectAction } from "./effectHandlers";

function makeCounterEventKey(
  attackerInstanceId: string,
  counterUnitInstanceId: string,
  sourceSkillId: string,
): string {
  return `${attackerInstanceId}::${counterUnitInstanceId}::${sourceSkillId}`;
}

function hasCounterEvent(
  counterEvents: CounterEvent[],
  event: CounterEvent,
): boolean {
  const newKey = makeCounterEventKey(
    event.attackerInstanceId,
    event.counterUnitInstanceId,
    event.sourceSkillId,
  );

  return counterEvents.some((existing) => {
    const existingKey = makeCounterEventKey(
      existing.attackerInstanceId,
      existing.counterUnitInstanceId,
      existing.sourceSkillId,
    );

    return existingKey === newKey;
  });
}

export function recordCounterEventsForAction(
  _state: BattleState,
  actor: BattleUnit,
  skill: SkillDefinition,
  _action: EffectAction,
  targets: BattleUnit[],
  counterEvents: CounterEvent[],
  executionInfo: SkillExecutionInfo,
): void {
  for (const target of targets) {
    if (target.side === actor.side) continue;

    const counterStatus = getCounterStatusEffect(target);

    if (!counterStatus) continue;

    const params = counterStatus.params;

    if (!params.counterCategories.includes(skill.category)) {
      continue;
    }

    const requireDamage = params.requireDamage ?? true;

    if (!satisfiesRequireDamage(target, requireDamage, executionInfo)) {
      continue;
    }

    const event: CounterEvent = {
      attackerInstanceId: actor.instanceId,
      counterUnitInstanceId: target.instanceId,
      sourceSkillId: skill.id,
      sourceSkillCategory: skill.category,
    };

    if (!hasCounterEvent(counterEvents, event)) {
      counterEvents.push(event);
    }
  }
}

export function resolveCounterEvents(
  state: BattleState,
  counterEvents: CounterEvent[],
  skills: Record<string, SkillDefinition>,
): void {
  const eventsToResolve = [...counterEvents];

  //state.logs.unshift(`カウンター候補: ${eventsToResolve.length} 件`);

  counterEvents.length = 0;

  for (const event of eventsToResolve) {
    const attacker = getBattleUnitByInstanceId(state, event.attackerInstanceId);

    const counterUnit = getBattleUnitByInstanceId(
      state,
      event.counterUnitInstanceId,
    );

    if (!skills) {
      state.logs.unshift("カウンター失敗: skills が渡されていません。");
      continue;
    }

    if (!attacker) {
      state.logs.unshift("カウンター失敗: 攻撃者が見つかりません。");
      continue;
    }

    if (!counterUnit) {
      state.logs.unshift(
        "カウンター失敗: カウンターユニットが見つかりません。",
      );
      continue;
    }

    const counterStatus = getCounterStatusEffect(counterUnit);

    if (!counterStatus) {
      state.logs.unshift(
        `カウンター失敗: ${counterUnit.definition.name} にカウンター状態がありません。`,
      );
      continue;
    }

    const params = counterStatus.params;

    if (!params.counterCategories.includes(event.sourceSkillCategory)) {
      state.logs.unshift(
        `カウンター失敗: ${event.sourceSkillCategory} は反撃対象カテゴリではありません。`,
      );
      continue;
    }

    const remainingCounterCount = getRemainingCounterCount(params);

    if (remainingCounterCount !== null && remainingCounterCount <= 0) {
      state.logs.unshift(
        `カウンター失敗: ${counterUnit.definition.name} の反撃回数が残っていません。`,
      );
      continue;
    }

    const canCounterOnDeath = params.canCounterOnDeath ?? false;

    if (counterUnit.currentHp <= 0 && !canCounterOnDeath) {
      state.logs.unshift(
        `${counterUnit.definition.name} は倒れているため反撃できなかった。`,
      );
      continue;
    }

    const sourceSkill = skills[counterStatus.sourceSkillId];

    if (!sourceSkill) {
      state.logs.unshift(
        `カウンター失敗: 付与元技ID "${counterStatus.sourceSkillId}" が見つかりません。`,
      );
      continue;
    }

    state.logs.unshift(
      `${counterUnit.definition.name} のカウンターが発動した！`,
    );

    applyCounterActionsToAttacker(
      state,
      counterUnit,
      attacker,
      sourceSkill,
      params.counterActionsToAttacker,
    );

    applyCounterActionsToSelf(
      state,
      counterUnit,
      sourceSkill,
      params.counterActionsToSelf,
    );

    consumeCounterCount(counterUnit);

    updateBattleResult(state);
  }

  updateBattleResult(state);
}

function applyCounterActionsToAttacker(
  state: BattleState,
  counterUnit: BattleUnit,
  attacker: BattleUnit,
  sourceSkill: SkillDefinition,
  actions: EffectAction[],
): void {
  for (const action of actions) {
    applyEffectAction(action, [attacker], {
      state,
      actor: counterUnit,
      skill: sourceSkill,
      usedReelSlot: null,
    });
  }
}

function applyCounterActionsToSelf(
  state: BattleState,
  counterUnit: BattleUnit,
  sourceSkill: SkillDefinition,
  actions: EffectAction[],
): void {
  for (const action of actions) {
    applyEffectAction(action, [counterUnit], {
      state,
      actor: counterUnit,
      skill: sourceSkill,
      usedReelSlot: null,
    });
  }
}

export function shouldNullifyActionByCounter(
  actor: BattleUnit,
  target: BattleUnit,
  skill: SkillDefinition,
  executionInfo: SkillExecutionInfo,
): boolean {
  if (actor.side === target.side) {
    return false;
  }

  const counterStatus = getCounterStatusEffect(target);

  if (!counterStatus) {
    return false;
  }

  const params = counterStatus.params;

  if (!params.nullifyCategories.includes(skill.category)) {
    return false;
  }

  const requireDamage = params.requireDamage ?? true;

  return satisfiesRequireDamage(target, requireDamage, executionInfo);
}

export interface CounterNullifyResult {
  appliedTargets: BattleUnit[];
  nullifiedTargets: BattleUnit[];
}

export function splitTargetsByCounterNullify(
  actor: BattleUnit,
  skill: SkillDefinition,
  targets: BattleUnit[],
  executionInfo: SkillExecutionInfo,
): CounterNullifyResult {
  const appliedTargets: BattleUnit[] = [];
  const nullifiedTargets: BattleUnit[] = [];

  for (const target of targets) {
    if (shouldNullifyActionByCounter(actor, target, skill, executionInfo)) {
      nullifiedTargets.push(target);
    } else {
      appliedTargets.push(target);
    }
  }

  return {
    appliedTargets,
    nullifiedTargets,
  };
}

export function logCounterNullify(
  state: BattleState,
  nullifiedTargets: BattleUnit[],
  skill: SkillDefinition,
): void {
  for (const target of nullifiedTargets) {
    state.logs.unshift(
      `${target.definition.name} は「${skill.name}」の効果を無効化した！`,
    );
  }
}

export function recordDamageTargetsForAction(
  action: EffectAction,
  targets: BattleUnit[],
  executionInfo: SkillExecutionInfo,
): void {
  if (action.type !== "damage" && action.type !== "drain") return;

  for (const target of targets) {
    executionInfo.damageTargetInstanceIds.add(target.instanceId);
  }
}

function satisfiesRequireDamage(
  target: BattleUnit,
  requireDamage: boolean,
  executionInfo: SkillExecutionInfo,
): boolean {
  if (!requireDamage) {
    return true;
  }

  return executionInfo.damageTargetInstanceIds.has(target.instanceId);
}
