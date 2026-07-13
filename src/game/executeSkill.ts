import type { BattleState, BattleUnit, UsedReelSlot } from "../types/battle";

import type { CounterEvent } from "../types/counter";
import type {
  SkillExecutionInfo,
  SkillExecutionSource,
  TargetingMode,
} from "../types/skillExecution";

import type {
  EffectAction,
  RandomAction,
  SkillDefinition,
  SkillEffect,
} from "../types/skill";
import {
  getActiveUnit,
  getBattleUnitByInstanceId,
  getOwnTeam,
  setSpecialGauge,
  getSpecialGaugeConsumption,
} from "./battleQueries";
import { finishActorTurn } from "./actionLifecycle";
import {
  logCounterNullify,
  recordCounterEventsForAction,
  recordDamageTargetsForAction,
  resolveCounterEvents,
  splitTargetsByCounterNullify,
} from "./counter";
import { applyEffectAction } from "./effectHandlers";
import {
  canActByStatus,
  getCannotActMessage,
  getSkillSealMessage,
  isConfused,
  isSkillSealedByStatus,
  resolveFrostbiteOnReelSelection,
} from "./statusEffects";
import {
  getSelectableTargets,
  hasAvailableTargets,
  isTargetSelectorAffectedByMode,
  needsManualTargetSelection,
  resolveTargetSelector,
  selectTargetsAutomatically,
} from "./targetSelectors";
import { createSkillExecutionInfo } from "./skillExecution";
import { randomChoice, rollChance } from "../utils/random";

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

  const actorIsConfused = isConfused(actor);

  if (actorIsConfused) {
    state.logs.unshift(`${actor.definition.name} は混乱している。`);

    const ownTeam = getOwnTeam(state, actor);

    /**
     * 必殺技ゲージが10ある場合だけ、
     * 50%で必殺技を選ぶ。
     *
     * 必殺技の消費量が10未満でも、
     * 使用条件は従来どおりゲージ10。
     */
    if (ownTeam.specialGauge >= 10 && Math.random() < 0.5) {
      executeSpecialSkill(state, skills, {
        allowWhileConfused: true,
      });

      return;
    }

    /**
     * ゲージ不足、または50%抽選で必殺技が選ばれなかった場合、
     * このまま通常のリール抽選へ進む。
     */
  }

  const reel = actor.reels[actor.currentReelIndex];

  if (!reel || reel.length === 0) {
    state.logs.unshift(`${actor.definition.name} のリールが空です。`);
    finishActorTurn(state, actor.instanceId);
    return;
  }

  const slotIndex = Math.floor(Math.random() * reel.length);
  const skillId = reel[slotIndex];

  const usedReelSlot: UsedReelSlot = {
    actorInstanceId: actor.instanceId,
    reelIndex: actor.currentReelIndex,
    slotIndex,
    skillId,
  };

  state.lastRolledReelSlot = usedReelSlot;
  //凍傷の処理
  const frostbiteActivated = resolveFrostbiteOnReelSelection(
    state,
    actor,
    slotIndex,
  );

  if (frostbiteActivated) {
    finishActorTurn(state, actor.instanceId);

    return;
  }
  const skill = skills[skillId];
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

  executeSkill(state, skill, skills, usedReelSlot, "reel");
}

export function executeSpecialSkill(
  state: BattleState,
  skills: Record<string, SkillDefinition>,
  options: ExecuteSpecialSkillOptions = {},
): void {
  if (state.result.status !== "in_progress") return;
  if (state.pendingTargetSelection) return;

  const actor = getActiveUnit(state);

  if (!actor) {
    state.logs.unshift("行動ユニットが見つかりません。");
    return;
  }

  /**
   * 通常の必殺技ボタンからは、混乱中に必殺技を使えない。
   *
   * ただし、技ボタンの混乱抽選によって必殺技が選ばれた場合は
   * allowWhileConfusedがtrueなので実行できる。
   */
  if (isConfused(actor) && !options.allowWhileConfused) {
    state.logs.unshift(
      `${actor.definition.name} は混乱しているため必殺技を選べない。`,
    );
    return;
  }

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

  const gaugeConsumption = getSpecialGaugeConsumption(actor);

  const gaugeBeforeConsumption = ownTeam.specialGauge;

  setSpecialGauge(ownTeam, ownTeam.specialGauge - gaugeConsumption);

  const actualGaugeConsumption = gaugeBeforeConsumption - ownTeam.specialGauge;

  state.logs.unshift(
    `${actor.definition.name} は必殺技ゲージを ${actualGaugeConsumption} 消費した。`,
  );

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

  executeSkillBody(state, actor, skill, skills, null, "special");
}

export function executeSkill(
  state: BattleState,
  skill: SkillDefinition,
  skills: Record<string, SkillDefinition>,
  usedReelSlot: UsedReelSlot | null = null,
  source: SkillExecutionSource = "other",
): void {
  if (state.result.status !== "in_progress") return;
  if (state.pendingTargetSelection) return;

  const actor = getActiveUnit(state);

  if (!actor) {
    state.logs.unshift("行動ユニットが見つかりません。");
    return;
  }

  state.logs.unshift(`${actor.definition.name} は「${skill.name}」を使った。`);

  executeSkillBody(state, actor, skill, skills, usedReelSlot, source);
}

