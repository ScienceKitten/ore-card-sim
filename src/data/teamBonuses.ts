import type { Attribute, Species } from "../types/common";
import type { StatBonus } from "../types/teamBonus";

export const attributeTeamBonuses: Partial<Record<Attribute, StatBonus>> = {
  wind: {
    speed: 4,
  },

  water: {
    speed: 2,
    attack: 2,
  },

  fire: {
    attack: 4,
  },

  earth: {
    maxHp: 10,
  },
};

export const speciesTeamBonuses: Partial<Record<Species, StatBonus>> = {
  dragon: {
    maxHp: 10,
  },

  knight: {
    attack: 4,
  },

  slime: {
    maxHp: 5,
  },
};
