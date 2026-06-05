import type { SkillDefinition } from "../types/skill";

export const skills: Record<string, SkillDefinition> = {
  test_counter: {
    id: "test_counter",
    name: "テストカウンター",
    attributes: ["none"],
    category: "physical",
    effects: [
      {
        target: { type: "self" },
        actions: [
          {
            type: "apply_status_effect",
            statusEffectId: "counter",
            duration: 3,
            params: {
              type: "counter",
              requireDamage: true,
              canCounterOnDeath: false,
              nullifyCategories: ["breath", "physical", "magic"],
              counterCategories: ["breath"],
              maxCounterCount: 1,
              counterActionsToAttacker: [
                {
                  type: "damage",
                  multiplier: 1,
                },
              ],
              counterActionsToSelf: [],
            },
          },
        ],
      },
    ],
  },

  test_combo_attack: {
    id: "test_combo_attack",
    name: "テスト連撃",
    attributes: ["none"],
    category: "physical",
    effects: [
      {
        target: { type: "random_enemies", count: 15, allowDuplicate: true },
        actions: [
          {
            type: "damage",
            multiplier: 0.1,
          },
        ],
      },
    ],
  },
  test_ex_gauge: {
    id: "test_ex_gauge",
    name: "テストEXゲージ",
    attributes: ["none"],
    category: "none",
    effects: [
      {
        target: { type: "none" },
        actions: [
          {
            type: "change_special_gauge",
            targetTeam: "self_team",
            amount: 10,
          },
        ],
      },
    ],
  },
  test_poison: {
    id: "test_poison",
    name: "テスト毒付与",
    attributes: ["none"],
    category: "magic",
    effects: [
      {
        target: { type: "single_enemy" },
        actions: [
          {
            type: "apply_status_effect",
            statusEffectId: "poison",
            chance: 0.5,
          },
        ],
      },
    ],
  },

  test_paralysis: {
    id: "test_poison",
    name: "テスト麻痺付与",
    attributes: ["none"],
    category: "magic",
    effects: [
      {
        target: { type: "single_enemy" },
        actions: [
          {
            type: "apply_status_effect",
            statusEffectId: "paralysis",
            chance: 0.5,
          },
        ],
      },
    ],
  },

  cleanse: {
    id: "cleanse",
    name: "浄化",
    attributes: ["none"],
    category: "magic",
    effects: [
      {
        target: { type: "single_ally_except_self" },
        actions: [
          {
            type: "remove_status_effect",
            categories: ["harmful"],
            chance: 1,
          },
        ],
      },
    ],
  },

  test_charge_attack: {
    id: "test_charge_attack",
    name: "テストチャージ攻撃",
    attributes: ["none"],
    category: "change_reel",
    effects: [
      {
        target: { type: "self" },
        actions: [
          {
            type: "apply_status_effect",
            statusEffectId: "charged_attack",
            duration: 3,
            chance: 1,
            params: {
              type: "charged_attack",
              skillId: "attack_lethal",
              canMoveWhileCharge: false,
              cancelDamage: 50,
            },
          },
        ],
      },
    ],
  },

  attack: {
    id: "attack",
    name: "こうげき",
    attributes: ["none"],
    category: "physical",
    effects: [
      {
        target: { type: "single_enemy" },
        actions: [
          {
            type: "damage",
            multiplier: 0.5,
          },
        ],
      },
    ],
  },

  attack_power1: {
    id: "attack_power1",
    name: "こうげき！",
    attributes: ["none"],
    category: "physical",
    effects: [
      {
        target: { type: "single_enemy" },
        actions: [
          {
            type: "damage",
            multiplier: 1,
          },
        ],
      },
    ],
  },

  attack_critical: {
    id: "attack_critical",
    name: "会心の一撃",
    attributes: ["none"],
    category: "physical",
    effects: [
      {
        target: { type: "single_enemy" },
        actions: [
          {
            type: "damage",
            multiplier: 2,
          },
        ],
      },
    ],
  },

  attack_lethal: {
    id: "attack_lethal",
    name: "必殺の一撃",
    attributes: ["none"],
    category: "physical",
    effects: [
      {
        target: { type: "single_enemy" },
        actions: [
          {
            type: "damage",
            multiplier: 2.5,
          },
        ],
      },
    ],
  },
  tackle: {
    id: "tackle",
    name: "たいあたり",
    attributes: ["none"],
    category: "physical",
    effects: [
      {
        target: { type: "all_enemies" },
        actions: [
          {
            type: "damage",
            multiplier: 0.9,
          },
          {
            type: "apply_status_effect",
            statusEffectId: "paralysis",
            duration: 1,
            chance: 0.15,
          },
        ],
      },
    ],
  },
  heavy_tackle: {
    id: "heavy_tackle",
    name: "重体当たり",
    attributes: ["none"],
    category: "physical",
    effects: [
      {
        target: { type: "all_enemies" },
        actions: [
          {
            type: "damage",
            multiplier: 1.1,
          },
          {
            type: "apply_status_effect",
            statusEffectId: "paralysis",
            duration: 1,
            chance: 0.2,
          },
        ],
      },
    ],
  },
  thunder: {
    id: "thunder",
    name: "サンダー",
    attributes: ["thunder"],
    category: "magic",
    effects: [
      {
        target: { type: "single_enemy" },
        actions: [
          {
            type: "damage",
            multiplier: 1.2,
            chance: 1,
            variance: 0.05,
          },
        ],
      },
    ],
  },

  heal: {
    id: "heal",
    name: "ヒール",
    attributes: ["none"],
    category: "magic",
    effects: [
      {
        target: { type: "self" },
        actions: [
          {
            type: "heal",
            amount: 30,
            chance: 1,
          },
        ],
      },
    ],
  },

  charge: {
    id: "charge",
    name: "ためる",
    attributes: ["none"],
    category: "change_reel",
    effects: [
      {
        target: { type: "none" },
        actions: [
          {
            type: "change_reel",
            amount: 1,
            chance: 1,
          },
        ],
      },
    ],
  },
  reel_up: {
    id: "reel_up",
    name: "コマンドアップ",
    attributes: ["none"],
    category: "change_reel",
    effects: [
      {
        target: { type: "none" },
        actions: [
          {
            type: "change_reel",
            amount: 1,
          },
          {
            type: "extra_action",
          },
        ],
      },
    ],
  },
  miss: {
    id: "miss",
    name: "ミス",
    attributes: ["none"],
    category: "none",
    effects: [
      {
        target: { type: "none" },
        actions: [
          {
            type: "do_nothing",
          },
        ],
      },
    ],
  },

  ex_plus_1: {
    id: "ex_plus_1",
    name: "EXゲージ+1",
    attributes: ["none"],
    category: "none",
    effects: [
      {
        target: { type: "none" },
        actions: [
          {
            type: "change_special_gauge",
            targetTeam: "self_team",
            amount: 1,
          },
        ],
      },
    ],
  },
  ex_plus_2: {
    id: "ex_plus_2",
    name: "EXゲージ+2",
    attributes: ["none"],
    category: "none",
    effects: [
      {
        target: { type: "none" },
        actions: [
          {
            type: "change_special_gauge",
            targetTeam: "self_team",
            amount: 2,
          },
        ],
      },
    ],
  },
  ex_plus_3: {
    id: "ex_plus_3",
    name: "EXゲージ+3",
    attributes: ["none"],
    category: "none",
    effects: [
      {
        target: { type: "none" },
        actions: [
          {
            type: "change_special_gauge",
            targetTeam: "self_team",
            amount: 3,
          },
        ],
      },
    ],
  },

  fire_breath: {
    id: "fire_breath",
    name: "ファイヤーブレス",
    attributes: ["fire"],
    category: "breath",
    effects: [
      {
        target: { type: "all_enemies" },
        actions: [
          {
            type: "damage",
            multiplier: 1.2,
          },
        ],
      },
    ],
  },

  fire_breath_ultra: {
    id: "fire_breath_ultra",
    name: "極炎のいき",
    attributes: ["fire"],
    category: "breath",
    effects: [
      {
        target: { type: "all_enemies" },
        actions: [
          {
            type: "damage",
            multiplier: 1.7,
          },
        ],
      },
    ],
  },

  true_crimson_flare: {
    id: "true_crimson_flare",
    name: "真・クリムゾン・フレア",
    attributes: ["fire"],
    category: "breath",
    effects: [
      {
        target: { type: "all_enemies" },
        actions: [
          {
            type: "damage",
            multiplier: 2.5,
          },
        ],
      },
    ],
  },

  dragon_rage: {
    id: "dragon_rage",
    name: "逆鱗",
    attributes: ["none"],
    category: "change_reel",
    effects: [
      {
        target: { type: "single_ally_except_self" },
        actions: [
          {
            type: "change_reel",
            amount: 2,
          },
        ],
      },
    ],
  },

  fire_and_ice_breath: {
    id: "fire_and_ice_breath",
    name: "炎と氷の息",
    attributes: ["none"],
    category: "breath",
    effects: [
      {
        target: { type: "all_enemies" },
        actions: [
          {
            type: "damage",
            multiplier: 1.65,
          },
        ],
      },
    ],
  },
  fire_and_ice_breath_power5: {
    id: "fire_and_ice_breath_power5",
    name: "炎と氷の息!!!!!",
    attributes: ["none"],
    category: "breath",
    effects: [
      {
        target: { type: "all_enemies" },
        actions: [
          {
            type: "damage",
            multiplier: 5.5,
          },
        ],
      },
    ],
  },
  big_fire_attack: {
    id: "big_fire_attack",
    name: "Bigファイヤー攻撃",
    attributes: ["fire"],
    category: "physical",
    effects: [
      {
        target: { type: "all_enemies" },
        actions: [
          {
            type: "damage",
            multiplier: 3,
          },
        ],
      },
    ],
  },
  big_star_attack: {
    id: "big_star_attack",
    name: "Bigスター攻撃",
    attributes: ["none"],
    category: "physical",
    effects: [
      {
        target: { type: "random_enemies", count: 8, allowDuplicate: true },
        actions: [
          {
            type: "damage",
            multiplier: 0.735,
          },
        ],
      },
    ],
  },
  three_way: {
    id: "three_way",
    name: "3way",
    attributes: ["none"],
    category: "physical",
    effects: [
      {
        target: { type: "all_enemies" },
        actions: [
          {
            type: "damage",
            multiplier: 2,
          },
        ],
      },
    ],
  },
  all_range_attack: {
    id: "all_range_attack",
    name: "全画面攻撃",
    attributes: ["none"],
    category: "physical",
    effects: [
      {
        target: { type: "all_enemies" },
        actions: [
          {
            type: "damage",
            multiplier: 2.1,
          },
          {
            type: "apply_status_effect",
            statusEffectId: "seal_physical",
            chance: 1,
          },
        ],
      },

      {
        target: { type: "none" },
        actions: [
          {
            type: "replace_used_skill",
            toSkillId: "miss",
            chance: 1,
          },
        ],
      },
    ],
  },
  junk_breath: {
    id: "junk_breath",
    name: "ジャンクブレス",
    attributes: ["earth"],
    category: "breath",
    effects: [
      {
        target: { type: "all_enemies" },
        actions: [
          {
            type: "damage",
            multiplier: 1.2,
          },
        ],
      },
    ],
  },
  tail_excavator: {
    id: "tail_excavator",
    name: "テールエクスカベーター",
    attributes: ["earth"],
    category: "physical",
    effects: [
      {
        target: { type: "all_enemies" },
        actions: [
          {
            type: "damage",
            multiplier: 1.6,
          },
          {
            type: "apply_status_effect",
            statusEffectId: "seal_physical",
            chance: 1,
          },
        ],
      },
    ],
  },
  devastator_zeta_flare: {
    id: "devastator_zeta_flare",
    name: "デヴァステイター・ゼタフレア",
    attributes: ["heat"],
    category: "breath",
    effects: [
      {
        target: { type: "all_enemies" },
        actions: [
          {
            type: "damage",
            multiplier: 2.7,
          },
        ],
      },
    ],
  },
  shining_wind: {
    id: "shining_wind",
    name: "輝く風",
    attributes: ["wind"],
    category: "physical",
    effects: [
      {
        target: { type: "all_enemies" },
        actions: [
          {
            type: "damage",
            multiplier: 1.35,
          },
          {
            type: "apply_status_effect",
            statusEffectId: "paralysis",
            duration: 1,
            chance: 0.2,
          },
        ],
      },
    ],
  },
  dragon_god_wind: {
    id: "dragon_god_wind",
    name: "竜神の風",
    attributes: ["wind"],
    category: "physical",
    effects: [
      {
        target: { type: "all_enemies" },
        actions: [
          {
            type: "damage",
            multiplier: 1.3,
          },
        ],
      },
      {
        target: { type: "all_allies" },
        actions: [
          {
            type: "heal",
            amount: 150,
          },
        ],
      },
    ],
  },
  double_edged_sword: {
    id: "double_edged_sword",
    name: "諸刃の剣",
    attributes: ["none"],
    category: "physical",
    effects: [
      {
        target: { type: "single_enemy" },
        actions: [
          {
            type: "damage",
            multiplier: 3.21,
          },
        ],
      },

      {
        target: { type: "none" },
        actions: [
          {
            type: "replace_used_skill",
            toSkillId: "miss",
            chance: 1,
          },
        ],
      },
    ],
  },
  yungubi_dance: {
    id: "yungubi_dance",
    name: "ユングビの乱舞",
    attributes: ["none"],
    category: "physical",
    effects: [
      {
        target: {
          type: "random_all_except_self",
          count: 5,
          allowDuplicate: true,
        },
        actions: [
          {
            type: "damage",
            multiplier: 1.605,
          },
        ],
      },
    ],
  },
  drilling_raid: {
    id: "drilling_raid",
    name: "穿孔急襲",
    attributes: ["earth"],
    category: "physical",
    effects: [
      {
        target: { type: "all_enemies" },
        actions: [
          {
            type: "damage",
            multiplier: 1.95,
            variance: 0.23,
          },
        ],
      },
    ],
  },
  revenge_horn: {
    id: "revenge_horn",
    name: "復讐の角葬",
    attributes: ["earth"],
    category: "physical",
    effects: [
      {
        target: { type: "self" },
        actions: [
          {
            type: "apply_status_effect",
            statusEffectId: "counter",
            duration: 2,
            params: {
              type: "counter",
              requireDamage: true,
              canCounterOnDeath: false,
              nullifyCategories: ["breath", "physical", "magic"],
              counterCategories: ["physical"],
              maxCounterCount: 1,
              counterActionsToAttacker: [
                {
                  type: "damage",
                  multiplier: 4.5,
                },
              ],
              counterActionsToSelf: [
                {
                  type: "remove_status_effect",
                  statusEffectIds: ["charged_attack"],
                  sourceSkillIds: ["revenge_horn"],
                  chance: 1,
                },
              ],
            },
          },

          {
            type: "apply_status_effect",
            statusEffectId: "charged_attack",
            duration: 2,
            chance: 1,
            params: {
              type: "charged_attack",
              skillId: "revenge_horn_failure",
              canMoveWhileCharge: false,
            },
          },
        ],
      },
    ],
  },
  revenge_horn_failure: {
    id: "revenge_horn_failure",
    name: "復讐の角葬・拡散",
    attributes: ["earth"],
    category: "physical",
    effects: [
      {
        target: { type: "all_enemies" },
        actions: [
          {
            type: "damage",
            multiplier: 0.5,
          },
        ],
      },
    ],
  },
  diamonddust_breath: {
    id: "diamonddust_breath",
    name: "ダイヤモンドダストの息",
    attributes: ["ice"],
    category: "breath",
    effects: [
      {
        target: { type: "all_enemies" },
        actions: [
          {
            type: "damage",
            multiplier: 1.7,
          },
        ],
      },
    ],
  },
  true_absolute_zero_scream: {
    id: "true_absolute_zero_scream",
    name: "真・アブソリュート・ゼロ・スクリーム",
    attributes: ["ice"],
    category: "breath",
    effects: [
      {
        target: { type: "all_enemies" },
        actions: [
          {
            type: "damage",
            multiplier: 2.5,
          },
        ],
      },
    ],
  },
  freezing_breath: {
    id: "freezing_breath",
    name: "凍てつく息",
    attributes: ["ice"],
    category: "breath",
    effects: [
      {
        target: { type: "all_enemies" },
        actions: [
          {
            type: "damage",
            multiplier: 1,
          },
          {
            type: "apply_status_effect",
            statusEffectId: "paralysis",
            duration: 1,
            chance: 0.35,
          },
        ],
      },
    ],
  },
  frozen_breath: {
    id: "frozen_breath",
    name: "フローズンブレス",
    attributes: ["ice"],
    category: "breath",
    effects: [
      {
        target: { type: "all_enemies" },
        actions: [
          {
            type: "damage",
            multiplier: 0.85,
          },
          {
            type: "apply_status_effect",
            statusEffectId: "paralysis",
            duration: 1,
            chance: 0.3,
          },
        ],
      },
    ],
  },
  crush_ice: {
    id: "crush_ice",
    name: "カチワリゴオリ",
    attributes: ["ice"],
    category: "physical",
    effects: [
      {
        target: { type: "random_enemies", count: 1, allowDuplicate: true },
        actions: [
          {
            type: "damage",
            multiplier: 2.3,
          },
        ],
      },
    ],
  },
  cold_frozen_ray: {
    id: "cold_frozen_ray",
    name: "コールドフローズンレイ",
    attributes: ["ice"],
    category: "breath",
    effects: [
      {
        target: { type: "single_enemy" },
        actions: [
          {
            type: "damage",
            multiplier: 3,
          },
          {
            type: "apply_status_effect",
            statusEffectId: "paralysis",
            duration: 1,
            chance: 0.5,
          },
        ],
      },
    ],
  },
  death: {
    id: "death",
    name: "デス",
    attributes: ["none"],
    category: "magic",
    effects: [
      {
        target: { type: "single_enemy" },
        actions: [
          {
            type: "damage",
            multiplier: 10000,
            chance: 0.6,
          },
        ],
      },
    ],
  },
};
