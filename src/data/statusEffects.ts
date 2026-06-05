import type {
  StatusEffectDefinition,
  StatusEffectId,
} from "../types/statusEffect";

export const statusEffectDefinitions: Record<
  StatusEffectId,
  StatusEffectDefinition
> = {
  paralysis: {
    id: "paralysis",
    name: "麻痺",
    category: "harmful",
    defaultDuration: 1,
  },

  poison: {
    id: "poison",
    name: "毒",
    category: "harmful",
    defaultDuration: 99,
  },

  seal_physical: {
    id: "seal_physical",
    name: "物理封印",
    category: "harmful",
    defaultDuration: 3,
  },

  seal_magic: {
    id: "seal_magic",
    name: "魔法封印",
    category: "harmful",
    defaultDuration: 3,
  },

  seal_breath: {
    id: "seal_breath",
    name: "ブレス封印",
    category: "harmful",
    defaultDuration: 3,
  },

  seal_change_reel: {
    id: "seal_change_reel",
    name: "リール移動封印",
    category: "harmful",
    defaultDuration: 1,
  },

  counter: {
    id: "counter",
    name: "カウンター",
    category: "except",
    defaultDuration: 3,
  },
};
