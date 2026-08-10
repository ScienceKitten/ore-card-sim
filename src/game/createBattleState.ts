import type { ItemId, Position, TeamSide, UnitId } from "../types/common";
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
import type { ItemDefinition } from "../types/item";
import { addStatusEffect } from "./statusEffects";
import { rollChance } from "../utils/random";

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
  item: ItemDefinition | null,
): BattleUnit {
  const itemMaxHp = item?.statBonus.maxHp ?? 0;

  const itemAttack = item?.statBonus.attack ?? 0;

  const itemSpeed = item?.statBonus.speed ?? 0;

  const maxHp = Math.max(1, unitDefinition.maxHp + teamBonus.maxHp + itemMaxHp);

  const attack = Math.max(
    0,
    unitDefinition.attack + teamBonus.attack + itemAttack,
  );

  const speed = Math.max(0, unitDefinition.speed + teamBonus.speed + itemSpeed);

  return {
    instanceId: `${side}-${position}-${unitDefinition.id}`,
    definition: unitDefinition,
    side,
    position,
    itemId: item?.id ?? null,

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
  items: ItemDefinition[],
): BattleTeam {
  const selectedUnitDefinitions = positions.map((position) => {
    const unitId = selection[position];
    return findUnitDefinition(units, unitId);
  });

  const teamBonuses = getTeamBonusResults(selectedUnitDefinitions);
  const totalBonus = sumStatBonuses(teamBonuses.map((result) => result.bonus));

  const battleUnits = positions.map((position, index) => {
    const unitDefinition = selectedUnitDefinitions[index];

    const itemId = selection.items[position];

    const item = findItemDefinition(items, itemId);

    return createBattleUnit(unitDefinition, side, position, totalBonus, item);
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
  items: ItemDefinition[],
): BattleState {
  const allyTeam = createBattleTeam("ally", setup.ally, units, items);

  const enemyTeam = createBattleTeam("enemy", setup.enemy, units, items);

  const state: BattleState = {
    allyTeam,
    enemyTeam,
    turn: 1,
    activeUnitInstanceId: null,
    actedUnitInstanceIds: [],
    pendingTargetSelection: null,
    lastRolledReelSlot: null,
    extraActionQueue: [],
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

  /**
   * 行動者決定前に開始時状態異常を付与する。
   */
  applyInitialItemStatusEffects(state, items);

  const firstActor = findNextActor(state);

  state.activeUnitInstanceId = firstActor?.instanceId ?? null;

  resolveUnableToActActiveUnits(state);

  return state;
}

function findItemDefinition(
  items: ItemDefinition[],
  itemId: ItemId | null,
): ItemDefinition | null {
  if (itemId === null) {
    return null;
  }

  return (
    items.find((item) => {
      return item.id === itemId;
    }) ?? null
  );
}

function applyInitialItemStatusEffects(
  state: BattleState,
  items: ItemDefinition[],
): void {
  const allUnits = [...state.allyTeam.units, ...state.enemyTeam.units];

  for (const unit of allUnits) {
    if (unit.itemId === null) {
      continue;
    }

    const item = findItemDefinition(items, unit.itemId);

    if (!item) {
      continue;
    }

    for (const statusEffect of item.startStatusEffects) {
      if (!rollChance(statusEffect.chance ?? 1)) {
        state.logs.unshift(
          `${unit.definition.name} は「${item.name}」の開始時効果を受けなかった。`,
        );

        continue;
      }

      addStatusEffect({
        target: unit,
        statusEffectId: statusEffect.statusEffectId,
        duration: statusEffect.duration,
        category: statusEffect.category,
        params: statusEffect.params,
        sourceUnitInstanceId: unit.instanceId,

        /**
         * アイテム由来状態異常用の疑似技ID。
         */
        sourceSkillId: `item:${item.id}`,

        state,
      });
    }
  }
}
