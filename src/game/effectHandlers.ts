import type { BattleState, BattleUnit, UsedReelSlot } from "../types/battle";
import type { EffectAction, SkillDefinition } from "../types/skill";
import { rollChance } from "../utils/random";
import { calculateDamage, getAttributeEffectivenessText } from "./damage";
import {
  addSpecialGauge,
  getTargetTeam,
  resolveTargetTeam,
} from "./battleQueries";
import type {
  StatusEffectCategory,
  StatusEffectId,
  StatusEffectParams,
} from "../types/statusEffect";
import {
  addStatusEffect,
  getStatusEffectName,
  removeStatusEffectsByCondition,
} from "./statusEffects";
import type { SkillId } from "../types/common";
import { applyHealing } from "./healing";
import type { EffectOrigin } from "../types/effectExecution";
import { applyBattleDamage } from "./battleDamage";
import type {
  DamageResolutionState,
  TargetingMode,
} from "../types/skillExecution";

interface EffectContext {
  state: BattleState;
  actor: BattleUnit;

  /**
   * 属性・カテゴリ・技名などの参照用。
   *
   * direct効果でも、計算の基準として技情報を
   * 持つ場合がある。
   */
  skill: SkillDefinition;

  /**
   * 技による実行か、技を介さない直接実行か。
   */
  origin: EffectOrigin;

  usedReelSlot: UsedReelSlot | null;
  /**
   * 一連の技・直接効果内で共有する死亡保留情報。
   */
  damageResolution: DamageResolutionState;
  targetingMode: TargetingMode;
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

    case "reduce_hp_rate":
      if (!rollChance(action.chance ?? 1)) {
        context.state.logs.unshift("しかし、HP割合減少は発生しなかった。");
        return;
      }

      applyReduceHpRate(action, targets, context);
      return;

    case "change_reel":
      if (!rollChance(action.chance ?? 1)) {
        context.state.logs.unshift("しかし、リール変更は発生しなかった。");
        return;
      }

      applyChangeReel(action.amount, targets, context);
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
        action.category,
        action.params,
        action.chance ?? 1,
        targets,
        context,
      );
      return;

    case "remove_status_effect":
      applyRemoveStatusEffect(
        action.statusEffectIds,
        action.categories,
        action.sourceSkillIds,
        action.chance ?? 1,
        targets,
        context,
      );

      return;

    case "drain":
      if (!rollChance(action.chance ?? 1)) {
        context.state.logs.unshift("しかし、ドレイン効果は発生しなかった。");
        return;
      }

      applyDrain(action, targets, context);
      return;

    case "do_nothing":
      context.state.logs.unshift(
        `${context.actor.definition.name} は何もしなかった。`,
      );
      return;

    case "random_action":
      context.state.logs.unshift(
        "ランダム効果を直接実行することはできません。",
      );
      return;

    case "conditional_action":
      context.state.logs.unshift("分岐効果を直接実行することはできません。");
      return;

    case "summon":
      context.state.logs.unshift("召喚効果を直接実行することはできません。");
      return;
  }
}

function applyDamage(
  action: Extract<EffectAction, { type: "damage" }>,
  targets: BattleUnit[],
  context: EffectContext,
): AppliedDamageResult[] {
  const results: AppliedDamageResult[] = [];

  for (const target of targets) {
    const calculation = calculateDamage({
      attacker: context.actor,
      defender: target,
      skill: context.skill,
      action,
      origin: context.origin,
    });

    /**
     * HP減少とダメージ副作用を
     * 共通処理へ委譲する。
     */
    const damageResult = applyBattleDamage({
      state: context.state,
      target,
      amount: calculation.damage,
      origin: context.origin,
      damageResolution: context.damageResolution,
      grantsSpecialGauge: true,

      damageMessage: (damage) => {
        return `${target.definition.name} に ${damage} ダメージ。`;
      },
    });

    results.push({
      target,
      calculatedDamage: calculation.damage,
      actualDamage: damageResult.actualDamage,
      beforeHp: damageResult.beforeHp,
      afterHp: damageResult.afterHp,
    });

    const effectivenessText = getAttributeEffectivenessText(
      calculation.attributeMultiplier,
    );

    if (effectivenessText) {
      context.state.logs.unshift(effectivenessText);
    }

    context.state.logs.unshift(
      `属性倍率: x${calculation.attributeMultiplier.toFixed(2)}`,
    );

    if (calculation.undeadCategoryMultiplier !== 1) {
      context.state.logs.unshift(
        `アンデッド種族補正: x${calculation.undeadCategoryMultiplier.toFixed(2)}`,
      );
    }
  }

  return results;
}

