import type { SkillCategory } from "./skill";
import type { SkillId } from "./common";

export interface CounterEvent {
  attackerInstanceId: string;
  counterUnitInstanceId: string;

  sourceSkillId: SkillId;
  sourceSkillCategory: SkillCategory;
}
