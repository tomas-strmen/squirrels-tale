import Phaser from 'phaser';

export interface ProgressBarOptions {
  readonly width: number;
  readonly height: number;
  readonly fillColor: number;
  readonly backColor?: number;
}

/** Simple horizontal bar: grey background + fill that grows from the left. */
export class ProgressBar extends Phaser.GameObjects.Container {
  private readonly fill: Phaser.GameObjects.Rectangle;

  constructor(scene: Phaser.Scene, x: number, y: number, options: ProgressBarOptions) {
    super(scene, x, y);
    const { width, height, fillColor, backColor = 0x222222 } = options;
    const back = scene.add
      .rectangle(-width / 2, 0, width, height, backColor)
      .setOrigin(0, 0.5)
      .setStrokeStyle(2, 0x111111);
    this.fill = scene.add.rectangle(-width / 2, 0, width, height - 4, fillColor).setOrigin(0, 0.5);
    this.add([back, this.fill]);
    this.setProgress(0);
    scene.add.existing(this);
  }

  /** @param value 0..1 */
  setProgress(value: number): this {
    this.fill.scaleX = Math.min(1, Math.max(0, value));
    return this;
  }
}
