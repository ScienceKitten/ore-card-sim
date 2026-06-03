import type { BattleState } from "../types/battle";
import { getBattleUnitByInstanceId, updateBattleResult } from "./battleQueries";
import { markUnitAsActed, proceedTurnIfNeeded } from "./turnManager";
import {
  applyActionEndStatusEffects,
  canActByStatus,
  getCannotActMessage,
} from "./statusEffects";

/**
 * 行動終了共通処理。
 * 通常行動、必殺技、麻痺による行動不能、すべてここを通す。
 */
export function finishActorTurn(
  state: BattleState,
  actorInstanceId: string,
): void {
  state.pendingTargetSelection = null;

  const actor = getBattleUnitByInstanceId(state, actorInstanceId);

  if (actor) {
    applyActionEndStatusEffects(state, actor);
  }

  updateBattleResult(state);

  if (state.result.status !== "in_progress") {
    return;
  }

  const extraActionIndex = state.extraActionQueue.indexOf(actorInstanceId);

  if (extraActionIndex !== -1) {
    state.extraActionQueue.splice(extraActionIndex, 1);

    if (actor && actor.currentHp > 0) {
      state.activeUnitInstanceId = actorInstanceId;

      state.logs.unshift(`${actor.definition.name} は続けて行動する！`);

      resolveUnableToActActiveUnits(state);
      return;
    }
  }

  markUnitAsActed(state, actorInstanceId);

  proceedTurnIfNeeded(state);

  resolveUnableToActActiveUnits(state);
}

/**
 * activeUnit が麻痺などで行動できない場合、自動で行動終了させる。
 * 連続で麻痺しているユニットが並ぶ可能性があるので while にする。
 */
export function resolveUnableToActActiveUnits(state: BattleState): void {
  while (state.result.status === "in_progress") {
    if (!state.activeUnitInstanceId) return;

    const actor = getBattleUnitByInstanceId(state, state.activeUnitInstanceId);

    if (!actor) return;
    if (actor.currentHp <= 0) return;

    if (canActByStatus(actor)) {
      return;
    }

    const message = getCannotActMessage(actor);

    if (message) {
      state.logs.unshift(message);
    }

    finishActorTurn(state, actor.instanceId);
  }
}
