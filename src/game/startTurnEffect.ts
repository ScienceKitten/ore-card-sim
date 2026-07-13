import type { BattleState, BattleUnit } from "../types/battle";
import type { SkillDefinition } from "../types/skill";
import { finishActorTurn } from "./actionLifecycle";
import { getBattleUnitByInstanceId } from "./battleQueries";
import { executeSkill } from "./executeSkill";
import {
  canActByStatus,
  getCannotActMessage,
  getChargedAttackStatusEffect,
  removeStatusEffectInstance,
} from "./statusEffects";

export function resolveStartTurnEffects(
  state: BattleState,
  skills: Record<string, SkillDefinition>,
): void {
  if (state.result.status !== "in_progress") return;
  if (state.pendingTargetSelection) return;
  if (!state.activeUnitInstanceId) return;

  const actor = getBattleUnitByInstanceId(state, state.activeUnitInstanceId);

  if (!actor) return;
  if (actor.currentHp <= 0) return;

  // まず麻痺などの行動不能を優先する。
  if (!canActByStatus(actor)) {
    const message = getCannotActMessage(actor);

    if (message) {
      state.logs.unshift(message);
    }

    finishActorTurn(state, actor.instanceId);
    return;
  }

  const chargedStatus = getChargedAttackStatusEffect(actor);

  if (!chargedStatus) return;

  const remainingTurns = chargedStatus.remainingTurns;
  const canMoveWhileCharge = chargedStatus.params.canMoveWhileCharge ?? false;

  // 残り1ターンならチャージ攻撃を自動発動する。
  if (remainingTurns <= 1) {
    executeChargedAttack(state, actor, chargedStatus, skills);

    return;
  }

  // 残り2ターン以上で canMoveWhileCharge が false なら行動不能。
  if (!canMoveWhileCharge) {
    state.logs.unshift(`${actor.definition.name} はチャージしている。`);

    finishActorTurn(state, actor.instanceId);
  }
}

function executeChargedAttack(
  state: BattleState,
  actor: BattleUnit,
  chargedStatus: NonNullable<ReturnType<typeof getChargedAttackStatusEffect>>,
  skills: Record<string, SkillDefinition>,
): void {
  const skillId = chargedStatus.params.skillId;
  const skill = skills[skillId];

  // 自動発動するので、この時点でチャージ状態は解除する。
  removeStatusEffectInstance(actor, chargedStatus);

  if (!skill) {
    state.logs.unshift(`チャージ攻撃の技ID "${skillId}" が見つかりません。`);

    finishActorTurn(state, actor.instanceId);
    return;
  }

  state.logs.unshift(
    `${actor.definition.name} はチャージ攻撃「${skill.name}」を放つ！`,
  );

  executeSkill(state, skill, skills, null, "charged_attack");
}
