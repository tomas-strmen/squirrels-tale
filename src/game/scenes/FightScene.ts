import Phaser from 'phaser';
import balanceData from '../../../data/balance.json';
import enemiesData from '../../../data/enemies.json';
import en from '../../../strings/en.json';
import { now } from '../../core/clock/clock';
import { toEncounterConfigInput } from '../../core/content/encounterInput';
import { parseBalance, parseEnemies } from '../../core/content/schemas';
import {
  attackProgress,
  createEncounter,
  createEncounterConfig,
  hpFraction,
  makePeace,
  searchProgress,
  startSearch,
  tick,
  type Combatant,
  type EncounterConfig,
  type EncounterEvent,
  type EncounterState,
} from '../../core/encounter/encounter';
import { formatHundredths } from '../../core/numbers/numbers';
import { createRng } from '../../core/rng/rng';
import { consumeFrame } from '../../core/time/fixedStep';
import { t, tDynamic } from '../text';
import { Button } from '../ui/Button';
import { DebugPanel } from '../ui/DebugPanel';
import { ProgressBar } from '../ui/ProgressBar';

// Layout only (not game balance) – placeholder grey shapes.
const W = 1280;
const PLAYER_X = 380;
const ENEMY_X = 900;
const FIGHTER_Y = 330;
const FIGHTER_SIZE = 120;
const LUNGE_PX = 40;
const PEACE_X = 1080;
const BUTTON_Y = 620;
const HP_BAR_Y = FIGHTER_Y - 95;

/**
 * M0.1: squirrel waits, "Find enemy" → search bar → enemy appears → attack bars loop.
 * M0.1b: "Peace!" (while searching or fighting) → back to waiting.
 * M2.1: HP bars, damage numbers / "Miss", enemy dies → next search; squirrel
 * knocked out → back to waiting at full HP (placeholder until M3).
 */
export class FightScene extends Phaser.Scene {
  private config!: EncounterConfig;
  private state!: EncounterState;
  private accumulatorMs = 0;

  private player!: Phaser.GameObjects.Rectangle;
  private enemy!: Phaser.GameObjects.Rectangle;
  private enemyGroup!: Phaser.GameObjects.Container;
  private playerBar!: ProgressBar;
  private playerAttackGroup!: Phaser.GameObjects.Container;
  private enemyBar!: ProgressBar;
  private searchGroup!: Phaser.GameObjects.Container;
  private searchBar!: ProgressBar;
  private findButton!: Button;
  private peaceButton!: Button;
  private debugPanel!: DebugPanel;
  private playerHpBar!: ProgressBar;
  private playerHpText!: Phaser.GameObjects.Text;
  private enemyHpBar!: ProgressBar;
  private enemyHpText!: Phaser.GameObjects.Text;
  private textStyle = { fontFamily: 'Arial, sans-serif', color: '#e0e0e0' };

  constructor() {
    super('FightScene');
  }

