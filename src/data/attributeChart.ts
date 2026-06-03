import type { Attribute } from '../types/common'

export const ATTRIBUTE_EFFECTIVENESS_DEFAULT = 1

/**
 * 攻撃属性 → 防御属性 → 倍率
 *
 * 未定義の組み合わせは等倍として扱う。
 */
export const attributeChart: Record<Attribute, Partial<Record<Attribute, number>>> = {
  fire: {
    water: 1.5,
    wind: 0.8,
    earth: 0.9,
  },

  water: {
    fire: 0.8,
    wind: 0.9,
    earth: 1.5,
  },

  wind: {
    fire: 1.5,
    water: 0.9,
    earth: 0.8,
  },

  earth: {
    fire: 0.9,
    water: 0.8,
    wind: 1.5,
  },

  heat: {
    water: 0.9,
    wind: 1.4,
    earth: 0.9,
  },

  ice: {
    fire: 1.4,
    wind: 0.9,
    earth: 0.9,
  },

  thunder: {
    fire: 0.9,
    water: 0.9,
    earth: 1.4,
  },

  poison: {
    fire: 0.9,
    water: 1.4,
    wind: 0.9,
  },

  none: {},
}