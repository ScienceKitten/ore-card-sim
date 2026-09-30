import type { BattleState, BattleUnit } from "../types/battle";
import type { EffectOrigin } from "../types/effectExecution";
import type { DamageResolutionState } from "../types/skillExecution";
import {
  addSpecialGauge,
  getAllBattleUnits,
  getBattleUnitByInstanceId,
  getOwnTeam,
  updateBattleResult,
} from "./battleQueries";
import {
  getChargedAttackStatusEffect,
  removeStatusEffectInstance,
} from "./statusEffects";

export interface ApplyBattleDamageInput {
  state: BattleState;
  target: BattleUnit;
  amount: number;
  origin: EffectOrigin;

  /**
   * この処理解決単位で共有する死亡保留情報。
   */
  damageResolution: DamageResolutionState;

  /**
   * このダメージで被ダメージ側の必殺技ゲージを増やすか。
   */
  grantsSpecialGauge: boolean;

  damageMessage?: ((damage: number) => string) | null;
}

export interface AppliedBattleDamageResult {
  target: BattleUnit;
  calculatedDamage: number;
  actualDamage: number;
  beforeHp: number;
  afterHp: number;
  newlyReachedZeroHp: boolean;
}

export function applyBattleDamage(
  input: ApplyBattleDamageInput,
): AppliedBattleDamageResult {
  const calculatedDamage = Math.max(0, Math.floor(input.amount));

  const beforeHp = input.target.currentHp;

  /**
   * 処理解決開始時点で戦闘不能だったユニットには
   * ダメージを適用しない。
   */
  if (
    !canReceiveDeferredDamage(input.target, input.damageResolution) ||
    calculatedDamage <= 0
  ) {
    return {
      target: input.target,
      calculatedDamage,
      actualDamage: 0,
      beforeHp,
      afterHp: input.target.currentHp,
      newlyReachedZeroHp: false,
    };
  }

  input.target.currentHp = Math.max(
    0,
    input.target.currentHp - calculatedDamage,
  );

  const actualDamage = beforeHp - input.target.currentHp;

  /**
   * HP0の対象への追加ヒットでもログを出す。
   *
   * actualDamageは0でも、calculatedDamageは
   * 通常の計算結果を保持する。
   */
  if (input.damageMessage) {
    input.state.logs.unshift(input.damageMessage(calculatedDamage));
  }

  /**
   * HP0後の追加ヒットでも、
   * 仕様どおり被ダメージゲージを増加させる。
   */
  if (input.grantsSpecialGauge) {
    addSpecialGauge(getOwnTeam(input.state, input.target), 1);
  }

  /**
   * すべてのダメージでチャージ攻撃解除を判定する。
   */
  cancelChargedAttackByDamage(input.state, input.target, calculatedDamage);

  const newlyReachedZeroHp = beforeHp > 0 && input.target.currentHp === 0;

  if (newlyReachedZeroHp) {
    input.damageResolution.pendingDefeatUnitInstanceIds.add(
      input.target.instanceId,
    );
  }

  /**
   * ダメージチェーンは通常技によるダメージだけで発動。
   *
   * HP0後の追加ヒットでも発動する。
   */
  if (input.origin.type === "skill") {
    propagateDamageChain(
      input.state,
      input.target,
      calculatedDamage,
      input.damageResolution,
    );
  }

  return {
    target: input.target,
    calculatedDamage,
    actualDamage,
    beforeHp,
    afterHp: input.target.currentHp,
    newlyReachedZeroHp,
  };
}

function cancelChargedAttackByDamage(
  state: BattleState,
  target: BattleUnit,
  damage: number,
): void {
  const chargedAttack = getChargedAttackStatusEffect(target);

  if (!chargedAttack) {
    return;
  }

  const cancelDamage = chargedAttack.params.cancelDamage ?? 0;

  if (cancelDamage <= 0) {
    return;
  }

  /**
   * 「超える」場合だけ解除する。
   */
  if (damage <= cancelDamage) {
    return;
  }

  removeStatusEffectInstance(target, chargedAttack);

  state.logs.unshift(
    `${target.definition.name} のチャージ攻撃はダメージにより解除された。`,
  );
}