  create(): void {
    // Validated against their zod schemas (core/content) so bad data fails
    // loudly here too, not only in tests.
    const enemies = parseEnemies(enemiesData);
    const balance = parseBalance(balanceData);
    const enemyData = enemies[0];
    if (!enemyData) throw new Error('data/enemies.json has no enemies');

    this.config = createEncounterConfig(toEncounterConfigInput(balance, enemyData));
    // Seeded Rng (GDD 5); a new seed per session until saves arrive in M8.
    this.state = createEncounter(this.config, createRng(now()));
    this.accumulatorMs = 0;

    const textStyle = this.textStyle;

    this.add.text(W / 2, 60, t('game.title'), { ...textStyle, fontSize: '44px' }).setOrigin(0.5);

    // Player (always visible)
    this.player = this.add.rectangle(PLAYER_X, FIGHTER_Y, FIGHTER_SIZE, FIGHTER_SIZE, 0xc8c8c8);
    this.add
      .text(PLAYER_X, FIGHTER_Y + 90, t('player.name'), { ...textStyle, fontSize: '26px' })
      .setOrigin(0.5);
    const playerAttackLabel = this.add
      .text(PLAYER_X, FIGHTER_Y + 130, t('fight.attack'), { ...textStyle, fontSize: '18px' })
      .setOrigin(0.5);
    this.playerBar = new ProgressBar(this, PLAYER_X, FIGHTER_Y + 160, {
      width: 200,
      height: 22,
      fillColor: 0xdddddd,
    });
    // HP (always visible for the squirrel)
    this.playerHpText = this.add
      .text(PLAYER_X, HP_BAR_Y - 24, '', { ...textStyle, fontSize: '18px' })
      .setOrigin(0.5);
    this.playerHpBar = new ProgressBar(this, PLAYER_X, HP_BAR_Y, {
      width: 160,
      height: 16,
      fillColor: 0x8fbf8f,
    });
    // Attack bar only makes sense while fighting.
    this.playerAttackGroup = this.add.container(0, 0, [playerAttackLabel, this.playerBar]);
    this.playerAttackGroup.setVisible(false);

    // Enemy (hidden until found)
    this.enemy = this.add
      .rectangle(ENEMY_X, FIGHTER_Y, FIGHTER_SIZE, FIGHTER_SIZE, 0x7a7a7a)
      .setStrokeStyle(3, 0x4a4a4a);
    const enemyName = this.add
      .text(ENEMY_X, FIGHTER_Y + 90, tDynamic(`enemy.${enemyData.id}.name`), {
        ...textStyle,
        fontSize: '26px',
      })
      .setOrigin(0.5);
    const enemyAttackLabel = this.add
      .text(ENEMY_X, FIGHTER_Y + 130, t('fight.attack'), { ...textStyle, fontSize: '18px' })
      .setOrigin(0.5);
    this.enemyBar = new ProgressBar(this, ENEMY_X, FIGHTER_Y + 160, {
      width: 200,
      height: 22,
      fillColor: 0x9a9a9a,
    });
    this.enemyHpText = this.add
      .text(ENEMY_X, HP_BAR_Y - 24, '', { ...textStyle, fontSize: '18px' })
      .setOrigin(0.5);
    this.enemyHpBar = new ProgressBar(this, ENEMY_X, HP_BAR_Y, {
      width: 160,
      height: 16,
      fillColor: 0xbf8f8f,
    });
    this.enemyGroup = this.add.container(0, 0, [
      this.enemy,
      enemyName,
      enemyAttackLabel,
      this.enemyBar,
      this.enemyHpText,
      this.enemyHpBar,
    ]);
    this.enemyGroup.setVisible(false);

    // Find enemy button + search bar (same spot, one visible at a time)
    this.findButton = new Button(this, W / 2, BUTTON_Y, t('fight.findEnemy'), () => this.onFindEnemy());
    const searchLabel = this.add
      .text(0, -30, t('fight.searching'), { ...textStyle, fontSize: '22px' })
      .setOrigin(0.5);
    this.searchBar = new ProgressBar(this, 0, 5, { width: 320, height: 24, fillColor: 0xbbbbbb });
    this.searchGroup = this.add.container(W / 2, BUTTON_Y, [searchLabel, this.searchBar]);
    this.searchGroup.setVisible(false);

    // Peace! button (visible while searching or fighting)
    this.peaceButton = new Button(this, PEACE_X, BUTTON_Y, t('fight.peace'), () => this.onPeace());
    this.peaceButton.setVisible(false);

    // M1 debug panel: shows loaded enemies/texts, toggled with "D".
    this.add
      .text(10, 690, t('debug.hint'), { ...textStyle, fontSize: '14px', color: '#707070' })
      .setOrigin(0, 0);
    this.debugPanel = new DebugPanel(this, 10, 10, {
      enemies,
      textCount: Object.keys(en).length,
    });
    this.debugPanel.setVisible(false);
    this.input.keyboard?.on('keydown-D', () => {
      this.debugPanel.setVisible(!this.debugPanel.visible);
    });
  }

  override update(_time: number, delta: number): void {
    const frame = consumeFrame(this.accumulatorMs, delta);
    this.accumulatorMs = frame.accumulatorMs;
    for (let i = 0; i < frame.steps; i++) {
      const step = tick(this.state, this.config);
      this.state = step.state;
      step.events.forEach((e) => this.onEvent(e));
    }
    // accumulatorMs (< 1 tick, always > 0) smooths the bars between ticks for
    // rendering only - it never changes the simulation state itself.
    this.searchBar.setProgress(searchProgress(this.state, this.config, this.accumulatorMs));
    this.playerBar.setProgress(
      attackProgress(this.state, this.config, 'player', this.accumulatorMs),
    );
    this.enemyBar.setProgress(
      attackProgress(this.state, this.config, 'enemy', this.accumulatorMs),
    );
    this.playerHpBar.setProgress(hpFraction(this.state, this.config, 'player'));
    this.playerHpText.setText(
      `${formatHundredths(this.state.playerHp)} / ${formatHundredths(this.config.player.maxHp)}`,
    );
    // Keep showing the last enemy HP while it fades out after its defeat.
    if (this.state.phase === 'fighting') {
      this.enemyHpBar.setProgress(hpFraction(this.state, this.config, 'enemy'));
      this.enemyHpText.setText(
        `${formatHundredths(this.state.enemyHp)} / ${formatHundredths(this.config.enemy.maxHp)}`,
      );
    }
  }

