import type { SkillCategory } from "./skill";
import type { SkillId } from "./common";

export interface CounterEvent {
  attackerInstanceId: string;
  counterUnitInstanceId: string;

  sourceSkillId: SkillId;
  sourceSkillCategory: SkillCategory;
}

export interface SkillExecutionInfo {
  /**
   * この技処理中に、damage action の対象になったユニット。
   */
  damageTargetInstanceIds: Set<string>;
}
