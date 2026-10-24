import type { BattleStatusEffect, BattleUnit } from "../types/battle";
import type { SkillId } from "../types/common";
import type {
  CommandChangeBattleStatusEffect,
  CommandChangeSlot,
  CommandChangeStatusParams,
} from "../types/statusEffect";

/**
 * 指定された状態異常が、
 * 有効なコマンド変化かを判定する。
 */
export function isCommandChangeStatusEffect(
  statusEffect: BattleStatusEffect,
): statusEffect is CommandChangeBattleStatusEffect {
  return (
    statusEffect.id === "command_change" &&
    statusEffect.params?.type === "command_change" &&
    Array.isArray(statusEffect.params.changedSlots)
  );
}

/**
 * ユニットが持つコマンド変化を取得する。
 *
 * コマンド変化は同時に1件だけ保持する仕様だが、
 * 不正データで複数存在する場合は
 * 配列上で最後のものを採用する。
 */
export function getCommandChangeStatusEffect(
  unit: BattleUnit,
): CommandChangeBattleStatusEffect | null {
  for (let index = unit.statusEffects.length - 1; index >= 0; index--) {
    const statusEffect = unit.statusEffects[index];

    if (isCommandChangeStatusEffect(statusEffect)) {
      return statusEffect;
    }
  }

  return null;
}

/**
 * 指定リールの実効内容を返す。
 *
 * BattleUnit.reels自体は変更せず、
 * 基礎リールを複製してから
 * コマンド変化を一時的に上書きする。
 */
export function getEffectiveReel(
  unit: BattleUnit,
  reelIndex: number,
): SkillId[] {
  const baseReel = unit.reels[reelIndex];

  if (!baseReel) {
    return [];
  }

  const effectiveReel: SkillId[] = [...baseReel];

  const commandChange = getCommandChangeStatusEffect(unit);

  if (!commandChange) {
    return effectiveReel;
  }

  for (const changedSlot of commandChange.params.changedSlots) {
    if (changedSlot.reelIndex !== reelIndex) {
      continue;
    }

    if (
      changedSlot.slotIndex < 0 ||
      changedSlot.slotIndex >= effectiveReel.length
    ) {
      continue;
    }

    effectiveReel[changedSlot.slotIndex] = commandChange.params.skillId;
  }

  return effectiveReel;
}

/**
 * すべての実効リールを返す。
 *
 * UIなどで全リールを表示する場合に使用する。
 */
export function getEffectiveReels(unit: BattleUnit): SkillId[][] {
  return unit.reels.map((_, reelIndex) => {
    return getEffectiveReel(unit, reelIndex);
  });
}

/**
 * コマンド変化に使用するランダムな枠を生成する。
 *
 * 各リールについて、
 * 基礎コマンドが変更先skillIdと異なる枠から
 * 最大count件を重複なしで選ぶ。
 */
export function createCommandChangeSlots(
  unit: BattleUnit,
  skillId: SkillId,
  count: number,
): CommandChangeSlot[] {
  const normalizedCount = Math.max(0, Math.trunc(count));

  if (normalizedCount === 0) {
    return [];
  }

  const changedSlots: CommandChangeSlot[] = [];

  for (let reelIndex = 0; reelIndex < unit.reels.length; reelIndex++) {
    const reel = unit.reels[reelIndex];

    const candidateSlotIndexes: number[] = [];

    for (let slotIndex = 0; slotIndex < reel.length; slotIndex++) {
      /**
       * コマンド変化は基礎リールを基準に抽選する。
       *
       * 変更先とすでに同じ枠は候補にしない。
       */
      if (reel[slotIndex] !== skillId) {
        candidateSlotIndexes.push(slotIndex);
      }
    }

    shuffleInPlace(candidateSlotIndexes);

    const selectedIndexes = candidateSlotIndexes.slice(0, normalizedCount);

    for (const slotIndex of selectedIndexes) {
      changedSlots.push({
        reelIndex,
        slotIndex,
      });
    }
  }

  return changedSlots;
}

/**
 * Fisher-Yates方式で配列をシャッフルする。
 */
function shuffleInPlace<T>(values: T[]): void {
  for (let index = values.length - 1; index > 0; index--) {
    const randomIndex = Math.floor(Math.random() * (index + 1));

    [values[index], values[randomIndex]] = [values[randomIndex], values[index]];
  }
}

/**
 * 状態異常へ保存するパラメータを複製する。
 */
export function cloneCommandChangeStatusParams(
  params: CommandChangeStatusParams,
): CommandChangeStatusParams {
  return {
    type: "command_change",
    skillId: params.skillId,
    count: params.count,
    changedSlots: params.changedSlots?.map((slot) => ({
      reelIndex: slot.reelIndex,
      slotIndex: slot.slotIndex,
    })),
  };
}
