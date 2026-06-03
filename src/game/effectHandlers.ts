import type { BattleState, BattleUnit, UsedReelSlot } from "../types/battle";
import type { EffectAction, SkillDefinition } from "../types/skill";
import { rollChance } from "../utils/random";
import { calculateDamage, getAttributeEffectivenessText } from "./damage";
import { addSpecialGauge, getOpponentTeam, getOwnTeam } from "./battleQueries";
import type { StatusEffectId } from "../types/statusEffect";
import { addStatusEffect } from "./statusEffects";

interface EffectContext {
  state: BattleState;
  actor: BattleUnit;
  skill: SkillDefinition;
  usedReelSlot: UsedReelSlot | null;
}

export function applyEffectAction(
  action: EffectAction,
  targets: BattleUnit[],
  context: EffectContext,
): void {
  switch (action.type) {
    case "damage":
      if (!rollChance(action.chance ?? 1)) {
        context.state.logs.unshift("しかし、ダメージ効果は発生しなかった。");
        return;
      }

      applyDamage(action, targets, context);
      return;

    case "heal":
      if (!rollChance(action.chance ?? 1)) {
        context.state.logs.unshift("しかし、回復効果は発生しなかった。");
        return;
      }

      applyHeal(action.amount, targets, context);
      return;

    case "change_reel":
      if (!rollChance(action.chance ?? 1)) {
        context.state.logs.unshift("しかし、リール変更は発生しなかった。");
        return;
      }

      applyChangeReel(action.amount, context);
      return;

    case "change_special_gauge":
      if (!rollChance(action.chance ?? 1)) {
        context.state.logs.unshift("しかし、ゲージ変更は発生しなかった。");
        return;
      }

      applyGaugeChange(action.targetTeam, action.amount, context);
      return;

    case "extra_action":
      if (!rollChance(action.chance ?? 1)) {
        context.state.logs.unshift("しかし、再行動は発生しなかった。");
        return;
      }

      applyExtraAction(context);
      return;

    case "replace_skill_on_target":
      if (!rollChance(action.chance ?? 1)) {
        context.state.logs.unshift("しかし、技変更は発生しなかった。");
        return;
      }

      applyReplaceSkillOnTarget(
        action.fromSkillId,
        action.toSkillId,
        targets,
        context,
      );
      return;

    case "replace_used_skill":
      if (!rollChance(action.chance ?? 1)) {
        context.state.logs.unshift("しかし、使用技変更は発生しなかった。");
        return;
      }

      applyReplaceUsedSkill(action.toSkillId, context);
      return;

    case "apply_status_effect":
      applyStatusEffect(
        action.statusEffectId,
        action.duration,
        action.chance ?? 1,
        targets,
        context,
      );
      return;

    case "do_nothing":
      context.state.logs.unshift(
        `${context.actor.definition.name} は何もしなかった。`,
      );
      return;
  }
}

function applyDamage(
  action: Extract<EffectAction, { type: "damage" }>,
  targets: BattleUnit[],
  context: EffectContext,
): void {
  for (const target of targets) {
    if (target.currentHp <= 0) continue;

    const calculation = calculateDamage({
      attacker: context.actor,
      defender: target,
      skill: context.skill,
      action,
    });

    const beforeHp = target.currentHp;
    target.currentHp = Math.max(0, target.currentHp - calculation.damage);

    context.state.logs.unshift(
      `${target.definition.name} に ${calculation.damage} ダメージ。`,
    );

    const effectivenessText = getAttributeEffectivenessText(
      calculation.attributeMultiplier,
    );

    if (effectivenessText) {
      context.state.logs.unshift(effectivenessText);
    }

    context.state.logs.unshift(
      `属性倍率: x${calculation.attributeMultiplier.toFixed(2)}`,
    );

    const targetTeam =
      target.side === "ally" ? context.state.allyTeam : context.state.enemyTeam;

    addSpecialGauge(targetTeam, 1);

    if (beforeHp > 0 && target.currentHp === 0) {
      context.state.logs.unshift(`${target.definition.name} は倒れた。`);

      addSpecialGauge(targetTeam, 1);
    }
  }
}

function applyHeal(
  amount: number,
  targets: BattleUnit[],
  context: EffectContext,
): void {
  for (const target of targets) {
    if (target.currentHp <= 0) continue;

    const beforeHp = target.currentHp;
    target.currentHp = Math.min(target.maxHp, target.currentHp + amount);

    const healed = target.currentHp - beforeHp;

    context.state.logs.unshift(
      `${target.definition.name} のHPが ${healed} 回復した。`,
    );
  }
}

