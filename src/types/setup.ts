
import type { UnitId } from './common'

export interface TeamSelection {
  leader: UnitId
  left: UnitId
  right: UnitId
}

export interface BattleSetup {
  ally: TeamSelection
  enemy: TeamSelection
}
