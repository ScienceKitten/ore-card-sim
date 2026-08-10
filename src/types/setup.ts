import type { ItemId, UnitId } from "./common";

export interface TeamSelection {
  leader: UnitId;
  left: UnitId;
  right: UnitId;

  items: {
    leader: ItemId | null;
    left: ItemId | null;
    right: ItemId | null;
  };
}

export interface BattleSetup {
  ally: TeamSelection;
  enemy: TeamSelection;

  reelProbabilityBiasEnabled: boolean;
}