function applyChangeReel(amount: number, context: EffectContext): void {
  const currentReelIndex = context.actor.currentReelIndex;
  const maxReelIndex = context.actor.reels.length - 1;

  const nextReelIndex = Math.max(
    0,
    Math.min(maxReelIndex, currentReelIndex + amount),
  );

  context.actor.currentReelIndex = nextReelIndex;

  if (nextReelIndex === currentReelIndex) {
    context.state.logs.unshift(
      `${context.actor.definition.name} のリールは ${nextReelIndex + 1} 番目のままだった。`,
    );
    return;
  }

  const directionText = amount > 0 ? "上がった" : "下がった";

  context.state.logs.unshift(
    `${context.actor.definition.name} のリールが ${nextReelIndex + 1} 番目に${directionText}。`,
  );
}

function applyGaugeChange(
  targetTeam: "ally" | "enemy" | "self_team" | "opponent_team",
  amount: number,
  context: EffectContext,
): void {
  if (targetTeam === "ally") {
    addSpecialGauge(context.state.allyTeam, amount);
    context.state.logs.unshift(
      `味方チームの必殺技ゲージが ${amount} 変化した。`,
    );
    return;
  }

  if (targetTeam === "enemy") {
    addSpecialGauge(context.state.enemyTeam, amount);
    context.state.logs.unshift(`敵チームの必殺技ゲージが ${amount} 変化した。`);
    return;
  }

  if (targetTeam === "self_team") {
    addSpecialGauge(getOwnTeam(context.state, context.actor), amount);
    context.state.logs.unshift(
      `${context.actor.definition.name} 側の必殺技ゲージが ${amount} 変化した。`,
    );
    return;
  }

  addSpecialGauge(getOpponentTeam(context.state, context.actor), amount);
  context.state.logs.unshift(
    `${context.actor.definition.name} の相手側の必殺技ゲージが ${amount} 変化した。`,
  );
}

function applyExtraAction(context: EffectContext): void {
  context.state.extraActionQueue.push(context.actor.instanceId);

  context.state.logs.unshift(
    `${context.actor.definition.name} は再行動できる！`,
  );
}

function applyReplaceSkillOnTarget(
  fromSkillId: string,
  toSkillId: string,
  targets: BattleUnit[],
  context: EffectContext,
): void {
  for (const target of targets) {
    let replacedCount = 0;

    for (const reel of target.reels) {
      for (let slotIndex = 0; slotIndex < reel.length; slotIndex++) {
        if (reel[slotIndex] === fromSkillId) {
          reel[slotIndex] = toSkillId;
          replacedCount++;
        }
      }
    }

    if (replacedCount > 0) {
      context.state.logs.unshift(
        `${target.definition.name} の技「${fromSkillId}」が ${replacedCount} 個「${toSkillId}」に変化した。`,
      );
    } else {
      context.state.logs.unshift(
        `${target.definition.name} は「${fromSkillId}」を持っていなかった。`,
      );
    }
  }
}

function applyReplaceUsedSkill(
  toSkillId: string,
  context: EffectContext,
): void {
  const usedReelSlot = context.usedReelSlot;

  if (!usedReelSlot) {
    context.state.logs.unshift("しかし、変更できる使用技スロットがなかった。");
    return;
  }

  const actor = context.actor;

  if (actor.instanceId !== usedReelSlot.actorInstanceId) {
    context.state.logs.unshift(
      "しかし、使用技スロットの情報が一致しなかった。",
    );
    return;
  }

  const reel = actor.reels[usedReelSlot.reelIndex];

  if (!reel) {
    context.state.logs.unshift("しかし、変更対象のリールが見つからなかった。");
    return;
  }

  const oldSkillId = reel[usedReelSlot.slotIndex];

  if (oldSkillId === undefined) {
    context.state.logs.unshift("しかし、変更対象の技枠が見つからなかった。");
    return;
  }

  reel[usedReelSlot.slotIndex] = toSkillId;

  context.state.logs.unshift(
    `${actor.definition.name} の使用した技枠が「${oldSkillId}」から「${toSkillId}」に変化した。`,
  );
}
function applyStatusEffect(
  statusEffectId: StatusEffectId,
  duration: number | undefined,
  chance: number,
  targets: BattleUnit[],
  context: EffectContext,
): void {
  for (const target of targets) {
    if (target.currentHp <= 0) continue;

    if (!rollChance(chance)) {
      //context.state.logs.unshift(`${target.definition.name} には${getStatusEffectName(statusEffectId)}が効かなかった。`,);
      continue;
    }

    addStatusEffect({
      target,
      statusEffectId,
      duration,
      sourceUnitInstanceId: context.actor.instanceId,
      sourceSkillId: context.skill.id,
      state: context.state,
    });
  }
}
