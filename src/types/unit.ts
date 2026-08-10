import type {
  Attribute,
  Gender,
  ItemId,
  SkillId,
  Species,
  UnitId,
} from "./common";

export interface UnitDefinition {
  id: UnitId;
  name: string;

  maxHp: number;
  attack: number;
  speed: number;

  species: Species;
  attribute: Attribute;
  gender: Gender;

  reels: SkillId[][];

  specialSkillId: SkillId;

  specialGaugeConsumption?: number;

  /**
   * ユニット選択時に自動選択するアイテム。
   *
   * 未指定の場合:
   * ・初回表示ではitems.tsの先頭アイテム
   * ・選択画面上でユニットを変更した場合は、
   *   現在選択中のアイテムを維持する
   */
  defaultItemId?: ItemId;
}
