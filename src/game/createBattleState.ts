import type { Position, TeamSide, UnitId } from "../types/common";
import type { UnitDefinition } from "../types/unit";
import type { BattleSetup, TeamSelection } from "../types/setup";
import type { BattleState, BattleTeam, BattleUnit } from "../types/battle";
import type { StatBonus } from "../types/teamBonus";
import { findNextActor } from "./turnManager";
import {
  formatStatBonus,
  getTeamBonusResults,
  sumStatBonuses,
} from "./teamBonus";
import { resolveUnableToActActiveUnits } from "./actionLifecycle";

const positions: Position[] = ["leader", "left", "right"];

function findUnitDefinition(
  units: UnitDefinition[],
  unitId: UnitId,
): UnitDefinition {
  const unit = units.find((unit) => unit.id === unitId);

  if (!unit) {
    throw new Error(`ユニットID "${unitId}" が見つかりません。`);
  }

  return unit;
}

function cloneReels(reels: string[][]): string[][] {
  return reels.map((reel) => [...reel]);
}

function createBattleUnit(
  unitDefinition: UnitDefinition,
  side: TeamSide,
  position: Position,
  teamBonus: Required<StatBonus>,
): BattleUnit {
  const maxHp = Math.max(1, unitDefinition.maxHp + teamBonus.maxHp);
  const attack = Math.max(0, unitDefinition.attack + teamBonus.attack);
  const speed = Math.max(0, unitDefinition.speed + teamBonus.speed);

  return {
    instanceId: `${side}-${position}-${unitDefinition.id}`,
    definition: unitDefinition,
    side,
    position,

    maxHp,
    attack,
    speed,

    currentHp: maxHp,
    currentReelIndex: 0,
    reels: cloneReels(unitDefinition.reels),
    statusEffects: [],
  };
}

function createBattleTeam(
  side: TeamSide,
  selection: TeamSelection,
  units: UnitDefinition[],
): BattleTeam {
  const selectedUnitDefinitions = positions.map((position) => {
    const unitId = selection[position];
    return findUnitDefinition(units, unitId);
  });

  const teamBonuses = getTeamBonusResults(selectedUnitDefinitions);
  const totalBonus = sumStatBonuses(teamBonuses.map((result) => result.bonus));

  const battleUnits = positions.map((position, index) => {
    const unitDefinition = selectedUnitDefinitions[index];

    return createBattleUnit(unitDefinition, side, position, totalBonus);
  });

  return {
    side,
    units: battleUnits,
    specialGauge: 0,
    teamBonuses,
  };
}

function createTeamBonusLogs(team: BattleTeam): string[] {
  if (team.teamBonuses.length === 0) {
    return [];
  }

  const sideLabel = team.side === "ally" ? "味方" : "敵";

  return team.teamBonuses.map((bonus) => {
    return `${sideLabel}チームに${bonus.label}発動: ${formatStatBonus(bonus.bonus)}`;
  });
}

export function createBattleState(
  setup: BattleSetup,
  units: UnitDefinition[],
): BattleState {
  const allyTeam = createBattleTeam("ally", setup.ally, units);
  const enemyTeam = createBattleTeam("enemy", setup.enemy, units);

  const state: BattleState = {
    allyTeam,
    enemyTeam,
    turn: 1,
    activeUnitInstanceId: null,
    actedUnitInstanceIds: [],
    pendingTargetSelection: null,
    lastRolledReelSlot: null,
    extraActionQueue: [],

    /**
     * 古いセットアップに項目がない場合もオンとして扱う。
     */
    reelProbabilityBiasEnabled: setup.reelProbabilityBiasEnabled ?? true,

    logs: [
      ...createTeamBonusLogs(enemyTeam),
      ...createTeamBonusLogs(allyTeam),
      "ターン1開始。",
      "戦闘開始！",
    ],
    result: {
      status: "in_progress",
    },
  };

  const firstActor = findNextActor(state);
  state.activeUnitInstanceId = firstActor?.instanceId ?? null;

  resolveUnableToActActiveUnits(state);

  return state;
}
