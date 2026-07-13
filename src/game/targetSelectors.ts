import type { BattleState, BattleUnit } from "../types/battle";
import type { TargetSelector } from "../types/skill";
import { randomChoice } from "../utils/random";
import {
  getAliveUnits,
  getAllBattleUnits,
  getOpponentTeam,
  getOwnTeam,
} from "./battleQueries";
import type { TargetingMode } from "../types/skillExecution";

/**
 * includeSelf が true でない限り、使用者自身を候補から除外する。
 *
 * includeSelf 未指定時は false として扱う。
 */
function filterSelfFromCandidates(
  units: BattleUnit[],
  actor: BattleUnit,
  includeSelf: boolean | undefined,
): BattleUnit[] {
  if (includeSelf ?? false) {
    return units;
  }

  return units.filter((unit) => {
    return unit.instanceId !== actor.instanceId;
  });
}

/**
 * 候補から指定回数ランダムに対象を選ぶ。
 */
function selectRandomTargets(
  candidates: BattleUnit[],
  count: number,
  allowDuplicate: boolean,
): BattleUnit[] {
  if (candidates.length === 0 || count <= 0) {
    return [];
  }

  if (allowDuplicate) {
    return Array.from({ length: count }, () => {
      return randomChoice(candidates);
    });
  }

  return [...candidates].sort(() => Math.random() - 0.5).slice(0, count);
}

export function getSelectableTargets(
  state: BattleState,
  actor: BattleUnit,
  targetSelector: TargetSelector,
): BattleUnit[] {
  switch (targetSelector.type) {
    case "single_enemy":
      return getAliveUnits(getOpponentTeam(state, actor).units);

    case "single_ally": {
      const allies = getAliveUnits(getOwnTeam(state, actor).units);

      return filterSelfFromCandidates(
        allies,
        actor,
        targetSelector.includeSelf,
      );
    }

    default:
      return [];
  }
}

export function needsManualTargetSelection(
  targetSelector: TargetSelector,
): boolean {
  return (
    targetSelector.type === "single_enemy" ||
    targetSelector.type === "single_ally"
  );
}

export function selectTargetsAutomatically(
  state: BattleState,
  actor: BattleUnit,
  targetSelector: TargetSelector,
): BattleUnit[] {
  switch (targetSelector.type) {
    case "single_enemy": {
      const enemies = getAliveUnits(getOpponentTeam(state, actor).units);

      return enemies.length > 0 ? [randomChoice(enemies)] : [];
    }

    case "single_ally": {
      const aliveAllies = getAliveUnits(getOwnTeam(state, actor).units);

      const candidates = filterSelfFromCandidates(
        aliveAllies,
        actor,
        targetSelector.includeSelf,
      );

      return candidates.length > 0 ? [randomChoice(candidates)] : [];
    }

    case "all_enemies":
      return getAliveUnits(getOpponentTeam(state, actor).units);

    case "all_allies": {
      const aliveAllies = getAliveUnits(getOwnTeam(state, actor).units);

      return filterSelfFromCandidates(
        aliveAllies,
        actor,
        targetSelector.includeSelf,
      );
    }

    case "random_enemies": {
      const enemies = getAliveUnits(getOpponentTeam(state, actor).units);

      return selectRandomTargets(
        enemies,
        targetSelector.count,
        targetSelector.allowDuplicate,
      );
    }

    case "self":
      return actor.currentHp > 0 ? [actor] : [];

    case "random_all_units": {
      const aliveUnits = getAliveUnits(getAllBattleUnits(state));

      const candidates = filterSelfFromCandidates(
        aliveUnits,
        actor,
        targetSelector.includeSelf,
      );

      return selectRandomTargets(
        candidates,
        targetSelector.count,
        targetSelector.allowDuplicate,
      );
    }

    case "random_allies": {
      const aliveAllies = getAliveUnits(getOwnTeam(state, actor).units);

      const candidates = filterSelfFromCandidates(
        aliveAllies,
        actor,
        targetSelector.includeSelf,
      );

      return selectRandomTargets(
        candidates,
        targetSelector.count,
        targetSelector.allowDuplicate,
      );
    }

    case "none":
      return [];
  }
}

/**
 * 技データに定義された対象選択を、
 * 技実行中の対象選択モードに従って変換する。
 *
 * この関数は元のtargetSelectorを変更せず、
 * 必要に応じて新しいTargetSelectorを返す。
 */
export function resolveTargetSelector(
  targetSelector: TargetSelector,
  targetingMode: TargetingMode,
): TargetSelector {
  switch (targetingMode) {
    case "normal":
      return targetSelector;

    case "reverse_team":
      return reverseTeamTargetSelector(targetSelector);
  }
}

