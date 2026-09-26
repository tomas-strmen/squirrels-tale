import Phaser from 'phaser';

/** Grey placeholder button: rectangle + label, with hover and click. */
export class Button extends Phaser.GameObjects.Container {
  private readonly bg: Phaser.GameObjects.Rectangle;
  private readonly label: Phaser.GameObjects.Text;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    label: string,
    onClick: () => void,
  ) {
    super(scene, x, y);
    this.bg = scene.add.rectangle(0, 0, 260, 64, 0x5a5a5a).setStrokeStyle(3, 0xdddddd);
    this.label = scene.add
      .text(0, 0, label, { fontFamily: 'Arial, sans-serif', fontSize: '28px', color: '#ffffff' })
      .setOrigin(0.5);
    this.add([this.bg, this.label]);
    this.bg
      .setInteractive({ useHandCursor: true })
      .on('pointerover', () => this.bg.setFillStyle(0x767676))
      .on('pointerout', () => this.bg.setFillStyle(0x5a5a5a))
      .on('pointerup', onClick);
    scene.add.existing(this);
  }

  setLabel(text: string): this {
    this.label.setText(text);
    return this;
  }
}