function applyHeal(
  amount: number,
  targets: BattleUnit[],
  context: EffectContext,
): void {
  for (const target of targets) {
    const result = applyHealing({
      state: context.state,
      healer: context.actor,
      target,
      amount,
      sourceType: "skill",
      skill: context.skill,
    });

    if (result.invalidTarget) {
      continue;
    }

    if (result.blocked) {
      context.state.logs.unshift(
        `${target.definition.name} の回復は無効化された。`,
      );

      continue;
    }

    context.state.logs.unshift(
      `${target.definition.name} のHPが ${result.actualAmount} 回復した。`,
    );
  }
}

function applyChangeReel(
  amount: number,
  targets: BattleUnit[],
  context: EffectContext,
): void {
  const effectiveTargets = targets.length > 0 ? targets : [context.actor];

  for (const target of effectiveTargets) {
    if (target.currentHp <= 0) continue;

    const currentReelIndex = target.currentReelIndex;
    const maxReelIndex = target.reels.length - 1;

    const nextReelIndex = Math.max(
      0,
      Math.min(maxReelIndex, currentReelIndex + amount),
    );

    target.currentReelIndex = nextReelIndex;

    if (nextReelIndex === currentReelIndex) {
      context.state.logs.unshift(
        `${target.definition.name} のリールは ${nextReelIndex + 1} 番目のままだった。`,
      );
      continue;
    }

    const directionText = amount > 0 ? "上がった" : "下がった";

    context.state.logs.unshift(
      `${target.definition.name} のリールが ${nextReelIndex + 1} 番目に${directionText}。`,
    );
  }
}

function applyGaugeChange(
  targetTeam: Extract<
    EffectAction,
    {
      type: "change_special_gauge";
    }
  >["targetTeam"],
  amount: number,
  context: EffectContext,
): void {
  const resolvedTargetTeam = resolveTargetTeam(
    targetTeam,
    context.targetingMode,
  );

  const team = getTargetTeam(
    context.state,
    context.actor,
    targetTeam,
    context.targetingMode,
  );

  addSpecialGauge(team, amount);

  /**
   * ログも技データ上の指定ではなく、
   * 混乱反転後の実際の対象チームを基準にする。
   */
  if (resolvedTargetTeam === "self_team") {
    context.state.logs.unshift(
      `${context.actor.definition.name} 側の必殺技ゲージが ${amount} 変化した。`,
    );
    return;
  }

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
  category: StatusEffectCategory | undefined,
  params: StatusEffectParams | undefined,
  chance: number,
  targets: BattleUnit[],
  context: EffectContext,
): void {
  for (const target of targets) {
    if (target.currentHp <= 0) {
      continue;
    }

    if (!rollChance(chance)) {
      context.state.logs.unshift(
        `${target.definition.name} には${getStatusEffectName(statusEffectId)}が効かなかった。`,
      );

      continue;
    }

    addStatusEffect({
      target,
      statusEffectId,
      duration,
      category,
      params,
      sourceUnitInstanceId: context.actor.instanceId,
      sourceSkillId: context.skill.id,
      state: context.state,
    });
  }
}

function applyRemoveStatusEffect(
  statusEffectIds: StatusEffectId[] | undefined,
  categories: StatusEffectCategory[] | undefined,
  sourceSkillIds: SkillId[] | undefined,
  chance: number,
  targets: BattleUnit[],
  context: EffectContext,
): void {
  for (const target of targets) {
    if (target.currentHp <= 0) continue;

    if (!rollChance(chance)) {
      context.state.logs.unshift(
        `${target.definition.name} の状態異常解除は失敗した。`,
      );
      continue;
    }

    const removed = removeStatusEffectsByCondition(target, {
      statusEffectIds,
      categories,
      sourceSkillIds,
    });

    if (removed.length === 0) {
      context.state.logs.unshift(
        `${target.definition.name} から解除できる状態異常はなかった。`,
      );
      continue;
    }

    const removedNames = removed.map((statusEffect) => {
      return getStatusEffectName(statusEffect.id);
    });

    context.state.logs.unshift(
      `${target.definition.name} の ${removedNames.join("、")} が解除された。`,
    );
  }
}

interface AppliedDamageResult {
  target: BattleUnit;
  calculatedDamage: number;
  actualDamage: number;
  beforeHp: number;
  afterHp: number;
}