/**
 * 敵と味方を反転した対象選択を返す。
 *
 * 混乱状態などで使用する。
 *
 * 変換対象にならないself、none、random_all_unitsは
 * 元の対象選択をそのまま返す。
 */
function reverseTeamTargetSelector(
  targetSelector: TargetSelector,
): TargetSelector {
  switch (targetSelector.type) {
    /**
     * 敵1体を手動選択
     * ↓
     * 自分以外の味方からランダムに1体
     */
    case "single_enemy":
      return {
        type: "random_allies",
        count: 1,
        allowDuplicate: false,
        includeSelf: false,
      };

    /**
     * 味方1体を手動選択
     * ↓
     * 敵からランダムに1体
     *
     * 元のincludeSelfは、敵対象へ変換されるため引き継がない。
     */
    case "single_ally":
      return {
        type: "random_enemies",
        count: 1,
        allowDuplicate: false,
      };

    /**
     * 敵全員
     * ↓
     * 自分以外の味方全員
     */
    case "all_enemies":
      return {
        type: "all_allies",
        includeSelf: false,
      };

    /**
     * 味方全員、または自分以外の味方全員
     * ↓
     * 敵全員
     *
     * 元のincludeSelfは、敵対象へ変換されるため引き継がない。
     */
    case "all_allies":
      return {
        type: "all_enemies",
      };

    /**
     * 敵からランダムに複数回
     * ↓
     * 自分以外の味方からランダムに同じ回数
     *
     * countとallowDuplicateは維持する。
     */
    case "random_enemies":
      return {
        type: "random_allies",
        count: targetSelector.count,
        allowDuplicate: targetSelector.allowDuplicate,
        includeSelf: false,
      };

    /**
     * 味方からランダムに複数回
     * ↓
     * 敵からランダムに同じ回数
     *
     * countとallowDuplicateは維持する。
     * 元のincludeSelfは敵対象では意味がないため引き継がない。
     */
    case "random_allies":
      return {
        type: "random_enemies",
        count: targetSelector.count,
        allowDuplicate: targetSelector.allowDuplicate,
      };

    default:
      return targetSelector;
  }
}
/**
 * 指定された対象選択で、実行可能な対象が存在するか確認する。
 *
 * ランダム選択そのものは行わないため、
 * 対象存在確認によって乱数を消費しない。
 */
export function hasAvailableTargets(
  state: BattleState,
  actor: BattleUnit,
  targetSelector: TargetSelector,
): boolean {
  switch (targetSelector.type) {
    case "single_enemy":
    case "all_enemies":
      return getAliveUnits(getOpponentTeam(state, actor).units).length > 0;

    case "random_enemies":
      return (
        targetSelector.count > 0 &&
        getAliveUnits(getOpponentTeam(state, actor).units).length > 0
      );

    case "single_ally":
    case "all_allies": {
      const allies = getAliveUnits(getOwnTeam(state, actor).units);

      const candidates = filterSelfFromCandidates(
        allies,
        actor,
        targetSelector.includeSelf,
      );

      return candidates.length > 0;
    }

    case "random_allies": {
      if (targetSelector.count <= 0) {
        return false;
      }

      const allies = getAliveUnits(getOwnTeam(state, actor).units);

      const candidates = filterSelfFromCandidates(
        allies,
        actor,
        targetSelector.includeSelf,
      );

      return candidates.length > 0;
    }

    case "random_all_units": {
      if (targetSelector.count <= 0) {
        return false;
      }

      const allUnits = getAliveUnits(getAllBattleUnits(state));

      const candidates = filterSelfFromCandidates(
        allUnits,
        actor,
        targetSelector.includeSelf,
      );

      return candidates.length > 0;
    }

    case "self":
      return actor.currentHp > 0;

    /**
     * 対象なし効果は、そもそも対象を必要としないため
     * 実行可能として扱う。
     */
    case "none":
      return true;
  }
}

/**
 * 指定された対象選択が、現在の対象選択モードによって
 * 実際に変更されるか判定する。
 *
 * 混乱時の対象不在救済抽選は、
 * 対象選択が混乱によって変更された場合だけ行う。
 */
export function isTargetSelectorAffectedByMode(
  targetSelector: TargetSelector,
  targetingMode: TargetingMode,
): boolean {
  if (targetingMode === "normal") {
    return false;
  }

  switch (targetSelector.type) {
    case "single_enemy":
    case "single_ally":
    case "all_enemies":
    case "all_allies":
    case "random_enemies":
    case "random_allies":
      return true;

    default:
      return false;
  }
}
