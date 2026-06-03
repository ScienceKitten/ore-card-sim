import type { Attribute, Species } from "./common";

export interface StatBonus {
  maxHp?: number;
  attack?: number;
  speed?: number;
}

export type TeamBonusKind = "attribute" | "species";

export interface TeamBonusResult {
  kind: TeamBonusKind;
  key: Attribute | Species;
  bonus: StatBonus;
  label: string;
}
