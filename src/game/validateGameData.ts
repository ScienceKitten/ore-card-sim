import type { UnitDefinition } from "../types/unit";
import type { EffectAction, SkillDefinition } from "../types/skill";

export function validateGameData(
  units: UnitDefinition[],
  skills: Record<string, SkillDefinition>,
): string[] {
  const errors: string[] = [];

  for (const unit of units) {
    for (const [reelIndex, reel] of unit.reels.entries()) {
      if (reel.length !== 6) {
        errors.push(
          `${unit.name} の ${reelIndex + 1} 番目のリールが6枠ではありません。現在 ${reel.length} 枠です。`,
        );
      }

      for (const skillId of reel) {
        if (!skills[skillId]) {
          errors.push(
            `${unit.name} のリールに未定義の技ID "${skillId}" があります。`,
          );
        }
      }
    }

    if (!skills[unit.specialSkillId]) {
      errors.push(
        `${unit.name} の必殺技ID "${unit.specialSkillId}" が未定義です。`,
      );
    }

    if (unit.reels.length > 4) {
      errors.push(
        `${unit.name} のリール数が4を超えています。現在 ${unit.reels.length} 個です。`,
      );
    }
  }

  const unitIds = new Set(
    units.map((unit) => {
      return unit.id;
    }),
  );

  for (const skill of Object.values(skills)) {
    for (const [effectIndex, effect] of skill.effects.entries()) {
      validateEffectActions(
        effect.actions,
        skill,
        effectIndex,
        unitIds,
        errors,
        "actions",
      );
    }
  }

  return errors;
}
function validateEffectActions(
  actions: EffectAction[],
  skill: SkillDefinition,
  effectIndex: number,
  unitIds: Set<string>,
  errors: string[],
  actionPath: string,
): void {
  for (const [actionIndex, action] of actions.entries()) {
    const currentPath = `${actionPath}[${actionIndex}]`;

    switch (action.type) {
      case "summon": {
        if (!unitIds.has(action.unitId)) {
          errors.push(
            `${skill.name} のエフェクト${effectIndex + 1}、${currentPath}に未定義の召喚ユニットID "${action.unitId}" があります。`,
          );
        }

        if (
          action.targetTeam !== "self_team" &&
          action.targetTeam !== "opponent_team"
        ) {
          errors.push(
            `${skill.name} のエフェクト${effectIndex + 1}、${currentPath}のtargetTeamが不正です。`,
          );
        }

        validateEffectActions(
          action.actions ?? [],
          skill,
          effectIndex,
          unitIds,
          errors,
          `${currentPath}.actions`,
        );

        break;
      }

      case "change_special_gauge": {
        if (
          action.targetTeam !== "self_team" &&
          action.targetTeam !== "opponent_team"
        ) {
          errors.push(
            `${skill.name} のエフェクト${effectIndex + 1}、${currentPath}のtargetTeamが不正です。`,
          );
        }

        break;
      }

      case "random_action": {
        validateEffectActions(
          action.actions,
          skill,
          effectIndex,
          unitIds,
          errors,
          `${currentPath}.actions`,
        );

        break;
      }

      case "conditional_action": {
        validateEffectActions(
          action.matchedActions,
          skill,
          effectIndex,
          unitIds,
          errors,
          `${currentPath}.matchedActions`,
        );

        validateEffectActions(
          action.unmatchedActions,
          skill,
          effectIndex,
          unitIds,
          errors,
          `${currentPath}.unmatchedActions`,
        );

        break;
      }

      default:
        break;
    }
  }
}
