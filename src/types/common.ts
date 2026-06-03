export type Attribute =
  | 'fire'
  | 'water'
  | 'wind'
  | 'earth'
  | 'heat'
  | 'ice'
  | 'thunder'
  | 'poison'
  | 'none'

export type Gender = 'male' | 'female' | 'none' | 'unknown'

export type TeamSide = 'ally' | 'enemy'

export type Position = 'leader' | 'left' | 'right'

export type UnitId = string

export type SkillId = string

export type Species = 
  | 'dragon'
  | 'slime'
  | 'machine'
  | 'knight'
  | 'mage'
  | 'plant'
  | 'insect'
  | 'demon'
  | 'undead'


export const speciesLabels: Record<Species, string> = {
  dragon: 'ドラゴン',
  slime: 'スライム',
  machine: '機械',
  knight: '騎士',
  mage: '魔法使い',
  plant: '植物',
  insect: '昆虫',
  demon: '悪魔',
  undead: 'アンデッド',
}
