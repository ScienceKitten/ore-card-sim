import type { Attribute, SkillId } from "./common";
import type {
  StatusEffectCategory,
  StatusEffectId,
  StatusEffectParams,
} from "./statusEffect";

export type SkillCategory =
  | "physical"
  | "magic"
  | "breath"
  | "change_reel"
  | "none";

export interface SkillDefinition {
  id: string;
  name: string;

  /**
   * 技は複数属性を持つ場合がある。
   */
  attributes: Attribute[];

  category: SkillCategory;

  /**
   * 1つの技は複数のエフェクトを持てる。
   */
  effects: SkillEffect[];
}

export interface SkillEffect {
  target: TargetSelector;
  actions: EffectAction[];
}

export type TargetSelector =
  | { type: "single_enemy" }
  | { type: "single_ally"; includeSelf?: boolean }
  | { type: "all_enemies" }
  | { type: "all_allies"; includeSelf?: boolean }
  | {
      type: "random_enemies";
      count: number;
      allowDuplicate: boolean;
    }
  | { type: "self" }
  | {
      type: "random_all_units";
      count: number;
      allowDuplicate: boolean;
      includeSelf?: boolean;
    }
  | {
      type: "random_allies";
      count: number;
      allowDuplicate: boolean;
      includeSelf?: boolean;
    }
  | { type: "none" };

export type EffectAction =
  | DamageAction
  | DrainAction
  | HealAction
  | ChangeReelAction
  | GaugeAction
  | ExtraActionAction
  | ReplaceSkillOnTargetAction
  | ReplaceUsedSkillAction
  | ApplyStatusEffectAction
  | RemoveStatusEffectAction
  | RandomAction
  | DoNothingAction;

export interface DamageAction {
  type: "damage";

  /**
   * 使用者の攻撃力に対する倍率。
   * 例: 1.0なら攻撃力等倍、1.5なら1.5倍。
   */
  multiplier: number;

  /**
   * 発生確率。
   * 1 = 100%
   * 0.5 = 50%
   */
  chance?: number;

  /**
   * ダメージのランダム振れ幅。
   * 0.05 = ±5%
   */
  variance?: number;
}

export interface HealAction {
  type: "heal";
  amount: number;
  chance?: number;
}

export interface ChangeReelAction {
  type: "change_reel";

  /**
   * 0始まり。
   * 0 = 1番目のリール
   * 1 = 2番目のリール
   */
  amount: number;

  chance?: number;
}

export interface GaugeAction {
  type: "change_special_gauge";
  targetTeam: "ally" | "enemy" | "self_team" | "opponent_team";
  amount: number;
  chance?: number;
}

export interface ExtraActionAction {
  type: "extra_action";

  /**
   * 発生確率。
   * 1 = 100%
   * 0.5 = 50%
   */
  chance?: number;
}

export interface DoNothingAction {
  type: "do_nothing";
}

export interface ReplaceSkillOnTargetAction {
  type: "replace_skill_on_target";

  /**
   * 対象ユニットが持つこの技IDを探す。
   */
  fromSkillId: SkillId;

  /**
   * 見つかった技をこの技IDに置換する。
   */
  toSkillId: SkillId;

  chance?: number;
}

export interface ReplaceUsedSkillAction {
  type: "replace_used_skill";

  /**
   * 今リールで選ばれて使われている1枠を、この技IDに置換する。
   */
  toSkillId: SkillId;

  chance?: number;
}

export interface ApplyStatusEffectAction {
  type: "apply_status_effect";
  statusEffectId: StatusEffectId;

  /**
   * 指定しない場合は状態異常側の defaultDuration を使う。
   */
  duration?: number;

  /**
   * カウンター状態など、状態異常ごとの追加パラメータ。
   */
  params?: StatusEffectParams;

  chance?: number;
}

export interface RemoveStatusEffectAction {
  type: "remove_status_effect";

  /**
   * 解除対象にする状態異常ID。
   * 未指定または空配列なら、この条件は無視する。
   */
  statusEffectIds?: StatusEffectId[];

  /**
   * 解除対象にする状態異常分類。
   * 未指定または空配列なら、この条件は無視する。
   */
  categories?: StatusEffectCategory[];

  /**
   * 解除対象にする付与元技ID。
   * 未指定または空配列なら、この条件は無視する。
   */
  sourceSkillIds?: SkillId[];

  chance?: number;
}
export interface DrainAction {
  type: "drain";

  /**
   * 使用者の攻撃力に対するダメージ倍率。
   */
  multiplier: number;

  /**
   * 実際に与えたダメージに対する回復倍率。
   * 例:
   * 1 = 与えたダメージと同じだけ回復
   * 0.5 = 与えたダメージの半分回復
   */
  healMultiplier: number;

  /**
   * 発生確率。
   * 1 = 100%
   */
  chance?: number;

  /**
   * ダメージのランダム振れ幅。
   * 0.05 = ±5%
   */
  variance?: number;
}

export interface RandomAction {
  type: "random_action";

  /**
   * この中から1つの実行効果をランダムで選ぶ。
   *
   * 対象が複数いる場合は、対象ごとに個別抽選する。
   */
  actions: EffectAction[];

  /**
   * random_action自体の発生確率。
   *
   * 候補を選ぶ前に1回だけ判定する。
   * 失敗した場合、すべての対象に対して
   * 候補内の実行効果はどれも使われない。
   */
  chance?: number;
}
