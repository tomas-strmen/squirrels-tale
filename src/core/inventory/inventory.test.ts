import { describe, expect, it } from 'vitest';
import type { Item } from '../loot/loot';
import { addToBag, BAG_CAPACITY, createInventory, equip, equippedItems, slotsFor, toggleLock, unequip } from './inventory';

function item(uid: number, slot: Item['slot'], baseId = 'sharp_twig'): Item {
  return { uid, baseId, slot, tier: 1, rarityId: 'common', weapon: null, stats: [], affixes: [] };
}

describe('slotsFor (GDD 9.1 v2.3)', () => {
  it('a melee weapon fits either paw, armour its own slot', () => {
    expect(slotsFor('melee')).toEqual(['rightPaw', 'leftPaw']);
    expect(slotsFor('ranged')).toEqual(['ranged']);
    expect(slotsFor('head')).toEqual(['head']);
    expect(slotsFor('amulet')).toEqual(['amulet']);
  });
});

describe('equip / unequip', () => {
  const twig = item(1, 'melee');
  const club = item(2, 'melee', 'pebble_club');
  const cap = item(3, 'head', 'leaf_cap');
  const bagged = [twig, club, cap].reduce(addToBag, createInventory());

  it('moves an item from the bag into a fitting slot', () => {
    const s = equip(bagged, 1, 'rightPaw');
    expect(s.equipment.rightPaw).toBe(twig);
    expect(s.bag.map((i) => i.uid)).toEqual([2, 3]);
  });

  it('swaps: the previously equipped item goes back to the bag', () => {
    const s = equip(equip(bagged, 1, 'rightPaw'), 2, 'rightPaw');
    expect(s.equipment.rightPaw).toBe(club);
    expect(s.bag.map((i) => i.uid)).toEqual([3, 1]);
  });

  it('two weapons can be held, one in each paw', () => {
    const s = equip(equip(bagged, 1, 'rightPaw'), 2, 'leftPaw');
    expect(equippedItems(s.equipment).map((e) => e.slot)).toEqual(['rightPaw', 'leftPaw']);
  });

  it('ignores an item that does not fit the slot or is not in the bag', () => {
    expect(equip(bagged, 3, 'rightPaw')).toBe(bagged); // a cap in a paw
    expect(equip(bagged, 99, 'head')).toBe(bagged);
  });

  it('unequip puts it back in the bag; empty slot does nothing', () => {
    const worn = equip(bagged, 3, 'head');
    const s = unequip(worn, 'head');
    expect(s.equipment.head).toBeNull();
    expect(s.bag.map((i) => i.uid)).toContain(3);
    expect(unequip(bagged, 'tail')).toBe(bagged);
  });

  it('does not modify the state passed in', () => {
    const copy = structuredClone(bagged);
    equip(bagged, 1, 'rightPaw');
    expect(bagged).toEqual(copy);
  });
});

describe('toggleLock (M5.2b2)', () => {
  it('flips locked on the matching bag item, leaves others alone', () => {
    const twig = item(1, 'melee');
    const club = item(2, 'melee', 'pebble_club');
    const bagged = [twig, club].reduce(addToBag, createInventory());
    const locked = toggleLock(bagged, 1);
    expect(locked.bag.find((i) => i.uid === 1)?.locked).toBe(true);
    expect(locked.bag.find((i) => i.uid === 2)?.locked).toBeFalsy();
    expect(toggleLock(locked, 1).bag.find((i) => i.uid === 1)?.locked).toBe(false);
  });

  it('does nothing for a uid not in the bag', () => {
    const bagged = addToBag(createInventory(), item(1, 'melee'));
    expect(toggleLock(bagged, 99)).toBe(bagged);
  });
});

describe('bag capacity (GDD 22, M5.2a)', () => {
  it('addToBag drops the item once the bag is full', () => {
    let s = createInventory();
    for (let i = 0; i < BAG_CAPACITY; i++) s = addToBag(s, item(i, 'head'));
    expect(s.bag).toHaveLength(BAG_CAPACITY);
    const full = addToBag(s, item(999, 'head'));
    expect(full).toBe(s); // unchanged: no room
    expect(full.bag).toHaveLength(BAG_CAPACITY);
  });
});
