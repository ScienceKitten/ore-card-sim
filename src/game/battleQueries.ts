import type { BattleState, BattleTeam, BattleUnit } from "../types/battle";
import type { TeamSide } from "../types/common";

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
