import type { BattleState, BattleUnit, UsedReelSlot } from "../types/battle";
import type { CounterEvent } from "../types/counter";
import type { SkillDefinition, SkillEffect } from "../types/skill";
import {
  getActiveUnit,
  getBattleUnitByInstanceId,
  getOwnTeam,
  setSpecialGauge,
} from "./battleQueries";
import { finishActorTurn } from "./actionLifecycle";
import { recordCounterEventsForAction, resolveCounterEvents } from "./counter";
import { applyEffectAction } from "./effectHandlers";
import {
  canActByStatus,
  getCannotActMessage,
  getSkillSealMessage,
  isSkillSealedByStatus,
} from "./statusEffects";
import {
  getSelectableTargets,
  needsManualTargetSelection,
  selectTargetsAutomatically,
} from "./targetSelectors";

export function executeRandomReelSkill(
  state: BattleState,
  skills: Record<string, SkillDefinition>,
): void {
  if (state.result.status !== "in_progress") return;
  if (state.pendingTargetSelection) return;

  const actor = getActiveUnit(state);

  if (!actor) {
    state.logs.unshift("行動できるユニットがいません。");
    return;
  }

  if (actor.currentHp <= 0) {
    state.logs.unshift(
      `${actor.definition.name} は倒れているため行動できません。`,
    );
    finishActorTurn(state, actor.instanceId);
    return;
  }

  if (!canActByStatus(actor)) {
    const message = getCannotActMessage(actor);

    if (message) {
      state.logs.unshift(message);
    }

    finishActorTurn(state, actor.instanceId);
    return;
  }

  const reel = actor.reels[actor.currentReelIndex];

  if (!reel || reel.length === 0) {
    state.logs.unshift(`${actor.definition.name} のリールが空です。`);
    finishActorTurn(state, actor.instanceId);
    return;
  }

  const slotIndex = Math.floor(Math.random() * reel.length);
  const skillId = reel[slotIndex];
  const skill = skills[skillId];

  const usedReelSlot: UsedReelSlot = {
    actorInstanceId: actor.instanceId,
    reelIndex: actor.currentReelIndex,
    slotIndex,
    skillId,
  };

  state.lastRolledReelSlot = usedReelSlot;

  if (!skill) {
    state.logs.unshift(`技ID "${skillId}" が見つかりません。`);
    finishActorTurn(state, actor.instanceId);
    return;
  }

  if (isSkillSealedByStatus(actor, skill)) {
    const message = getSkillSealMessage(actor, skill);

    if (message) {
      state.logs.unshift(message);
    }

    finishActorTurn(state, actor.instanceId);
    return;
  }

  executeSkill(state, skill, skills, usedReelSlot);
}

export function executeSpecialSkill(
  state: BattleState,
  skills: Record<string, SkillDefinition>,
): void {
  if (state.result.status !== "in_progress") return;
  if (state.pendingTargetSelection) return;

  const actor = getActiveUnit(state);

  if (!actor) {
    state.logs.unshift("行動ユニットが見つかりません。");
    return;
  }

  if (actor.currentHp <= 0) {
    state.logs.unshift(
      `${actor.definition.name} は倒れているため必殺技を使えません。`,
    );
    finishActorTurn(state, actor.instanceId);
    return;
  }

  if (!canActByStatus(actor)) {
    const message = getCannotActMessage(actor);

    if (message) {
      state.logs.unshift(message);
    }

    finishActorTurn(state, actor.instanceId);
    return;
  }

  const ownTeam = getOwnTeam(state, actor);

  if (ownTeam.specialGauge < 10) {
    state.logs.unshift("必殺技ゲージが足りません。");
    return;
  }

  const skillId = actor.definition.specialSkillId;
  const skill = skills[skillId];

  if (!skill) {
    state.logs.unshift(`必殺技ID "${skillId}" が見つかりません。`);
    return;
  }

  setSpecialGauge(ownTeam, 0);

  state.lastRolledReelSlot = null;

  if (isSkillSealedByStatus(actor, skill)) {
    const message = getSkillSealMessage(actor, skill);

    if (message) {
      state.logs.unshift(message);
    }

    finishActorTurn(state, actor.instanceId);
    return;
  }

  state.logs.unshift(
    `${actor.definition.name} は必殺技「${skill.name}」を発動した！`,
  );

  executeSkillBody(state, actor, skill, skills, null);
}

export function executeSkill(
  state: BattleState,
  skill: SkillDefinition,
  skills: Record<string, SkillDefinition>,
  usedReelSlot: UsedReelSlot | null = null,
): void {
  if (state.result.status !== "in_progress") return;
  if (state.pendingTargetSelection) return;

  const actor = getActiveUnit(state);

  if (!actor) {
    state.logs.unshift("行動ユニットが見つかりません。");
    return;
  }

  state.logs.unshift(`${actor.definition.name} は「${skill.name}」を使った。`);

  executeSkillBody(state, actor, skill, skills, usedReelSlot);
}