  private onFindEnemy(): void {
    const step = startSearch(this.state);
    this.state = step.state;
    step.events.forEach((e) => this.onEvent(e));
  }

  private onPeace(): void {
    const step = makePeace(this.state);
    this.state = step.state;
    step.events.forEach((e) => this.onEvent(e));
  }

  private onEvent(event: EncounterEvent): void {
    switch (event.type) {
      case 'searchStarted':
        this.findButton.setVisible(false);
        this.searchGroup.setVisible(true);
        this.peaceButton.setVisible(true);
        break;
      case 'enemyFound':
        this.searchGroup.setVisible(false);
        this.tweens.killTweensOf(this.enemyGroup);
        this.enemy.setAlpha(1);
        this.enemyGroup.setVisible(true).setAlpha(0);
        this.tweens.add({ targets: this.enemyGroup, alpha: 1, duration: 250 });
        this.playerAttackGroup.setVisible(true);
        break;
      case 'attack':
        this.lunge(event.attacker, event.hit);
        this.popup(event.attacker === 'player' ? ENEMY_X : PLAYER_X, event.hit, event.damage);
        break;
      case 'enemyDefeated':
        // Enemy bar shows 0 before it fades; next search starts in the same tick.
        this.enemyHpBar.setProgress(0);
        this.enemyHpText.setText(`0.0 / ${formatHundredths(this.config.enemy.maxHp)}`);
        this.playerAttackGroup.setVisible(false);
        this.tweens.add({
          targets: this.enemyGroup,
          alpha: 0,
          duration: 400,
          onComplete: () => this.enemyGroup.setVisible(false),
        });
        break;
      case 'playerDefeated':
        this.resetToIdle();
        this.floatingText(PLAYER_X, FIGHTER_Y - 70, t('fight.knockedOut'), '#ff9f9f', 1500);
        break;
      case 'peaceMade':
        this.resetToIdle();
        break;
    }
  }

  /** Enemy leaves at once, bars hide, "Find enemy" is back. */
  private resetToIdle(): void {
    for (const [shape, baseX] of [
      [this.player, PLAYER_X],
      [this.enemy, ENEMY_X],
    ] as const) {
      this.tweens.killTweensOf(shape);
      shape.setPosition(baseX, FIGHTER_Y).setAlpha(1);
    }
    this.tweens.killTweensOf(this.enemyGroup);
    this.enemyGroup.setVisible(false).setAlpha(1);
    this.playerAttackGroup.setVisible(false);
    this.searchGroup.setVisible(false);
    this.peaceButton.setVisible(false);
    this.findButton.setVisible(true);
  }

  /** Damage number or "Miss" rising above the target. */
  private popup(x: number, hit: boolean, damage: number): void {
    if (hit) {
      this.floatingText(x, FIGHTER_Y - 70, `-${formatHundredths(damage)}`, '#ffffff', 700);
    } else {
      this.floatingText(x, FIGHTER_Y - 70, t('fight.miss'), '#a0a0a0', 700);
    }
  }

  private floatingText(x: number, y: number, text: string, color: string, durationMs: number): void {
    const label = this.add
      .text(x, y, text, { ...this.textStyle, fontSize: '28px', color })
      .setOrigin(0.5);
    this.tweens.add({
      targets: label,
      y: y - 40,
      alpha: 0,
      duration: durationMs,
      ease: 'Quad.easeOut',
      onComplete: () => label.destroy(),
    });
  }

  /** Short hop towards the opponent + flash of the target on a hit (visual only). */
  private lunge(attacker: Combatant, hit: boolean): void {
    const [shape, target, dir, baseX] =
      attacker === 'player'
        ? [this.player, this.enemy, 1, PLAYER_X]
        : [this.enemy, this.player, -1, ENEMY_X];
    this.tweens.killTweensOf(shape);
    shape.x = baseX;
    this.tweens.add({
      targets: shape,
      x: baseX + dir * LUNGE_PX,
      duration: 90,
      yoyo: true,
      ease: 'Quad.easeOut',
    });
    if (!hit) return;
    this.tweens.add({
      targets: target,
      alpha: 0.4,
      duration: 70,
      delay: 70,
      yoyo: true,
    });
  }
}
