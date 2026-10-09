import Phaser from 'phaser';
import type { EncounterState } from '../../core/encounter/encounter';
import type { Item } from '../../core/loot/loot';
import { itemSummary } from '../itemText';
import { t } from '../text';
import { Button } from './Button';

const ROW_H = 22;
const PAD = 8;
const FONT = { fontFamily: 'monospace', fontSize: '13px', color: '#dddddd' };
/** Bag rows shown at once in the sell list; ▲/▼ reach the rest. */
const SELL_ROWS = 8;

export interface ShopPanelActions {
  /** "5 Pebbles" - what she asks for a stock item. */
  readonly buyLabel: (item: Item) => string;
  /** "+1 Seeds" - what she pays for a bag item. */
  readonly sellLabel: (item: Item) => string;
  readonly canAfford: (item: Item) => boolean;
  readonly colorOf: (item: Item) => string;
  /** "New stock in 5 h 12 min". */
  readonly restockText: () => string;
  readonly onBuy: (uid: number) => void;
  readonly onSell: (uid: number) => void;
}

/**
 * M10.2: the Magpie's shop (GDD 11.2) - today's stock with Buy buttons, then the bag with Sell
 * buttons (locked items can't be sold). Redrawn only when the stock, bag or wallet change.
 */
export class ShopPanel extends Phaser.GameObjects.Container {
  private readonly bg: Phaser.GameObjects.Rectangle;
  private rows: Phaser.GameObjects.GameObject[] = [];
  private shown: { merchant: unknown; bag: unknown; wallet: unknown } | null = null;
  private encounter: EncounterState | null = null;
  private scrollOffset = 0;
  /** Set by clicks; render on the next `show` (never destroy a button inside its own click). */
  private dirty = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly actions: ShopPanelActions,
  ) {
    super(scene, x, y);
    this.bg = scene.add.rectangle(0, 0, 10, 10, 0x000000, 0.8).setOrigin(0, 0);
    this.add(this.bg);
    this.setDepth(50);
    scene.add.existing(this);
  }

  /** Call every frame while visible. */
  show(state: EncounterState): void {
    this.encounter = state;
    const s = this.shown;
    if (!s || s.merchant !== state.merchant || s.bag !== state.inventory.bag || s.wallet !== state.wallet) {
      this.shown = { merchant: state.merchant, bag: state.inventory.bag, wallet: state.wallet };
      this.dirty = true;
    }
    if (this.dirty) {
      this.dirty = false;
      this.render();
    }
  }

  private render(): void {
    const state = this.encounter;
    if (!state) return;
    this.rows.forEach((r) => r.destroy());
    this.rows = [];
    let y = PAD;
    let width = 300;
    const addText = (x: number, text: string, color = FONT.color) => {
      const label = this.scene.add.text(x, y, text, { ...FONT, color });
      this.add(label);
      this.rows.push(label);
      width = Math.max(width, x + label.width + PAD);
      return label;
    };
    const addButton = (x: number, label: string, onClick: () => void, w = 48) => {
      const b = new Button(this.scene, x + w / 2, y + 9, label, onClick, { width: w, height: 18, fontSize: 12 });
      this.add(b);
      this.rows.push(b);
      return b;
    };
    const later = (fn: () => void) => () => {
      this.scene.time.delayedCall(0, fn);
    };

    addText(PAD, t('shop.title'), '#ffe08a');
    addText(170, this.actions.restockText(), '#909090');
    y += ROW_H + 4;
    addText(PAD, t('shop.forSale'));
    y += ROW_H;
    if (state.merchant.stock.length === 0) {
      addText(PAD, t('shop.soldOut'), '#909090');
      y += ROW_H;
    }
    for (const item of state.merchant.stock) {
      const buy = addButton(PAD, t('shop.buy'), later(() => this.actions.onBuy(item.uid)));
      if (!this.actions.canAfford(item)) buy.setAlpha(0.5);
      addText(PAD + 56, this.actions.buyLabel(item), '#e8d9a0');
      addText(PAD + 160, itemSummary(item), this.actions.colorOf(item));
      y += ROW_H;
    }

    y += 8;
    addText(PAD, t('shop.yourBag'));
    const bag = [...state.inventory.bag].reverse(); // newest first, like the bag panel
    const maxOffset = Math.max(0, bag.length - SELL_ROWS);
    this.scrollOffset = Math.min(this.scrollOffset, maxOffset);
    if (maxOffset > 0) {
      addButton(220, '▲', later(() => this.scroll(-1)), 40);
      addButton(266, '▼', later(() => this.scroll(1)), 40);
    }
    y += ROW_H;
    if (bag.length === 0) {
      addText(PAD, t('shop.bagEmpty'), '#909090');
      y += ROW_H;
    }
    for (const item of bag.slice(this.scrollOffset, this.scrollOffset + SELL_ROWS)) {
      if (item.locked) addText(PAD + 14, '🔒');
      else addButton(PAD, t('shop.sell'), later(() => this.actions.onSell(item.uid)));
      addText(PAD + 56, this.actions.sellLabel(item), '#e8d9a0');
      addText(PAD + 160, itemSummary(item), this.actions.colorOf(item));
      y += ROW_H;
    }
    this.bg.setSize(width, y + PAD);
  }

  private scroll(delta: number): void {
    this.scrollOffset = Math.max(0, this.scrollOffset + delta);
    this.dirty = true;
  }
}
