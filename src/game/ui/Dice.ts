import Phaser from 'phaser';

const ROLL_MS = 700;
const SETTLE_STEP_MS = 60;

/**
 * A single d20 (GDD 9.6): spins through random-looking faces for a moment,
 * then settles on the given final face. The outcome is already decided
 * (core/loot.diceFaces) - this is purely a visual effect.
 */
export class Dice extends Phaser.GameObjects.Container {
  private readonly bg: Phaser.GameObjects.Rectangle;
  private readonly text: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, x: number, y: number, gold = false) {
    super(scene, x, y);
    this.bg = scene.add
      .rectangle(0, 0, 64, 64, gold ? 0x6b5416 : 0x3a3a3a)
      .setStrokeStyle(3, gold ? 0xe0b84a : 0xdddddd);
    this.text = scene.add
      .text(0, 0, '', { fontFamily: 'Arial, sans-serif', fontSize: '28px', color: '#ffffff' })
      .setOrigin(0.5);
    this.add([this.bg, this.text]);
    scene.add.existing(this);
  }

  /** Spins briefly, then lands on `finalFace` (1-20) and calls `onDone`. */
  roll(finalFace: number, onDone?: () => void): void {
    const steps = Math.round(ROLL_MS / SETTLE_STEP_MS);
    let step = 0;
    const timer = this.scene.time.addEvent({
      delay: SETTLE_STEP_MS,
      repeat: steps,
      callback: () => {
        step += 1;
        const value = step > steps ? finalFace : 1 + Math.floor(Math.random() * 20);
        this.text.setText(String(value));
        if (step > steps) {
          timer.remove();
          onDone?.();
        }
      },
    });
  }

  destroyDelayed(delayMs: number): void {
    this.scene.time.delayedCall(delayMs, () => this.destroy());
  }
}
