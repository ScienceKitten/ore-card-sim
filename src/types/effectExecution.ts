import type { SkillDefinition } from "./skill";

/**
 * 技を介さない実行効果の発生理由。
 *
 * 今後種類が増えた場合はここへ追加する。
 */
export type DirectEffectSource =
  | "counter"
  | "status_effect"
  | "turn_end"
  | "item"
  | "system"
  | "other";

/**
 * 実行効果がどのような経路で発生したか。
 *
 * skill:
 *   通常の技処理として実行された効果。
 *   アンデッドへの物理・魔法補正など、
 *   「技によるダメージ」専用ルールを適用できる。
 *
 * direct:
 *   カウンター、状態異常、ターン終了時処理など、
 *   技の通常実行を介さない効果。
 */
export type EffectOrigin =
  | {
      type: "skill";
    }
  | {
      type: "direct";
      source: DirectEffectSource;
    };

/**
 * EffectContextなどで使うための補助型。
 *
 * skillは、属性・カテゴリ・技名などの参照に使う。
 * originは、その効果が技の通常実行かどうかを判定する。
 */
export interface EffectExecutionSource {
  skill: SkillDefinition;
  origin: EffectOrigin;
}
