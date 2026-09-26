import Phaser from 'phaser';

/**
 * Player-facing stats panel (Tomas, M3.1): shows level, XP progress and the
 * squirrel's current combat stats. Hidden by default; FightScene toggles it
 * with the "Show stats" button and refreshes its content every frame while open.
 */
export class StatsPanel extends Phaser.GameObjects.Container {
  private readonly text: Phaser.GameObjects.Text;
  private readonly bg: Phaser.GameObjects.Rectangle;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);
    const style = { fontFamily: 'monospace', color: '#dddddd', fontSize: '16px' };
    const padding = 10;
    this.text = scene.add.text(padding, padding, '', style);
    this.bg = scene.add.rectangle(0, 0, 10, 10, 0x000000, 0.75).setOrigin(0, 0);
    this.add([this.bg, this.text]);
    scene.add.existing(this);
  }

  setLines(lines: readonly string[]): void {
    this.text.setText(lines.join('\n'));
    const padding = 10;
    this.bg.setSize(this.text.width + padding * 2, this.text.height + padding * 2);
  }
}
