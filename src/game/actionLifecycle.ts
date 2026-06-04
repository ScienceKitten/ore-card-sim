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

  // まず戦闘終了判定。
  // 技の効果で敵を全滅させた場合などは、再行動や行動終了時処理に進まない。
  updateBattleResult(state);

  if (state.result.status !== "in_progress") {
    return;
  }

  const extraActionIndex = state.extraActionQueue.indexOf(actorInstanceId);

  // 再行動予約がある場合は、予約を1つ消費して同じユニットを再度行動中にする。
  // この場合、毒ダメージ・状態異常ターン消費などの「行動終了時処理」は行わない。
  if (extraActionIndex !== -1) {
    state.extraActionQueue.splice(extraActionIndex, 1);

    if (actor && actor.currentHp > 0) {
      state.activeUnitInstanceId = actorInstanceId;

      state.logs.unshift(`${actor.definition.name} は続けて行動する！`);

      resolveUnableToActActiveUnits(state);
      return;
    }

    // 再行動予約があっても、本人が倒れている場合は再行動できない。
    // 残っている同一ユニットの再行動予約も掃除しておく。
    state.extraActionQueue = state.extraActionQueue.filter(
      (queuedInstanceId) => queuedInstanceId !== actorInstanceId,
    );
  }

  // ここまで来た場合だけ、正式な行動終了として扱う。
  // つまり、再行動が残っていない最後の行動後だけ実行される。
  if (actor) {
    applyActionEndStatusEffects(state, actor);
  }

  updateBattleResult(state);

  if (state.result.status !== "in_progress") {
    return;
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
