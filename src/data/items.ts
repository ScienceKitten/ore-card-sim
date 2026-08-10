import type { ItemDefinition } from "../types/item";

export const items: ItemDefinition[] = [
  {
    id: "knight_shield",
    name: "騎士の盾",
    statBonus: {
      maxHp: 30,
    },
    startStatusEffects: [],
  },
  {
    id: "knight_sword",
    name: "騎士の剣",
    statBonus: {
      attack: 4,
    },
    startStatusEffects: [],
  },
  {
    id: "speed_shoes",
    name: "スピードシューズ",
    statBonus: {
      speed: 4,
    },
    startStatusEffects: [],
  },
  {
    id: "heavy_sword",
    name: "オモタソード",
    statBonus: {
      attack: 6,
      speed: -20,
    },
    startStatusEffects: [],
  },
  {
    id: "heavy_metal_boots",
    name: "ヘヴィメタルブーツ",
    statBonus: {
      speed: -10,
    },
    startStatusEffects: [],
  },

  {
    id: "poison_orb",
    name: "毒のオーブ",
    statBonus: {},
    startStatusEffects: [
      {
        statusEffectId: "poison",
      },
    ],
  },
];
