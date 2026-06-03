import type { Attribute, Gender, SkillId, Species, UnitId } from './common'

export interface UnitDefinition {
  id: UnitId
  name: string

  maxHp: number
  attack: number
  speed: number

  species: Species
  attribute: Attribute
  gender: Gender

  /**
   * 最大4つの技リール。
   * 各リールには6つの技IDを入れる想定。
   */
  reels: SkillId[][]

  /**
   * 技リールとは別に持つ必殺技。
   */
  specialSkillId: SkillId
}