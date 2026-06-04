import type { BattleState, BattleUnit } from "../types/battle";
import type { EffectAction, SkillDefinition } from "../types/skill";
import type { CounterEvent } from "../types/counter";
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
  state: BattleState,
  actor: BattleUnit,
  skill: SkillDefinition,
  action: EffectAction,
  targets: BattleUnit[],
  counterEvents: CounterEvent[],
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

    if (requireDamage && action.type !== "damage") {
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

/*
export function resolveCounterEvents(
  state: BattleState,
  counterEvents: CounterEvent[],
  skills: Record<string, SkillDefinition>,
): void {
  state.logs.unshift(`カウンター候補: ${counterEvents.length} 件`);
  const eventsToResolve = [...counterEvents];

  counterEvents.length = 0;

  for (const event of eventsToResolve) {
    const attacker = getBattleUnitByInstanceId(state, event.attackerInstanceId);

    const counterUnit = getBattleUnitByInstanceId(
      state,
      event.counterUnitInstanceId,
    );

    if (!attacker || !counterUnit) {
      continue;
    }

    const counterStatus = getCounterStatusEffect(counterUnit);

    if (!counterStatus) {
      continue;
    }

    const params = counterStatus.params;

    if (!params.counterCategories.includes(event.sourceSkillCategory)) {
      continue;
    }

    const remainingCounterCount = getRemainingCounterCount(params);

    if (remainingCounterCount !== null && remainingCounterCount <= 0) {
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
        `カウンターの付与元技ID "${counterStatus.sourceSkillId}" が見つかりません。`,
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
  */
export function resolveCounterEvents(
  state: BattleState,
  counterEvents: CounterEvent[],
  skills: Record<string, SkillDefinition>,
): void {
  const eventsToResolve = [...counterEvents];

  state.logs.unshift(`カウンター候補: ${eventsToResolve.length} 件`);

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
