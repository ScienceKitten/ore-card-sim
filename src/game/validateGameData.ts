import type { UnitDefinition } from '../types/unit'
import type { SkillDefinition } from '../types/skill'

export function validateGameData(
  units: UnitDefinition[],
  skills: Record<string, SkillDefinition>,
): string[] {
  const errors: string[] = []

  for (const unit of units) {
    for (const [reelIndex, reel] of unit.reels.entries()) {
      if (reel.length !== 6) {
        errors.push(
          `${unit.name} の ${reelIndex + 1} 番目のリールが6枠ではありません。現在 ${reel.length} 枠です。`,
        )
      }

      for (const skillId of reel) {
        if (!skills[skillId]) {
          errors.push(
            `${unit.name} のリールに未定義の技ID "${skillId}" があります。`,
          )
        }
      }
    }

    if (!skills[unit.specialSkillId]) {
      errors.push(
        `${unit.name} の必殺技ID "${unit.specialSkillId}" が未定義です。`,
      )
    }

    if (unit.reels.length > 4) {
      errors.push(
        `${unit.name} のリール数が4を超えています。現在 ${unit.reels.length} 個です。`,
      )
    }
  }

  return errors
}