/**
 * 技がどの経路から発動したか。
 */
export type SkillExecutionSource =
  | "reel"
  | "special"
  | "counter"
  | "charged_attack"
  | "other";

/**
 * 技実行中に適用する対象選択ルール。
 *
 * normal:
 *   技データに書かれた対象選択をそのまま使用する。
 *
 * reverse_team:
 *   敵と味方を反転した対象選択を使用する。
 */
export type TargetingMode = "normal" | "reverse_team";

/**
 * 1回の技実行中に維持する情報。
 *
 * 対象選択待ちで処理が中断された場合も、
 * 同じオブジェクトを引き継ぐ。
 */
export interface SkillExecutionInfo {
  /**
   * この技がどの経路から発動したか。
   */
  source: SkillExecutionSource;

  /**
   * この技全体に適用する対象選択モード。
   *
   * 技実行開始時に、使用者の状態異常などから確定する。
   */
  targetingMode: TargetingMode;

  /**
   * 最初のエフェクトで対象が存在しなかった場合の
   * 特殊な救済判定を処理済みか。
   *
   * 1回の技実行につき、救済抽選を1回だけにするために使う。
   */
  targetFallbackResolved: boolean;

  /**
   * 救済抽選に成功し、この技の全エフェクトを
   * 元の対象選択で実行すると決定したか。
   */
  useOriginalTargetingForWholeSkill: boolean;

  /**
   * この技内で、damageまたはdrainの対象になったユニット。
   *
   * カウンターのrequireDamage判定に使う。
   */
  damageTargetInstanceIds: Set<string>;
}
