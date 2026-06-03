import type { BattleUnit } from "../types/battle";
import type { Attribute } from "../types/common";
import type { DamageAction, SkillDefinition } from "../types/skill";
import {
  ATTRIBUTE_EFFECTIVENESS_DEFAULT,
  attributeChart,
} from "../data/attributeChart";
import { randomVariance } from "../utils/random";

const DAMAGE_MIN = 1;
const DAMAGE_MAX = 999;

export interface DamageCalculationInput {
  attacker: BattleUnit;
  defender: BattleUnit;
  skill: SkillDefinition;
  action: DamageAction;
}

export interface DamageCalculationResult {
  damage: number;
  baseDamage: number;
  attackValue: number;
  multiplier: number;
  variance: number;
  attributeMultiplier: number;
  finalMultiplier: number;
  skillAttributes: Attribute[];
  defenderAttribute: Attribute;
}

/**
 * 技属性と防御側属性から属性倍率を計算する。
 *
 * 複数属性技の場合は、各属性倍率を掛け合わせる。
 * 例:
 *   fire x1.5
 *   thunder x0.5
 *   => 0.75
 */
export function calculateAttributeMultiplier(
  skillAttributes: Attribute[],
  defenderAttribute: Attribute,
): number {
  const effectiveAttributes: Attribute[] =
    skillAttributes.length > 0 ? skillAttributes : ["none"];

  return effectiveAttributes.reduce((total, attackAttribute) => {
    const multiplier =
      attributeChart[attackAttribute]?.[defenderAttribute] ??
      ATTRIBUTE_EFFECTIVENESS_DEFAULT;

    return total * multiplier;
  }, 1);
}

/**
 * ダメージ計算本体。
 *
 * 現時点では、
 *   攻撃者の攻撃力 × 技倍率 × 属性倍率 × ランダム幅
 * で計算する。
 *
 * 将来的にここへ以下を追加できる:
 * - 状態異常による攻撃倍率
 * - 状態異常による被ダメージ倍率
 * - 技カテゴリ耐性
 * - 種族特効
 * - 防御力
 */
export function calculateDamage(
  input: DamageCalculationInput,
): DamageCalculationResult {
  const variance = input.action.variance ?? 0.05;
  const multiplier = input.action.multiplier;
  const attackValue = input.attacker.attack;

  const attributeMultiplier = calculateAttributeMultiplier(
    input.skill.attributes,
    input.defender.definition.attribute,
  );

  const finalMultiplier = multiplier * attributeMultiplier;

  const baseDamage = attackValue * finalMultiplier;
  const variedDamage = randomVariance(baseDamage, variance);

  const rawDamage = Math.round(variedDamage);
  const damage = Math.min(DAMAGE_MAX, Math.max(DAMAGE_MIN, rawDamage));

  return {
    damage,
    baseDamage,
    attackValue,
    multiplier,
    variance,
    attributeMultiplier,
    finalMultiplier,
    skillAttributes: input.skill.attributes,
    defenderAttribute: input.defender.definition.attribute,
  };
}

export function getAttributeEffectivenessText(
  attributeMultiplier: number,
): string {
  if (attributeMultiplier > 1) {
    return "効果は抜群だ！";
  }

  if (attributeMultiplier < 1) {
    return "効果はいまひとつだ。";
  }

  return "";
}
