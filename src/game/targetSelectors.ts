import type { BattleState, BattleUnit } from '../types/battle'
import type { TargetSelector } from '../types/skill'
import { randomChoice } from '../utils/random'
import {
  getAliveUnits,
  getAllBattleUnits,
  getOpponentTeam,
  getOwnTeam,
} from './battleQueries'

export function getSelectableTargets(
  state: BattleState,
  actor: BattleUnit,
  targetSelector: TargetSelector,
): BattleUnit[] {
  switch (targetSelector.type) {
    case 'single_enemy':
      return getAliveUnits(getOpponentTeam(state, actor).units)

    case 'single_ally_except_self':
      return getAliveUnits(getOwnTeam(state, actor).units)
        .filter((unit) => unit.instanceId !== actor.instanceId)

    default:
      return []
  }
}

export function needsManualTargetSelection(
  targetSelector: TargetSelector,
): boolean {
  return (
    targetSelector.type === 'single_enemy' ||
    targetSelector.type === 'single_ally_except_self'
  )
}

export function selectTargetsAutomatically(
  state: BattleState,
  actor: BattleUnit,
  targetSelector: TargetSelector,
): BattleUnit[] {
  switch (targetSelector.type) {
    case 'single_enemy': {
      const enemies = getAliveUnits(getOpponentTeam(state, actor).units)
      return enemies.length > 0 ? [randomChoice(enemies)] : []
    }

    case 'single_ally_except_self': {
      const allies = getAliveUnits(getOwnTeam(state, actor).units)
        .filter((unit) => unit.instanceId !== actor.instanceId)

      return allies.length > 0 ? [randomChoice(allies)] : []
    }

    case 'all_enemies':
      return getAliveUnits(getOpponentTeam(state, actor).units)

    
    case 'all_allies':
      return getAliveUnits(getOwnTeam(state, actor).units)


    case 'random_enemies': {
      const enemies = getAliveUnits(getOpponentTeam(state, actor).units)
      if (enemies.length === 0) return []

      if (targetSelector.allowDuplicate) {
        return Array.from({ length: targetSelector.count }, () => randomChoice(enemies))
      }

      return [...enemies]
        .sort(() => Math.random() - 0.5)
        .slice(0, targetSelector.count)
    }

    case 'self':
      return actor.currentHp > 0 ? [actor] : []

    case 'random_all_units': {
      const units = getAliveUnits(getAllBattleUnits(state))
      if (units.length === 0) return []

      if (targetSelector.allowDuplicate) {
        return Array.from({ length: targetSelector.count }, () => randomChoice(units))
      }

      return [...units]
        .sort(() => Math.random() - 0.5)
        .slice(0, targetSelector.count)
    }

    case 'random_all_except_self': {
      const units = getAliveUnits(getAllBattleUnits(state))
        .filter((unit) => unit.instanceId !== actor.instanceId)

      if (units.length === 0) return []

      if (targetSelector.allowDuplicate) {
        return Array.from({ length: targetSelector.count }, () => randomChoice(units))
      }

      return [...units]
        .sort(() => Math.random() - 0.5)
        .slice(0, targetSelector.count)
    }

    case 'none':
      return []
  }
}