function applyDrain(
  action: Extract<EffectAction, { type: "drain" }>,
  targets: BattleUnit[],
  context: EffectContext,
): void {
  const damageAction: Extract<EffectAction, { type: "damage" }> = {
    type: "damage",
    multiplier: action.multiplier,
    variance: action.variance,
    chance: 1,
  };

  const damageResults = applyDamage(damageAction, targets, context);

  const totalCalculatedDamage = damageResults.reduce((total, result) => {
    return total + result.calculatedDamage;
  }, 0);

  if (totalCalculatedDamage <= 0) {
    context.state.logs.unshift(
      `${context.actor.definition.name} はHPを吸収できなかった。`,
    );
    return;
  }

  if (context.actor.currentHp <= 0) {
    context.state.logs.unshift(
      `${context.actor.definition.name} は倒れているためHPを吸収できなかった。`,
    );
    return;
  }

  const healAmount = Math.max(
    1,
    Math.floor(totalCalculatedDamage * action.healMultiplier),
  );

  const healingResult = applyHealing({
    state: context.state,
    healer: context.actor,
    target: context.actor,
    amount: healAmount,
    sourceType: "drain",
    skill: context.skill,
  });

  if (healingResult.invalidTarget) {
    context.state.logs.unshift(
      `${context.actor.definition.name} は倒れているためHPを吸収できなかった。`,
    );

    return;
  }

  if (healingResult.blocked) {
    context.state.logs.unshift(
      `${context.actor.definition.name} の回復は無効化された。`,
    );

    return;
  }

  if (healingResult.actualAmount <= 0) {
    context.state.logs.unshift(
      `${context.actor.definition.name} のHPは回復しなかった。`,
    );

    return;
  }

  context.state.logs.unshift(
    `${context.actor.definition.name} は ${healingResult.actualAmount} HPを吸収した。`,
  );
}

/**
 * 割合をログ表示用のパーセント文字列へ変換する。
 *
 * 例:
 * 0.5   -> "50"
 * 0.125 -> "12.5"
 * 1     -> "100"
 * 1.5   -> "150"
 *
 * 浮動小数点誤差による
 * 30.000000000000004のような表示を避ける。
 */
function formatRateAsPercent(rate: number): string {
  const percent = Math.round(rate * 100 * 1_000_000) / 1_000_000;

  return `${percent}`;
}

/**
 * 対象のHPを割合で直接減少させる。
 *
 * この処理はapplyBattleDamage()を通さない。
 * そのため、次の処理は発生しない。
 *
 * ・防御変化
 * ・属性相性
 * ・アンデッドの技カテゴリ倍率
 * ・被ダメージ時の必殺技ゲージ増加
 * ・ダメージチェーン
 * ・チャージ攻撃のダメージ解除
 * ・その他の被ダメージ時効果
 *
 * HPが0になった場合だけ、
 * 既存の死亡保留処理へ登録する。
 */
function applyReduceHpRate(
  action: Extract<
    EffectAction,
    {
      type: "reduce_hp_rate";
    }
  >,
  targets: BattleUnit[],
  context: EffectContext,
): void {
  /**
   * NaNやInfinityは技データ不正として不発にする。
   */
  if (!Number.isFinite(action.rate)) {
    context.state.logs.unshift("しかし、HP割合減少の割合が不正だった。");
    return;
  }

  /**
   * 負数は0として扱う。
   * 1を超える割合はそのまま許可する。
   */
  const normalizedRate = Math.max(0, action.rate);

  /**
   * 未指定時は現在HP基準。
   */
  const basedOnCurrentHp = action.basedOnCurrentHp ?? true;

  const baseLabel = basedOnCurrentHp ? "現在HP" : "最大HP";

  const percentText = formatRateAsPercent(normalizedRate);

  for (const target of targets) {
    const beforeHp = target.currentHp;

    /**
     * 現在HP基準の場合は、
     * 各効果適用時点のcurrentHpを使う。
     *
     * 最大HP基準の場合は、
     * 常にmaxHpを使う。
     */
    const baseHp = basedOnCurrentHp ? target.currentHp : target.maxHp;

    /**
     * 減少量の小数点以下は
     * 切り捨てる。
     */
    const reductionAmount = Math.floor(baseHp * normalizedRate);

    /**
     * HPは0未満にならない。
     *
     * reductionAmountが現在HPを上回っても、
     * currentHpは0で停止する。
     */
    target.currentHp = Math.max(0, target.currentHp - reductionAmount);

    context.state.logs.unshift(
      `${target.definition.name}の体力は${baseLabel}の${percentText}％減少した。`,
    );

    /**
     * この効果によって、
     * 生存状態からHP0になった場合だけ
     * 死亡保留へ登録する。
     *
     * applyBattleDamage()は使用しないため、
     * ダメージ関連の副作用は発生しない。
     */
    if (beforeHp > 0 && target.currentHp <= 0) {
      context.damageResolution.pendingDefeatUnitInstanceIds.add(
        target.instanceId,
      );
    }
  }
}
