import type { ItemId } from "./common";
import type {
  StatusEffectCategory,
  StatusEffectId,
  StatusEffectParams,
} from "./statusEffect";

export interface ItemStatBonus {
  maxHp?: number;
  attack?: number;
  speed?: number;
}

/**
 * アイテムによって戦闘開始時に付与される状態異常。
 *
 * apply_status_effectと同様に、
 * duration、category、params、chanceを指定できる。
 */
export interface ItemStartStatusEffect {
  statusEffectId: StatusEffectId;

  /**
   * 未指定なら状態異常定義のdefaultDurationを使う。
   */
  duration?: number;

  /**
   * 未指定なら状態異常定義のcategoryを使う。
   */
  category?: StatusEffectCategory;

  params?: StatusEffectParams;

  /**
   * 未指定なら100%。
   */
  chance?: number;
}

export interface ItemDefinition {
  id: ItemId;
  name: string;

  /**
   * 戦闘開始時のステータス補正。
   */
  statBonus: ItemStatBonus;

  /**
   * 戦闘開始時に所持者へ付与する状態異常。
   */
  startStatusEffects: ItemStartStatusEffect[];
}