function executeSkillBody(
  state: BattleState,
  actor: BattleUnit,
  skill: SkillDefinition,
  skills: Record<string, SkillDefinition>,
  usedReelSlot: UsedReelSlot | null,
  source: SkillExecutionSource,
): void {
  const counterEvents: CounterEvent[] = [];

  const executionInfo: SkillExecutionInfo = createSkillExecutionInfo(
    actor,
    source,
  );

  executeEffectsFromIndex(
    state,
    actor,
    skill,
    skills,
    0,
    usedReelSlot,
    counterEvents,
    executionInfo,
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
  executionInfo: SkillExecutionInfo,
): void {
  for (
    let effectIndex = startEffectIndex;
    effectIndex < skill.effects.length;
    effectIndex++
  ) {
    const effect = skill.effects[effectIndex];

    /**
     * 現在の実行情報をもとに、
     * このエフェクトで使う対象選択を決定する。
     */
    let effectiveTargetingMode = getEffectiveTargetingMode(executionInfo);

    let effectiveTargetSelector = resolveTargetSelector(
      effect.target,
      effectiveTargetingMode,
    );

    /**
     * 対象不在時の70%・30%抽選は、
     * 技の最初のエフェクトに対してだけ行う。
     *
     * 対象選択待ちから再開した場合は
     * startEffectIndexが1以上になることがあるが、
     * targetFallbackResolvedが保持されているため
     * 再抽選は起きない。
     */
    if (effectIndex === 0 && !executionInfo.targetFallbackResolved) {
      executionInfo.targetFallbackResolved = true;

      const isAffectedByTargetingMode = isTargetSelectorAffectedByMode(
        effect.target,
        executionInfo.targetingMode,
      );

      /**
       * 混乱などによって対象選択が変更され、
       * 変更後の候補がいない場合だけ特殊抽選を行う。
       *
       * self、none、random_all_unitsなど、
       * 対象選択が変化しないものでは抽選しない。
       */
      if (
        isAffectedByTargetingMode &&
        !hasAvailableTargets(state, actor, effectiveTargetSelector)
      ) {
        const confusionSuccess = Math.random() < 0.3;

        if (!confusionSuccess) {
          state.logs.unshift("しかし、対象がいなかった。");

          finishSkillAndActorTurn(state, actor, skills, counterEvents);

          return;
        }

        /**
         * 30%救済に成功した場合、
         * この技の全エフェクトを元の対象選択で実行する。
         */
        executionInfo.useOriginalTargetingForWholeSkill = true;

        state.logs.unshift(`混乱していたが、「${skill.name}」は成功した！`);

        effectiveTargetingMode = "normal";

        effectiveTargetSelector = resolveTargetSelector(
          effect.target,
          effectiveTargetingMode,
        );
      }
    }

    /**
     * 手動対象選択が必要な対象選択。
     *
     * 混乱でsingle_enemyがrandom_alliesへ変換された場合は
     * 自動選択になるため、この分岐には入らない。
     *
     * 30%救済成功で元のsingle_enemyへ戻った場合は、
     * 通常どおり対象選択UIへ進む。
     */
    if (needsManualTargetSelection(effectiveTargetSelector)) {
      const selectableTargets = getSelectableTargets(
        state,
        actor,
        effectiveTargetSelector,
      );

      if (selectableTargets.length === 0) {
        state.logs.unshift("しかし、対象がいなかった。");

        finishSkillAndActorTurn(state, actor, skills, counterEvents);

        return;
      }

      /**
       * 選択候補が1体しかいない場合は、
       * 従来どおり自動的にその対象を選ぶ。
       */
      if (selectableTargets.length === 1) {
        applySkillEffect(
          state,
          actor,
          skill,
          effect,
          selectableTargets,
          usedReelSlot,
          counterEvents,
          executionInfo,
        );

        continue;
      }

      state.pendingTargetSelection = {
        actorInstanceId: actor.instanceId,
        skill,
        effectIndex,
        selectableTargetInstanceIds: selectableTargets.map((unit) => {
          return unit.instanceId;
        }),
        usedReelSlot,
        counterEvents,
        executionInfo,
      };

      state.logs.unshift("対象を選択してください。");

      return;
    }

    /**
     * 自動対象選択。
     */
    const targets = selectTargetsAutomatically(
      state,
      actor,
      effectiveTargetSelector,
    );

    /**
     * 2つ目以降のエフェクトで対象がいなかった場合、
     * 救済抽選は行わず通常どおり失敗する。
     *
     * 最初のエフェクトでも、
     * 30%救済成功後の元対象に対象がいなければ
     * 通常どおり失敗する。
     */
    if (effectiveTargetSelector.type !== "none" && targets.length === 0) {
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
      executionInfo,
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
    pending.executionInfo,
  );

  executeEffectsFromIndex(
    state,
    actor,
    skill,
    skills,
    pending.effectIndex + 1,
    pending.usedReelSlot,
    pending.counterEvents,
    pending.executionInfo,
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
  executionInfo: SkillExecutionInfo,
): void {
  for (const action of effect.actions) {
    applySkillAction(
      state,
      actor,
      skill,
      action,
      targets,
      usedReelSlot,
      counterEvents,
      executionInfo,
      effect.target.type === "none",
    );
  }
}

function applySkillAction(
  state: BattleState,
  actor: BattleUnit,
  skill: SkillDefinition,
  action: EffectAction,
  targets: BattleUnit[],
  usedReelSlot: UsedReelSlot | null,
  counterEvents: CounterEvent[],
  executionInfo: SkillExecutionInfo,
  isTargetless: boolean,
): void {
  /**
   * 複数候補からランダムで1つ選ぶ効果は、
   * 先に候補を展開してから通常の実行効果処理へ戻す。
   */
  if (action.type === "random_action") {
    applyRandomAction(
      state,
      actor,
      skill,
      action,
      targets,
      usedReelSlot,
      counterEvents,
      executionInfo,
      isTargetless,
    );

    return;
  }

  /**
   * 対象なし効果は、カウンターの記録・無効化判定を通さない。
   */
  if (isTargetless) {
    applyEffectAction(action, [], {
      state,
      actor,
      skill,
      usedReelSlot,
    });

    return;
  }

  /**
   * 選ばれた実行効果がdamageまたはdrainなら、
   * その対象を「この技のダメージ対象」として記録する。
   */
  recordDamageTargetsForAction(action, targets, executionInfo);

  /**
   * 選ばれた実行効果に応じてカウンター候補を記録する。
   */
  recordCounterEventsForAction(
    state,
    actor,
    skill,
    action,
    targets,
    counterEvents,
    executionInfo,
  );

  /**
   * 対象ごとのカウンター無効化判定。
   */
  const { appliedTargets, nullifiedTargets } = splitTargetsByCounterNullify(
    actor,
    skill,
    targets,
    executionInfo,
  );

  if (nullifiedTargets.length > 0) {
    logCounterNullify(state, nullifiedTargets, skill);
  }

  if (appliedTargets.length === 0) {
    return;
  }

  applyEffectAction(action, appliedTargets, {
    state,
    actor,
    skill,
    usedReelSlot,
  });
}

function finishSkillAndActorTurn(
  state: BattleState,
  actor: BattleUnit,
  skills: Record<string, SkillDefinition>,
  counterEvents: CounterEvent[],
): void {
  resolveCounterEvents(state, counterEvents, skills);

  if (state.result.status !== "in_progress") {
    return;
  }

  finishActorTurn(state, actor.instanceId);
}

/**
 * 現在の技実行情報から、実際に使う対象選択モードを取得する。
 *
 * 混乱時の30%救済に成功した場合は、
 * 技全体で元の対象選択を使用する。
 */
function getEffectiveTargetingMode(
  executionInfo: SkillExecutionInfo,
): TargetingMode {
  if (executionInfo.useOriginalTargetingForWholeSkill) {
    return "normal";
  }

  return executionInfo.targetingMode;
}

interface ExecuteSpecialSkillOptions {
  /**
   * trueの場合、混乱中でも必殺技を実行できる。
   *
   * 混乱中の技ボタンから50%で必殺技が選ばれた場合に使用する。
   * 通常の必殺技ボタンからの実行ではfalse。
   */
  allowWhileConfused?: boolean;
}
function applyRandomAction(
  state: BattleState,
  actor: BattleUnit,
  skill: SkillDefinition,
  action: RandomAction,
  targets: BattleUnit[],
  usedReelSlot: UsedReelSlot | null,
  counterEvents: CounterEvent[],
  executionInfo: SkillExecutionInfo,
  isTargetless: boolean,
): void {
  /**
   * まずrandom_action自体の発生確率を判定する。
   *
   * この判定は候補抽選より前に1回だけ行う。
   */
  if (!rollChance(action.chance ?? 1)) {
    state.logs.unshift("しかし、ランダム効果は発生しなかった。");

    return;
  }

  if (action.actions.length === 0) {
    state.logs.unshift("しかし、ランダム効果の候補がなかった。");

    return;
  }

  /**
   * 対象なしエフェクトの場合は、
   * 候補を1回だけ抽選する。
   */
  if (isTargetless) {
    const selectedAction = randomChoice(action.actions);

    applySkillAction(
      state,
      actor,
      skill,
      selectedAction,
      [],
      usedReelSlot,
      counterEvents,
      executionInfo,
      true,
    );

    return;
  }

  /**
   * 対象がいる場合は、対象ごとに候補を個別抽選する。
   *
   * 同じユニットがtargetsへ複数回入っている場合も、
   * 1回ごとに別々の抽選を行う。
   */
  for (const target of targets) {
    const selectedAction = randomChoice(action.actions);

    applySkillAction(
      state,
      actor,
      skill,
      selectedAction,
      [target],
      usedReelSlot,
      counterEvents,
      executionInfo,
      false,
    );
  }
}
