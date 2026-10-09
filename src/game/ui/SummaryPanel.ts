import Phaser from 'phaser';
import { Button } from './Button';

export interface SummaryLine {
  readonly text: string;
  readonly color?: string;
}

const PAD = 18;
const LINE_H = 24;
const WIDTH = 560;

/**
 * Modal text panel in the middle of the screen with an OK button (M9.2: "While You Were
 * Away"). A dark full-screen backdrop swallows clicks so nothing behind it gets pressed.
 */
export class SummaryPanel extends Phaser.GameObjects.Container {
  constructor(scene: Phaser.Scene, title: string, lines: readonly SummaryLine[], okLabel: string, onClose: () => void) {
    const { width: sw, height: sh } = scene.scale.gameSize;
    super(scene, 0, 0);
    const height = PAD * 2 + 34 + lines.length * LINE_H + 60;
    const left = (sw - WIDTH) / 2;
    const top = Math.max(10, (sh - height) / 2);
    const backdrop = scene.add.rectangle(0, 0, sw, sh, 0x000000, 0.55).setOrigin(0, 0).setInteractive();
    const bg = scene.add.rectangle(left, top, WIDTH, height, 0x262626, 0.97).setOrigin(0, 0).setStrokeStyle(2, 0xbbbbbb);
    this.add([backdrop, bg]);
    this.add(
      scene.add
        .text(sw / 2, top + PAD, title, { fontFamily: 'Arial, sans-serif', fontSize: '26px', color: '#ffe08a' })
        .setOrigin(0.5, 0),
    );
    lines.forEach((line, i) => {
      this.add(
        scene.add.text(left + PAD, top + PAD + 44 + i * LINE_H, line.text, {
          fontFamily: 'monospace',
          fontSize: '16px',
          color: line.color ?? '#dddddd',
        }),
      );
    });
    const ok = new Button(scene, sw / 2, top + height - PAD - 18, okLabel, () => {
      // Never destroy a Phaser object inside its own click handler (see ItemsPanel) - next frame.
      scene.time.delayedCall(0, () => this.destroy());
      onClose();
    }, { width: 140, height: 40, fontSize: 20 });
    this.add(ok);
    this.setDepth(1000);
    scene.add.existing(this);
  }
}