function executeSkillBody(
  state: BattleState,
  actor: BattleUnit,
  skill: SkillDefinition,
  skills: Record<string, SkillDefinition>,
  usedReelSlot: UsedReelSlot | null,
): void {
  const counterEvents: CounterEvent[] = [];

  executeEffectsFromIndex(
    state,
    actor,
    skill,
    skills,
    0,
    usedReelSlot,
    counterEvents,
  );
}

function executeEffectsFromIndex(
  state: BattleState,
  actor: BattleUnit,
  skill: SkillDefinition,
  skills: Record<string, SkillDefinition>,
  startEffectIndex: number,
  usedReelSlot: UsedReelSlot | null,
  counterEvents: CounterEvent[],
): void {
  for (
    let effectIndex = startEffectIndex;
    effectIndex < skill.effects.length;
    effectIndex++
  ) {
    const effect = skill.effects[effectIndex];

    if (needsManualTargetSelection(effect.target)) {
      const selectableTargets = getSelectableTargets(
        state,
        actor,
        effect.target,
      );

      if (selectableTargets.length === 0) {
        state.logs.unshift("しかし、対象がいなかった。");
        finishSkillAndActorTurn(state, actor, skills, counterEvents);
        return;
      }

      if (selectableTargets.length === 1) {
        applySkillEffect(
          state,
          actor,
          skill,
          effect,
          selectableTargets,
          usedReelSlot,
          counterEvents,
        );
        continue;
      }

      state.pendingTargetSelection = {
        actorInstanceId: actor.instanceId,
        skill,
        effectIndex,
        selectableTargetInstanceIds: selectableTargets.map(
          (unit) => unit.instanceId,
        ),
        usedReelSlot,
        counterEvents,
      };

      state.logs.unshift("対象を選択してください。");
      return;
    }

    const targets = selectTargetsAutomatically(state, actor, effect.target);

    if (effect.target.type !== "none" && targets.length === 0) {
      state.logs.unshift("しかし、対象がいなかった。");
      finishSkillAndActorTurn(state, actor, skills, counterEvents);
      return;
    }

    applySkillEffect(
      state,
      actor,
      skill,
      effect,
      targets,
      usedReelSlot,
      counterEvents,
    );
  }
  finishSkillAndActorTurn(state, actor, skills, counterEvents);
}

export function continueSkillWithSelectedTarget(
  state: BattleState,
  selectedTargetInstanceId: string,
  skills: Record<string, SkillDefinition>,
): void {
  const pending = state.pendingTargetSelection;

  if (!pending) return;

  if (!pending.selectableTargetInstanceIds.includes(selectedTargetInstanceId)) {
    state.logs.unshift("その対象は選択できません。");
    return;
  }

  const actor = getBattleUnitByInstanceId(state, pending.actorInstanceId);
  const target = getBattleUnitByInstanceId(state, selectedTargetInstanceId);

  if (!actor || !target) {
    state.logs.unshift("対象選択の情報が不正です。");
    state.pendingTargetSelection = null;
    return;
  }

  const skill = pending.skill;
  const effect = skill.effects[pending.effectIndex];

  state.pendingTargetSelection = null;

  applySkillEffect(
    state,
    actor,
    skill,
    effect,
    [target],
    pending.usedReelSlot,
    pending.counterEvents,
  );

  executeEffectsFromIndex(
    state,
    actor,
    skill,
    skills,
    pending.effectIndex + 1,
    pending.usedReelSlot,
    pending.counterEvents,
  );
}

function applySkillEffect(
  state: BattleState,
  actor: BattleUnit,
  skill: SkillDefinition,
  effect: SkillEffect,
  targets: BattleUnit[],
  usedReelSlot: UsedReelSlot | null,
  counterEvents: CounterEvent[],
): void {
  for (const action of effect.actions) {
    recordCounterEventsForAction(
      state,
      actor,
      skill,
      action,
      targets,
      counterEvents,
    );

    applyEffectAction(action, targets, {
      state,
      actor,
      skill,
      usedReelSlot,
    });
  }
}

function finishSkillAndActorTurn(
  state: BattleState,
  actor: BattleUnit,
  skills: Record<string, SkillDefinition>,
  counterEvents: CounterEvent[],
): void {
  state.logs.unshift("技処理終了: カウンター解決へ");

  resolveCounterEvents(state, counterEvents, skills);

  state.logs.unshift("カウンター解決終了: 行動終了処理へ");

  if (state.result.status !== "in_progress") {
    return;
  }

  finishActorTurn(state, actor.instanceId);
}
