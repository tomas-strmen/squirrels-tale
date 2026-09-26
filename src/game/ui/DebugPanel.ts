import Phaser from 'phaser';
import type { Enemy } from '../../core/content/schemas';
import { t } from '../text';

export interface DebugPanelData {
  readonly enemies: readonly Enemy[];
  readonly textCount: number;
}

/**
 * M1 debug panel (GDD 22, M1): shows the enemies and texts the game loaded,
 * so a broken data/en.json file is obvious in the browser, not just in tests.
 * Hidden by default; FightScene toggles it with the "D" key.
 */
export class DebugPanel extends Phaser.GameObjects.Container {
  constructor(scene: Phaser.Scene, x: number, y: number, data: DebugPanelData) {
    super(scene, x, y);

    const style = { fontFamily: 'monospace', color: '#8fff8f', fontSize: '16px' };
    const lines: string[] = [
      t('debug.title'),
      `${t('debug.enemiesLoaded')}: ${data.enemies.length}`,
      ...data.enemies.map((e) => `  - ${e.id} (${e.attackIntervalS.toFixed(1)}s)`),
      `${t('debug.textsLoaded')}: ${data.textCount}`,
    ];

    const padding = 10;
    const text = scene.add.text(padding, padding, lines.join('\n'), style);
    const bg = scene.add.rectangle(
      0,
      0,
      text.width + padding * 2,
      text.height + padding * 2,
      0x000000,
      0.75,
    );
    bg.setOrigin(0, 0);

    this.add([bg, text]);
    scene.add.existing(this);
  }
}
