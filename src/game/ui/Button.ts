import Phaser from 'phaser';

const FILL = 0x5a5a5a;
const FILL_HOVER = 0x767676;
const FILL_SELECTED = 0x3a6ea5;
const FILL_SELECTED_HOVER = 0x4a82bd;

export interface ButtonOptions {
  readonly width?: number;
  readonly height?: number;
  readonly fontSize?: number;
}

/** Grey placeholder button: rectangle + label, with hover and click. Can be marked as selected. */
export class Button extends Phaser.GameObjects.Container {
  private readonly bg: Phaser.GameObjects.Rectangle;
  private readonly label: Phaser.GameObjects.Text;
  private selected = false;
  private hovered = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    label: string,
    onClick: () => void,
    options: ButtonOptions = {},
  ) {
    super(scene, x, y);
    const { width = 260, height = 64, fontSize = 28 } = options;
    this.bg = scene.add.rectangle(0, 0, width, height, FILL).setStrokeStyle(3, 0xdddddd);
    this.label = scene.add
      .text(0, 0, label, { fontFamily: 'Arial, sans-serif', fontSize: `${fontSize}px`, color: '#ffffff' })
      .setOrigin(0.5);
    this.add([this.bg, this.label]);
    this.bg
      .setInteractive({ useHandCursor: true })
      .on('pointerover', () => {
        this.hovered = true;
        this.refreshFill();
      })
      .on('pointerout', () => {
        this.hovered = false;
        this.refreshFill();
      })
      .on('pointerup', onClick);
    scene.add.existing(this);
  }

  setLabel(text: string): this {
    this.label.setText(text);
    return this;
  }

  /** Highlights the button (e.g. the active option in a group). */
  setSelected(selected: boolean): this {
    this.selected = selected;
    this.refreshFill();
    return this;
  }

  private refreshFill(): void {
    const fill = this.selected
      ? this.hovered
        ? FILL_SELECTED_HOVER
        : FILL_SELECTED
      : this.hovered
        ? FILL_HOVER
        : FILL;
    this.bg.setFillStyle(fill);
  }
}
