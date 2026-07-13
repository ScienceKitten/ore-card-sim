import type { Position, SkillId, TeamSide } from "./common";
import type { UnitDefinition } from "./unit";
import type { SkillDefinition } from "./skill";
import type { TeamBonusResult } from "./teamBonus";
import type { StatusEffectId, StatusEffectParams } from "./statusEffect";
import type { CounterEvent } from "./counter";
import type { SkillExecutionInfo } from "./skillExecution";

export interface BattleUnit {
  instanceId: string;
  definition: UnitDefinition;
  side: TeamSide;
  position: Position;

  maxHp: number;
  attack: number;
  speed: number;

  currentHp: number;
  currentReelIndex: number;
  reels: SkillId[][];

  statusEffects: BattleStatusEffect[];
}

export interface UsedReelSlot {
  actorInstanceId: string;
  reelIndex: number;
  slotIndex: number;
  skillId: SkillId;
}

export interface BattleStatusEffect {
  id: StatusEffectId;
  remainingTurns: number;
  sourceUnitInstanceId: string;
  sourceSkillId: SkillId;

  /**
   * カウンター状態など、追加設定が必要な状態異常用。
   */
  params?: StatusEffectParams;
}

export interface BattleTeam {
  side: TeamSide;
  units: BattleUnit[];
  specialGauge: number;
  teamBonuses: TeamBonusResult[];
}

export interface PendingTargetSelection {
  actorInstanceId: string;
  skill: SkillDefinition;
  effectIndex: number;
  selectableTargetInstanceIds: string[];
  usedReelSlot: UsedReelSlot | null;

  /**
   * 対象選択で技処理が一時停止した時点までに記録されたカウンター候補。
   */
  counterEvents: CounterEvent[];
  executionInfo: SkillExecutionInfo;
}

export interface BattleState {
  allyTeam: BattleTeam;
  enemyTeam: BattleTeam;

  turn: number;
  activeUnitInstanceId: string | null;
  actedUnitInstanceIds: string[];

  pendingTargetSelection: PendingTargetSelection | null;
  lastRolledReelSlot: UsedReelSlot | null;
  extraActionQueue: string[];

  logs: string[];

  result: BattleResult;
}

export type BattleResult =
  | { status: "in_progress" }
  | { status: "ally_win" }
  | { status: "enemy_win" }
  | { status: "draw" };

export interface LastRolledReelSlot {
  actorInstanceId: string;
  reelIndex: number;
  slotIndex: number;
  skillId: string;
}
