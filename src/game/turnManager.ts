import type { BattleState, BattleUnit } from "../types/battle";
import { addSpecialGauge } from "./battleQueries";

export function getAllBattleUnits(state: BattleState): BattleUnit[] {
  return [...state.allyTeam.units, ...state.enemyTeam.units];
}

export function isAlive(unit: BattleUnit): boolean {
  return unit.currentHp > 0;
}

export function hasActedThisTurn(
  state: BattleState,
  unit: BattleUnit,
): boolean {
  return state.actedUnitInstanceIds.includes(unit.instanceId);
}

export function getEffectiveSpeed(unit: BattleUnit): number {
  let speed = unit.speed;

  return speed;
}

function pickRandom<T>(items: T[]): T {
  const index = Math.floor(Math.random() * items.length);
  return items[index];
}

export function findNextActor(state: BattleState): BattleUnit | null {
  const candidates = getAllBattleUnits(state).filter((unit) => {
    return isAlive(unit) && !hasActedThisTurn(state, unit);
  });

  if (candidates.length === 0) {
    return null;
  }

  const maxSpeed = Math.max(
    ...candidates.map((unit) => getEffectiveSpeed(unit)),
  );

  const fastestUnits = candidates.filter((unit) => {
    return getEffectiveSpeed(unit) === maxSpeed;
  });

  return pickRandom(fastestUnits);
}

export function updateNextActor(state: BattleState): void {
  const nextActor = findNextActor(state);
  state.activeUnitInstanceId = nextActor?.instanceId ?? null;
}

export function markUnitAsActed(
  state: BattleState,
  unitInstanceId: string,
): void {
  if (!state.actedUnitInstanceIds.includes(unitInstanceId)) {
    state.actedUnitInstanceIds.push(unitInstanceId);
  }
}

export function proceedTurnIfNeeded(state: BattleState): void {
  const nextActor = findNextActor(state);

  if (nextActor) {
    state.activeUnitInstanceId = nextActor.instanceId;
    return;
  }

  // ここに来たら、そのターンに行動可能なユニットは全員行動済み。
  // ターン終了処理として、両チームの必殺技ゲージを1増やす。
  addSpecialGauge(state.allyTeam, 1);
  addSpecialGauge(state.enemyTeam, 1);

  state.logs.unshift("ターン終了。両チームの必殺技ゲージが1増えた。");

  state.turn += 1;
  state.actedUnitInstanceIds = [];

  state.logs.unshift(`ターン${state.turn}開始。`);

  updateNextActor(state);
}
