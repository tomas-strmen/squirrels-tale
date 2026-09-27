# core/inventory

Bag + equipment slots (GDD 9.1 v2.3, 10). Pure: returns new states.

## Public API
- `EQUIP_SLOTS` – `rightPaw, leftPaw, ranged, head, body, legs, ring, amulet, tail` (9, GDD 9.1 v2.3).
- `createInventory()`, `EMPTY_EQUIPMENT`, `addToBag(state, item)`.
- `slotsFor(itemSlot)` – melee weapon → either paw; others → their own slot. Shields and tail
  items don't exist yet.
- `equip(state, uid, slot)` – bag → slot, previous item back to the bag; ignores misfits.
- `unequip(state, slot)`, `equippedItems(equipment)`.

## Not yet (M5.2)
20-slot bag limit, comparison, locking, sorting, "Keep only upgrades", stacks.

## Depends on
- `core/content`, `core/loot` (types).
