import type { UnitDefinition } from "../types/unit";
import type { Attribute, Species } from "../types/common";
import type { StatBonus, TeamBonusResult } from "../types/teamBonus";
import { attributeTeamBonuses, speciesTeamBonuses } from "../data/teamBonuses";

function isSameAttribute(
  units: UnitDefinition[],
  attribute: Attribute,
): boolean {
  return units.every((unit) => unit.attribute === attribute);
}

function isSameSpecies(units: UnitDefinition[], species: Species): boolean {
  return units.every((unit) => unit.species === species);
}

export function getTeamBonusResults(
  units: UnitDefinition[],
): TeamBonusResult[] {
  if (units.length === 0) return [];

  const results: TeamBonusResult[] = [];

  const firstAttribute = units[0].attribute;
  const firstSpecies = units[0].species;

  if (isSameAttribute(units, firstAttribute)) {
    const bonus = attributeTeamBonuses[firstAttribute];

    if (bonus) {
      results.push({
        kind: "attribute",
        key: firstAttribute,
        bonus,
        label: `${firstAttribute}属性統一ボーナス`,
      });
    }
  }

  if (isSameSpecies(units, firstSpecies)) {
    const bonus = speciesTeamBonuses[firstSpecies];

    if (bonus) {
      results.push({
        kind: "species",
        key: firstSpecies,
        bonus,
        label: `${firstSpecies}種族統一ボーナス`,
      });
    }
  }

  return results;
}

export function sumStatBonuses(bonuses: StatBonus[]): Required<StatBonus> {
  return bonuses.reduce<Required<StatBonus>>(
    (total, bonus) => {
      return {
        maxHp: total.maxHp + (bonus.maxHp ?? 0),
        attack: total.attack + (bonus.attack ?? 0),
        speed: total.speed + (bonus.speed ?? 0),
      };
    },
    {
      maxHp: 0,
      attack: 0,
      speed: 0,
    },
  );
}

export function formatStatBonus(bonus: StatBonus): string {
  const parts: string[] = [];

  if (bonus.maxHp) {
    parts.push(`最大HP +${bonus.maxHp}`);
  }

  if (bonus.attack) {
    parts.push(`攻撃 +${bonus.attack}`);
  }

  if (bonus.speed) {
    parts.push(`素早さ +${bonus.speed}`);
  }

  return parts.join(" / ");
}
