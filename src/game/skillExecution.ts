import type { BattleUnit } from "../types/battle";
import type {
  SkillExecutionInfo,
  SkillExecutionSource,
} from "../types/skillExecution";
import { getTargetingModeByStatus } from "./statusEffects";

/**
 * 1回の技実行で使用する初期情報を作成する。
 *
 * 対象選択モードは技実行開始時に確定するため、
 * 技の途中で混乱が解除されても、この技の対象選択には影響しない。
 */
export function createSkillExecutionInfo(
  actor: BattleUnit,
  source: SkillExecutionSource,
): SkillExecutionInfo {
  return {
    source,
    targetingMode: getTargetingModeByStatus(actor),
    targetFallbackResolved: false,
    useOriginalTargetingForWholeSkill: false,
    damageTargetInstanceIds: new Set<string>(),
  };
}
