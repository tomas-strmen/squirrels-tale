/**
 * Bag + equipment slots (GDD 9.1 v2.3, 10). Pure: every function returns a new
 * state and never modifies the one passed in.
 *
 * M5.1 scope: 9 equipment slots, equip/unequip.
 * M5.2a: 20-slot bag limit. M5.2b1: comparison (core/encounter.compareEquip).
 * M5.2b2: locking. M5.2b3: bulk discard by rarity. Not yet: sorting UI state
 * (lives in the panel, not here), "Keep only upgrades", stacks.
 */
import type { ItemSlot } from '../content/schemas';
import type { Item } from '../loot/loot';

/** GDD 9.1 v2.3: right paw, left paw (2nd weapon or shield), ranged, head, body, legs, ring, amulet, tail. */
export const EQUIP_SLOTS = [
  'rightPaw',
  'leftPaw',
  'ranged',
  'head',
  'body',
  'legs',
  'ring',
  'amulet',
  'tail',
] as const;
export type EquipSlot = (typeof EQUIP_SLOTS)[number];

export type Equipment = Readonly<Record<EquipSlot, Item | null>>;

/** GDD 22 (M5.2a): max unequipped items carried at once. */
export const BAG_CAPACITY = 20;

export interface InventoryState {
  /** Unequipped items, oldest first. */
  readonly bag: readonly Item[];
  readonly equipment: Equipment;
}

export const EMPTY_EQUIPMENT: Equipment = {
  rightPaw: null,
  leftPaw: null,
  ranged: null,
  head: null,
  body: null,
  legs: null,
  ring: null,
  amulet: null,
  tail: null,
};

export function createInventory(): InventoryState {
  return { bag: [], equipment: EMPTY_EQUIPMENT };
}

/**
 * Which equipment slots an item fits (GDD 9.1 v2.3). A melee weapon goes in
 * either paw. Shields (left paw) and tail items don't exist yet.
 */
export function slotsFor(slot: ItemSlot): readonly EquipSlot[] {
  switch (slot) {
    case 'melee':
      return ['rightPaw', 'leftPaw'];
    case 'ranged':
      return ['ranged'];
    case 'head':
    case 'body':
    case 'legs':
    case 'ring':
    case 'amulet':
      return [slot];
  }
}

/**
 * Adds `item` to the bag, or drops it silently if the bag is already full (GDD 22, M5.2a) -
 * unless `overLimit` (GDD 10: Rare and better are never lost, the bag may exceed its limit).
 */
export function addToBag(state: InventoryState, item: Item, overLimit = false): InventoryState {
  if (state.bag.length >= BAG_CAPACITY && !overLimit) return state;
  return { ...state, bag: [...state.bag, item] };
}

/**
 * Moves the bag item `uid` into `slot`; whatever was there goes back to the
 * bag. Does nothing if the item isn't in the bag or doesn't fit that slot.
 */
export function equip(state: InventoryState, uid: number, slot: EquipSlot): InventoryState {
  const item = state.bag.find((i) => i.uid === uid);
  if (!item || !slotsFor(item.slot).includes(slot)) return state;
  const previous = state.equipment[slot];
  const bag = state.bag.filter((i) => i.uid !== uid);
  return {
    bag: previous ? [...bag, previous] : bag,
    equipment: { ...state.equipment, [slot]: item },
  };
}

/** Flips `locked` on the bag item `uid` (M5.2b2). Does nothing if it's not in the bag. */
export function toggleLock(state: InventoryState, uid: number): InventoryState {
  const index = state.bag.findIndex((i) => i.uid === uid);
  if (index === -1) return state;
  const bag = [...state.bag];
  const item = bag[index]!;
  bag[index] = { ...item, locked: !item.locked };
  return { ...state, bag };
}

/** Removes every unlocked bag item of `rarityId` (M5.2b3). Locked items are kept. */
export function discardRarity(state: InventoryState, rarityId: string): InventoryState {
  const bag = state.bag.filter((i) => i.rarityId !== rarityId || i.locked);
  if (bag.length === state.bag.length) return state;
  return { ...state, bag };
}

/** Moves the item in `slot` back to the bag. Does nothing for an empty slot. */
export function unequip(state: InventoryState, slot: EquipSlot): InventoryState {
  const item = state.equipment[slot];
  if (!item) return state;
  return { bag: [...state.bag, item], equipment: { ...state.equipment, [slot]: null } };
}

/** Every equipped item (non-empty slots), in slot order. */
export function equippedItems(equipment: Equipment): { readonly slot: EquipSlot; readonly item: Item }[] {
  return EQUIP_SLOTS.flatMap((slot) => {
    const item = equipment[slot];
    return item ? [{ slot, item }] : [];
  });
}
