import Phaser from 'phaser';
import { BAG_CAPACITY, EQUIP_SLOTS, slotsFor, type EquipSlot, type InventoryState } from '../../core/inventory/inventory';
import type { Item } from '../../core/loot/loot';
import { itemSummary, type EquipComparisonLine } from '../itemText';
import { t, tDynamic } from '../text';
import { Button } from './Button';

const ROW_H = 20;
const PAD = 8;
const FONT = { fontFamily: 'monospace', fontSize: '13px', color: '#dddddd' };
/** How many bag rows to show at once (newest first); scroll buttons reach the rest (GDD 22, M5.2a). */
const BAG_ROWS = 8;

export interface ItemsPanelActions {
  readonly onEquip: (uid: number, slot: EquipSlot) => void;
  readonly onUnequip: (slot: EquipSlot) => void;
  readonly colorOf: (item: Item) => string;
  /** M5.2b1: per-stat diff of putting `item` into `slot`, tagged better/worse for coloring. */
  readonly compareToSlot: (item: Item, slot: EquipSlot) => readonly EquipComparisonLine[];
  /** M5.2b1: true if `item` beats what's worn in at least one visible stat, for any fitting slot. */
  readonly hasUpgrade: (item: Item) => boolean;
}

const LINE_COLOR: Record<EquipComparisonLine['verdict'], string> = { better: '#5fd97a', worse: '#e0605f' };
const UPGRADE_TINT = 0x2f6fb0; // faint blue: this item has at least one better stat than what's worn

/**
 * M5.1: equipped gear (9 slots, GDD 9.1 v2.3) + bag items (M5.2a: capped at
 * BAG_CAPACITY, scrollable with ▲/▼).
 * M5.2b1: tap a bag item to compare it against what's worn, then Equip
 * (works the same on touch and mouse - no hover). Redrawn when the
 * inventory changes, the bag is scrolled, or the comparison is toggled.
 */
export class ItemsPanel extends Phaser.GameObjects.Container {
  private readonly bg: Phaser.GameObjects.Rectangle;
  private rows: Phaser.GameObjects.GameObject[] = [];
  private shown: InventoryState | null = null;
  /** How many bag rows are scrolled past (0 = showing the newest first, M5.2a). */
  private scrollOffset = 0;
  /** Bag item currently expanded for comparison (M5.2b1), or null. */
  private expandedUid: number | null = null;
  /**
   * Set by scroll/expand clicks so `show()` re-renders on the *next* frame -
   * never call render() directly from inside a row's own click handler, since
   * render() destroys that row (and Phaser dislikes a GameObject destroying
   * itself mid pointerup dispatch).
   */
  private dirty = false;

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

  /** Call every frame; only redraws when `inventory` is a different object (core states are immutable). */
  show(inventory: InventoryState): void {
    if (inventory !== this.shown) {
      this.shown = inventory;
      this.scrollOffset = 0;
      this.dirty = true;
    }
    if (this.dirty) {
      this.dirty = false;
      this.render();
    }
  }

  private render(): void {
    const inventory = this.shown;
    if (!inventory) return;
    if (this.expandedUid !== null && !inventory.bag.some((i) => i.uid === this.expandedUid)) {
      this.expandedUid = null;
    }
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
    const maxOffset = Math.max(0, inventory.bag.length - BAG_ROWS);
    this.scrollOffset = Math.min(this.scrollOffset, maxOffset);
    addText(
      PAD,
      t('items.bag').replace('{n}', String(inventory.bag.length)).replace('{cap}', String(BAG_CAPACITY)),
    );
    if (maxOffset > 0) {
      addButton(220, '▲', () => this.scroll(-1));
      addButton(272, '▼', () => this.scroll(1));
    }
    y += ROW_H;
    const newestFirst = [...inventory.bag].reverse();
    const visible = newestFirst.slice(this.scrollOffset, this.scrollOffset + BAG_ROWS);
    if (visible.length === 0) {
      addText(PAD, t('loot.none'), '#909090');
      y += ROW_H;
    }
    const rowTints: Phaser.GameObjects.Rectangle[] = [];
    for (const item of visible) {
      const expanded = item.uid === this.expandedUid;
      // Faint blue row tint (M5.2b1): this item beats what's worn in at least one stat.
      // Sized to the panel's final width once that's known (see the loop below).
      if (!expanded && this.actions.hasUpgrade(item)) {
        const tint = this.scene.add.rectangle(PAD - 4, y - 2, 10, ROW_H, UPGRADE_TINT, 0.25).setOrigin(0, 0);
        this.add(tint);
        this.rows.push(tint);
        rowTints.push(tint);
      }
      // Tap the summary to compare (M5.2b1); tap again (or another item) to switch/close.
      const label = addText(PAD, `${expanded ? '▾' : '▸'} ${itemSummary(item)}`, this.actions.colorOf(item));
      label.setInteractive({ useHandCursor: true }).on('pointerup', () => {
        this.expandedUid = expanded ? null : item.uid;
        this.dirty = true;
      });
      y += ROW_H;
      if (expanded) {
        for (const slot of slotsFor(item.slot)) {
          const lines = this.actions.compareToSlot(item, slot);
          if (lines.length === 0) {
            addText(PAD + 12, t('compare.none'), '#909090');
            y += ROW_H;
          }
          for (const line of lines) {
            addText(PAD + 12, line.text, LINE_COLOR[line.verdict]);
            y += ROW_H;
          }
          addButton(
            PAD + 12,
            slot === 'leftPaw' ? t('items.equipLeft') : slot === 'rightPaw' ? t('items.equipRight') : t('items.equip'),
            () => {
              this.expandedUid = null;
              this.actions.onEquip(item.uid, slot);
            },
          );
          y += ROW_H;
        }
      }
    }
    for (const tint of rowTints) tint.setSize(width - (PAD - 4) * 2, ROW_H);
    this.bg.setSize(width, y + PAD - 4);
  }

  private scroll(delta: number): void {
    if (!this.shown) return;
    const maxOffset = Math.max(0, this.shown.bag.length - BAG_ROWS);
    this.scrollOffset = Math.max(0, Math.min(maxOffset, this.scrollOffset + delta * BAG_ROWS));
    this.dirty = true;
  }
}
