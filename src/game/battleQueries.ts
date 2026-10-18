import type { BattleState, BattleTeam, BattleUnit } from "../types/battle";
import type { TargetTeam, TeamSide } from "../types/common";
import type { TargetingMode } from "../types/skillExecution";

export function getAllBattleUnits(state: BattleState): BattleUnit[] {
  return [...state.allyTeam.units, ...state.enemyTeam.units];
}

export function getBattleUnitByInstanceId(
  state: BattleState,
  instanceId: string,
): BattleUnit | null {
  return (
    getAllBattleUnits(state).find((unit) => unit.instanceId === instanceId) ??
    null
  );
}

export function getActiveUnit(state: BattleState): BattleUnit | null {
  if (!state.activeUnitInstanceId) return null;

  return getBattleUnitByInstanceId(state, state.activeUnitInstanceId);
}

export function getTeamBySide(state: BattleState, side: TeamSide): BattleTeam {
  return side === "ally" ? state.allyTeam : state.enemyTeam;
}

export function getOwnTeam(state: BattleState, actor: BattleUnit): BattleTeam {
  return getTeamBySide(state, actor.side);
}

export function getOpponentTeam(
  state: BattleState,
  actor: BattleUnit,
): BattleTeam {
  return actor.side === "ally" ? state.enemyTeam : state.allyTeam;
}

export function getAliveUnits(units: BattleUnit[]): BattleUnit[] {
  return units.filter((unit) => unit.currentHp > 0);
}

export function addSpecialGauge(team: BattleTeam, amount: number): void {
  team.specialGauge = Math.max(0, Math.min(10, team.specialGauge + amount));
}

export function setSpecialGauge(team: BattleTeam, value: number): void {
  team.specialGauge = Math.max(0, Math.min(10, value));
}

export function updateBattleResult(state: BattleState): void {
  const allyAlive = state.allyTeam.units.some((unit) => unit.currentHp > 0);
  const enemyAlive = state.enemyTeam.units.some((unit) => unit.currentHp > 0);

  if (!allyAlive && !enemyAlive) {
    state.result = { status: "draw" };
    state.activeUnitInstanceId = null;
    state.logs.unshift("戦闘終了。引き分け！");
    return;
  }

  if (!allyAlive) {
    state.result = { status: "enemy_win" };
    state.activeUnitInstanceId = null;
    state.logs.unshift("戦闘終了。敵チームの勝利！");
    return;
  }

  if (!enemyAlive) {
    state.result = { status: "ally_win" };
    state.activeUnitInstanceId = null;
    state.logs.unshift("戦闘終了。味方チームの勝利！");
  }
}

export const DEFAULT_SPECIAL_GAUGE_CONSUMPTION = 10;

export function getSpecialGaugeConsumption(unit: BattleUnit): number {
  const configuredValue = unit.definition.specialGaugeConsumption;

  if (configuredValue === undefined) {
    return DEFAULT_SPECIAL_GAUGE_CONSUMPTION;
  }

  return Math.max(0, configuredValue);
}

/**
 * 使用者基準のTargetTeamから、
 * 実際の戦闘チームを取得する。
 *
 * 召喚、必殺技ゲージ変更など、
 * チームを直接対象とする効果で共通利用する。
 */
/**
 * TargetTeamと対象選択モードから、
 * 実際の戦闘チームを取得する。
 *
 * TargetTeamを使用する実行効果は、
 * 必ずこの関数を経由して対象チームを取得する。
 *
 * これにより、今後TargetTeamを使用する
 * 新しい実行効果を追加した場合も、
 * targetingModeを渡すだけで混乱による反転が適用される。
 */
export function getTargetTeam(
  state: BattleState,
  actor: BattleUnit,
  targetTeam: TargetTeam,
  targetingMode: TargetingMode,
): BattleTeam {
  const resolvedTargetTeam = resolveTargetTeam(targetTeam, targetingMode);

  switch (resolvedTargetTeam) {
    case "self_team":
      return getOwnTeam(state, actor);

    case "opponent_team":
      return getOpponentTeam(state, actor);
  }
}

/**
 * 技データに指定されたTargetTeamを、
 * 現在の対象選択モードに従って変換する。
 *
 * 混乱のreverse_teamでは、
 * self_teamとopponent_teamを反転する。
 *
 * normal:
 *   変更しない。
 *
 * reverse_team:
 *   self_team      -> opponent_team
 *   opponent_team  -> self_team
 *
 * randomize_single:
 *   ユニット単体対象だけをランダム化する
 *   トランス用モードなので、チーム対象は変更しない。
 */
export function resolveTargetTeam(
  targetTeam: TargetTeam,
  targetingMode: TargetingMode,
): TargetTeam {
  if (targetingMode !== "reverse_team") {
    return targetTeam;
  }

  return targetTeam === "self_team" ? "opponent_team" : "self_team";
}
