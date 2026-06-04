import type { SkillCategory, EffectAction } from "./skill";
import type {
  BattleState,
  BattleStatusEffect,
  BattleUnit,
} from "../types/battle";
``;

export type StatusEffectId =
  | "paralysis"
  | "poison"
  | "seal_physical"
  | "seal_magic"
  | "seal_breath"
  | "seal_change_reel"
  | "counter";

export interface StatusEffectDefinition {
  id: StatusEffectId;
  name: string;

  /**
   * 実行効果側で継続ターン数を指定しない場合に使う。
   */
  defaultDuration: number;
}

export type StatusEffectParams = CounterStatusParams;

export interface CounterStatusParams {
  type: "counter";

  /**
   * true の場合、ダメージを含む技を受けたときだけ、
   * 無効化・反撃の対象になる。
   *
   * デフォルトは true として扱う予定。
   */
  requireDamage?: boolean;

  /**
   * true の場合、カウンターユニットのHPが0になっていても反撃できる。
   *
   * デフォルトは false。
   */
  canCounterOnDeath?: boolean;

  /**
   * 無効化する技カテゴリ。
   *
   * 例:
   * ['physical', 'magic']
   */
  nullifyCategories: SkillCategory[];

  /**
   * 反撃する技カテゴリ。
   *
   * 例:
   * ['physical']
   */
  counterCategories: SkillCategory[];

  /**
   * 反撃できる最大回数。
   *
   * null の場合は回数制限なし。
   */
  maxCounterCount: number | null;

  /**
   * 戦闘中に残っている反撃回数。
   *
   * 状態異常付与時に maxCounterCount と同じ値で初期化する想定。
   * null の場合は回数制限なし。
   */
  remainingCounterCount?: number | null;

  /**
   * 攻撃者に対して実行する反撃効果。
   */
  counterActionsToAttacker: EffectAction[];

  /**
   * カウンターユニット自身に対して実行する反撃効果。
   */
  counterActionsToSelf: EffectAction[];
}

export type CounterBattleStatusEffect = BattleStatusEffect & {
  id: "counter";
  params: CounterStatusParams;
};
