export type StatusEffectId =
  | "paralysis"
  | "poison"
  | "seal_physical"
  | "seal_magic"
  | "seal_breath"
  | "seal_change_reel";

export interface StatusEffectDefinition {
  id: StatusEffectId;
  name: string;

  /**
   * 実行効果側で継続ターン数を指定しない場合に使う。
   */
  defaultDuration: number;
}
