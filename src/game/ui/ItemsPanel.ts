import Phaser from 'phaser';
import { EQUIP_SLOTS, slotsFor, type EquipSlot, type InventoryState } from '../../core/inventory/inventory';
import type { Item } from '../../core/loot/loot';
import { itemSummary } from '../itemText';
import { t, tDynamic } from '../text';
import { Button } from './Button';

const ROW_H = 20;
const PAD = 8;
const FONT = { fontFamily: 'monospace', fontSize: '13px', color: '#dddddd' };
/** How many bag items to list (newest first) - the full inventory screen is M5.2. */
const BAG_ROWS = 8;

export interface ItemsPanelActions {
  readonly onEquip: (uid: number, slot: EquipSlot) => void;
  readonly onUnequip: (slot: EquipSlot) => void;
  readonly colorOf: (item: Item) => string;
}

/**
 * M5.1: equipped gear (9 slots, GDD 9.1 v2.3) + the newest bag items, with
 * Equip / Unequip buttons. Rebuilt only when the inventory changes.
 */
export class ItemsPanel extends Phaser.GameObjects.Container {
  private readonly bg: Phaser.GameObjects.Rectangle;
  private rows: Phaser.GameObjects.GameObject[] = [];
  private shown: InventoryState | null = null;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly actions: ItemsPanelActions,
  ) {
    super(scene, x, y);
    this.bg = scene.add.rectangle(0, 0, 10, 10, 0x000000, 0.75).setOrigin(0, 0);
    this.add(this.bg);
    scene.add.existing(this);
  }

  /** Redraws only when `inventory` is a different object (core states are immutable). */
  show(inventory: InventoryState): void {
    if (inventory === this.shown) return;
    this.shown = inventory;
    this.rows.forEach((r) => r.destroy());
    this.rows = [];
    let y = PAD;
    let width = 200;

    const addText = (x: number, text: string, color = FONT.color) => {
      const label = this.scene.add.text(x, y, text, { ...FONT, color });
      this.add(label);
      this.rows.push(label);
      width = Math.max(width, x + label.width + PAD);
      return label;
    };
    const addButton = (x: number, label: string, onClick: () => void) => {
      const b = new Button(this.scene, x + 22, y + 8, label, onClick, { width: 44, height: 18, fontSize: 12 });
      this.add(b);
      this.rows.push(b);
    };

    addText(PAD, t('items.equipped'));
    y += ROW_H;
    for (const slot of EQUIP_SLOTS) {
      const item = inventory.equipment[slot];
      addText(PAD, `${tDynamic(`slot.${slot}.name`)}:`);
      if (item) {
        addButton(104, t('items.unequip'), () => this.actions.onUnequip(slot));
        addText(156, itemSummary(item), this.actions.colorOf(item));
      } else {
        addText(156, '-', '#707070');
      }
      y += ROW_H;
    }

    y += 4;
    addText(PAD, t('items.bag').replace('{n}', String(inventory.bag.length)));
    y += ROW_H;
    const latest = [...inventory.bag].reverse().slice(0, BAG_ROWS);
    if (latest.length === 0) {
      addText(PAD, t('loot.none'), '#909090');
      y += ROW_H;
    }
    for (const item of latest) {
      let x = PAD;
      for (const slot of slotsFor(item.slot)) {
        // Melee weapons get two buttons (right / left paw), everything else one.
        addButton(x, slot === 'leftPaw' ? t('items.equipLeft') : slot === 'rightPaw' ? t('items.equipRight') : t('items.equip'), () =>
          this.actions.onEquip(item.uid, slot),
        );
        x += 50;
      }
      addText(Math.max(x, 104), itemSummary(item), this.actions.colorOf(item));
      y += ROW_H;
    }
    this.bg.setSize(width, y + PAD - 4);
  }
}
