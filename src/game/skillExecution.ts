import type { BattleState, BattleUnit } from "../types/battle";
import type {
  SkillExecutionInfo,
  SkillExecutionSource,
} from "../types/skillExecution";
import { createDamageResolutionState } from "./battleDamage";
import { getTargetingModeByStatus } from "./statusEffects";

export function createSkillExecutionInfo(
  state: BattleState,
  actor: BattleUnit,
  source: SkillExecutionSource,
): SkillExecutionInfo {
  return {
    source,
    targetingMode: getTargetingModeByStatus(actor),
    targetFallbackResolved: false,
    useOriginalTargetingForWholeSkill: false,
    damageTargetInstanceIds: new Set<string>(),

    damageResolution: createDamageResolutionState(state),
  };
}