function getDamageChainStatusEffect(target: BattleUnit) {
  return target.statusEffects.find((statusEffect) => {
    return (
      statusEffect.id === "damage_chain" &&
      statusEffect.params?.type === "damage_chain"
    );
  });
}

function propagateDamageChain(
  state: BattleState,
  damagedUnit: BattleUnit,
  sourceCalculatedDamage: number,
  damageResolution: DamageResolutionState,
): void {
  const damageChain = getDamageChainStatusEffect(damagedUnit);

  const damageChainParams = damageChain?.params;

  /**
   * ダメージチェーン状態がない、
   * paramsがない、または別種類のparamsなら終了する。
   *
   * この判定後、damageChainParamsは
   * DamageChainStatusParams型に絞り込まれる。
   */
  if (!damageChainParams || damageChainParams.type !== "damage_chain") {
    return;
  }

  const multiplier = Math.max(0, damageChainParams.multiplier);

  const chainDamage = Math.floor(sourceCalculatedDamage * multiplier);

  if (chainDamage <= 0) {
    return;
  }

  const ownTeam = getOwnTeam(state, damagedUnit);

  const chainedTargets = ownTeam.units.filter((unit) => {
    return (
      unit.instanceId !== damagedUnit.instanceId &&
      damageResolution.initiallyAliveUnitInstanceIds.has(unit.instanceId)
    );
  });

  if (chainedTargets.length === 0) {
    return;
  }

  state.logs.unshift(
    `${damagedUnit.definition.name} のダメージチェーンが発動した。`,
  );

  for (const target of chainedTargets) {
    applyBattleDamage({
      state,
      target,
      amount: chainDamage,

      origin: {
        type: "direct",
        source: "status_effect",
      },

      damageResolution,

      grantsSpecialGauge: false,

      damageMessage: (damage) => {
        return `${target.definition.name} はダメージチェーンで ${damage} ダメージを受けた。`;
      },
    });
  }
}

export function createDamageResolutionState(
  state: BattleState,
): DamageResolutionState {
  const initiallyAliveUnitInstanceIds = new Set(
    getAllBattleUnits(state)
      .filter((unit) => {
        return unit.currentHp > 0;
      })
      .map((unit) => {
        return unit.instanceId;
      }),
  );

  return {
    initiallyAliveUnitInstanceIds,
    pendingDefeatUnitInstanceIds: new Set<string>(),
    defeatGaugeAwardedUnitInstanceIds: new Set<string>(),
  };
}

export function canReceiveDeferredDamage(
  target: BattleUnit,
  damageResolution: DamageResolutionState,
): boolean {
  return damageResolution.initiallyAliveUnitInstanceIds.has(target.instanceId);
}

export function finalizePendingDefeats(
  state: BattleState,
  damageResolution: DamageResolutionState,
): void {
  for (const unitInstanceId of damageResolution.pendingDefeatUnitInstanceIds) {
    const unit = getBattleUnitByInstanceId(state, unitInstanceId);

    if (!unit) {
      continue;
    }

    /**
     * 処理途中で回復してHPが戻った場合は、
     * 戦闘不能にしない。
     */
    if (unit.currentHp > 0) {
      continue;
    }

    state.logs.unshift(`${unit.definition.name} は倒れた。`);

    /**
     * 撃破時ゲージはユニットごとに1回だけ。
     */
    if (
      !damageResolution.defeatGaugeAwardedUnitInstanceIds.has(unit.instanceId)
    ) {
      addSpecialGauge(getOwnTeam(state, unit), 1);

      damageResolution.defeatGaugeAwardedUnitInstanceIds.add(unit.instanceId);
    }
  }

  damageResolution.pendingDefeatUnitInstanceIds.clear();

  updateBattleResult(state);
}
