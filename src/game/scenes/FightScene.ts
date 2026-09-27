import Phaser from 'phaser';
import affixesData from '../../../data/affixes.json';
import balanceData from '../../../data/balance.json';
import enemiesData from '../../../data/enemies.json';
import itemsData from '../../../data/items.json';
import raritiesData from '../../../data/rarities.json';
import en from '../../../strings/en.json';
import { now } from '../../core/clock/clock';
import { toEncounterConfigInput } from '../../core/content/encounterInput';
import { parseAffixes, parseBalance, parseEnemies, parseItems, parseRarities } from '../../core/content/schemas';
import {
  attackProgress,
  createEncounter,
  createEncounterConfig,
  equipItem,
  hideoutProgress,
  hpFraction,
  makePeace,
  playerAttackIntervalMs,
  playerStats,
  searchProgress,
  startSearch,
  tick,
  unequipItem,
  type Combatant,
  type EncounterConfig,
  type EncounterEvent,
  type EncounterState,
} from '../../core/encounter/encounter';
import { hitChancePct } from '../../core/combat/combat';
import { formatHpHundredths, formatHundredths, fromHundredths } from '../../core/numbers/numbers';
import { regenAmountHundredths, xpToNextLevelHundredths } from '../../core/progression/progression';
import { createRng } from '../../core/rng/rng';
import { diceFaces, pityCountdowns, type Item } from '../../core/loot/loot';
import { consumeFrame, DEFAULT_MAX_STEPS_PER_FRAME, TICK_MS } from '../../core/time/fixedStep';
import { itemName, rarityName } from '../itemText';
import { t, tDynamic } from '../text';
import { Button } from '../ui/Button';
import { DebugPanel } from '../ui/DebugPanel';
import { Dice } from '../ui/Dice';
import { ProgressBar } from '../ui/ProgressBar';
import { ItemsPanel } from '../ui/ItemsPanel';
import { StatsPanel } from '../ui/StatsPanel';

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
const SPEED_OPTIONS = [1, 4, 20, 50] as const;
// Debug tool (Tomas): faster item drops for testing, not real game balance.
const DROP_RATE_OPTIONS = [1, 10, 100] as const;

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
  private speedIndex = 0;
  private dropRateIndex = 0;
  private baseDropChanceBp = 0;

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
  private hideoutGroup!: Phaser.GameObjects.Container;
  private hideoutBar!: ProgressBar;
  private debugPanel!: DebugPanel;
  private playerHpBar!: ProgressBar;
  private playerHpText!: Phaser.GameObjects.Text;
  private enemyHpBar!: ProgressBar;
  private enemyHpText!: Phaser.GameObjects.Text;
  private textStyle = { fontFamily: 'Arial, sans-serif', color: '#e0e0e0' };
  private speedButtons: Button[] = [];
  private dropRateButtons: Button[] = [];
  private levelText!: Phaser.GameObjects.Text;
  private statsButton!: Button;
  private statsPanel!: StatsPanel;
  private lootButton!: Button;
  private lootPanel!: ItemsPanel;
  private rarityColors = new Map<string, string>();
  /** Simulated game time (counts faster at x4/x20/x50 - it follows the simulation). */
  private simElapsedMs = 0;
  private timeText!: Phaser.GameObjects.Text;
  private pityText!: Phaser.GameObjects.Text;

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

    const rarities = parseRarities(raritiesData);
    this.rarityColors = new Map(rarities.map((r) => [r.id, r.color]));
    this.config = createEncounterConfig(
      toEncounterConfigInput(balance, enemyData, {
        items: parseItems(itemsData),
        rarities,
        affixes: parseAffixes(affixesData),
      }),
    );
    this.baseDropChanceBp = this.config.loot.dropChanceBp;
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
    // Level (always visible for the squirrel, GDD 6.2)
    this.levelText = this.add
      .text(PLAYER_X, HP_BAR_Y - 44, '', { ...textStyle, fontSize: '16px', color: '#c8c8ff' })
      .setOrigin(0.5);
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
      // GDD 8.4: level shown next to the name ("Worker Ant Lv1").
      .text(ENEMY_X, FIGHTER_Y + 90, `${tDynamic(`enemy.${enemyData.id}.name`)} ${t('fight.levelShort')}${this.config.enemyLevel}`, {
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

    // Hideout recovery (GDD 6.3, M3.2 placeholder): same spot as Find enemy/search.
    const hideoutLabel = this.add
      .text(0, -30, t('hideout.regenerating'), { ...textStyle, fontSize: '22px' })
      .setOrigin(0.5);
    this.hideoutBar = new ProgressBar(this, 0, 5, { width: 320, height: 24, fillColor: 0x8fa8bf });
    this.hideoutGroup = this.add.container(W / 2, BUTTON_Y, [hideoutLabel, this.hideoutBar]);
    this.hideoutGroup.setVisible(false);

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

    // Debug tool (GDD 22, M2.2): one button per speed x1/x4/x20/x50, the active one highlighted.
    this.add
      .text(W - 370, 40, t('debug.speed'), { ...textStyle, fontSize: '20px' })
      .setOrigin(1, 0.5);
    this.speedButtons = SPEED_OPTIONS.map((speed, index) =>
      new Button(this, W - 320 + index * 88, 40, `×${speed}`, () => this.onSelectSpeed(index), {
        width: 80,
        height: 40,
        fontSize: 20,
      }),
    );
    this.refreshSpeedButtons();

    // Debug tool (Tomas): drop rate ×1/×10/100 % for faster item testing.
    this.add
      .text(W - 370, 90, t('debug.dropRate'), { ...textStyle, fontSize: '20px' })
      .setOrigin(1, 0.5);
    const dropRateLabels = ['×1', '×10', '100%'];
    this.dropRateButtons = DROP_RATE_OPTIONS.map((_, index) =>
      new Button(this, W - 320 + index * 88, 90, dropRateLabels[index] ?? '', () => this.onSelectDropRate(index), {
        width: 80,
        height: 40,
        fontSize: 20,
      }),
    );
    this.refreshDropRateButtons();

    // Player-facing stats panel (Tomas, M3.1): level, XP, HP, damage, hit%, armor.
    this.statsButton = new Button(this, 150, 40, t('stats.button'), () => this.onToggleStats());
    this.statsButton.setScale(0.55);
    // Bottom-left, above "Time" (Tomas, M5.1) - can be open together with Found items.
    this.statsPanel = new StatsPanel(this, 10, 0).anchorBottom(632);
    this.statsPanel.setVisible(false);

    // M4.1: items found so far (placeholder until the inventory in M5). Shares the spot with Stats.
    this.lootButton = new Button(this, 340, 40, t('loot.button'), () => this.onToggleLoot());
    this.lootButton.setScale(0.55);
    this.lootPanel = new ItemsPanel(this, 10, 70, {
      onEquip: (uid, slot) => {
        this.state = equipItem(this.state, this.config, uid, slot);
      },
      onUnequip: (slot) => {
        this.state = unequipItem(this.state, this.config, slot);
      },
      colorOf: (item) => this.rarityColors.get(item.rarityId) ?? '#ffffff',
    });
    this.lootPanel.setVisible(false);

    // Bottom-left info: game time (follows the simulation speed) and the pity countdown (GDD 9.6).
    this.simElapsedMs = 0;
    this.timeText = this.add.text(10, 640, '', { ...textStyle, fontSize: '16px', color: '#a0a0a0' });
    this.pityText = this.add.text(10, 662, '', { ...textStyle, fontSize: '16px', color: '#a0a0a0' });
  }

  private onToggleLoot(): void {
    this.lootPanel.setVisible(!this.lootPanel.visible);
  }

  private refreshLootPanel(): void {
    this.lootPanel.show(this.state.inventory);
  }

  private currentSpeed(): number {
    return SPEED_OPTIONS[this.speedIndex] ?? 1;
  }

  private onSelectSpeed(index: number): void {
    this.speedIndex = index;
    this.refreshSpeedButtons();
  }

  private refreshSpeedButtons(): void {
    this.speedButtons.forEach((button, index) => button.setSelected(index === this.speedIndex));
  }

  private onSelectDropRate(index: number): void {
    this.dropRateIndex = index;
    const multiplier = DROP_RATE_OPTIONS[index] ?? 1;
    const dropChanceBp = multiplier === 100 ? 10000 : Math.min(10000, this.baseDropChanceBp * multiplier);
    this.config = { ...this.config, loot: { ...this.config.loot, dropChanceBp } };
    this.refreshDropRateButtons();
  }

  private refreshDropRateButtons(): void {
    this.dropRateButtons.forEach((button, index) => button.setSelected(index === this.dropRateIndex));
  }

  private onToggleStats(): void {
    this.statsPanel.setVisible(!this.statsPanel.visible);
  }

  private refreshStatsPanel(): void {
    const gear = this.state.inventory.equipment;
    const stats = playerStats(this.config, this.state.progression.level, gear);
    const { level, xp } = this.state.progression;
    const needed = xpToNextLevelHundredths(level);
    this.statsPanel.setLines([
      t('stats.title'),
      `${t('stats.level')}: ${level}`,
      `${t('stats.xp')}: ${formatHundredths(xp)} / ${formatHundredths(needed)}`,
      `${t('stats.maxHp')}: ${formatHundredths(stats.maxHp)}`,
      `${t('stats.damage')}: ${formatHundredths(stats.damageMin)} - ${formatHundredths(stats.damageMax)}`,
      // Explicit 2 decimals here (not the usual floor-to-0.1) so small per-level changes show up.
      `${t('stats.attackInterval')}: ${(playerAttackIntervalMs(this.config, level, gear) / 1000).toFixed(2)} s`,
      // DPS = damage / attack interval (no crit yet, GDD 5 range display).
      `${t('stats.dps')}: ${(fromHundredths(stats.damageMin) / (playerAttackIntervalMs(this.config, level, gear) / 1000)).toFixed(1)} - ${(
        fromHundredths(stats.damageMax) / (playerAttackIntervalMs(this.config, level, gear) / 1000)
      ).toFixed(1)}`,
      `${t('stats.regen')}: ${formatHundredths(
        regenAmountHundredths(fromHundredths(this.config.regenAmount), level, this.config.regenGrowthPctPerLevel),
      )} / ${(this.config.regenIntervalMs / 1000).toFixed(1)} s`,
      // Against the current enemy (level difference, GDD 7.2 v1.7); floor to 0.1 for display.
      `${t('stats.hitChance')}: ${(Math.floor(hitChancePct(stats, this.config.enemy, this.config.rules, level - this.config.enemyLevel) * 10) / 10).toFixed(1)} %`,
      `${t('stats.armor')}: ${formatHundredths(stats.armor)}`,
    ]);
  }

  override update(_time: number, delta: number): void {
    const scaledDelta = delta * this.currentSpeed();
    // Allow more steps per frame at higher speeds, so x50 is not capped by the safety limit.
    const frame = consumeFrame(
      this.accumulatorMs,
      scaledDelta,
      DEFAULT_MAX_STEPS_PER_FRAME * this.currentSpeed(),
    );
    this.accumulatorMs = frame.accumulatorMs;
    this.simElapsedMs += frame.steps * TICK_MS;
    for (let i = 0; i < frame.steps; i++) {
      const step = tick(this.state, this.config);
      this.state = step.state;
      step.events.forEach((e) => this.onEvent(e));
    }
    // accumulatorMs (< 1 tick, always > 0) smooths the bars between ticks for
    // rendering only - it never changes the simulation state itself.
    this.searchBar.setProgress(searchProgress(this.state, this.config, this.accumulatorMs));
    this.hideoutBar.setProgress(hideoutProgress(this.state, this.config, this.accumulatorMs));
    this.playerBar.setProgress(
      attackProgress(this.state, this.config, 'player', this.accumulatorMs),
    );
    this.enemyBar.setProgress(
      attackProgress(this.state, this.config, 'enemy', this.accumulatorMs),
    );
    this.playerHpBar.setProgress(hpFraction(this.state, this.config, 'player'));
    const playerMaxHp = playerStats(this.config, this.state.progression.level, this.state.inventory.equipment).maxHp;
    this.playerHpText.setText(`${formatHpHundredths(this.state.playerHp)} / ${formatHundredths(playerMaxHp)}`);
    this.levelText.setText(`${t('stats.level')} ${this.state.progression.level}`);
    if (this.statsPanel.visible) this.refreshStatsPanel();
    if (this.lootPanel.visible) this.refreshLootPanel();
    this.timeText.setText(`${t('hud.time')}: ${formatDuration(this.simElapsedMs)}`);
    // One line per pity rarity that can drop here (GDD 9.6 v2.2); locked ones stay hidden.
    const countdowns = pityCountdowns(this.state.loot, this.config.loot, {
      tileTier: this.config.tileTier,
      magicFindPct: 0,
      unlocked: new Set(),
    });
    this.pityText.setText(
      `${t('loot.luckyAcorn')}: ` +
        countdowns
          .map((c) => t('loot.pityCountdown').replace('{rarity}', rarityName(c.rarityId)).replace('{kills}', String(c.killsLeft)))
          .join(' · '),
    );
    // Keep showing the last enemy HP while it fades out after its defeat.
    if (this.state.phase === 'fighting') {
      this.enemyHpBar.setProgress(hpFraction(this.state, this.config, 'enemy'));
      this.enemyHpText.setText(
        `${formatHpHundredths(this.state.enemyHp)} / ${formatHundredths(this.config.enemy.maxHp)}`,
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
      case 'itemFound':
        this.rollDice(event.item, event.bagFull);
        break;
      case 'leveledUp':
        this.floatingText(PLAYER_X, FIGHTER_Y - 100, t('fight.leveledUp'), '#ffe08a', 1200);
        break;
      case 'playerDefeated':
        this.hideFightGroups();
        this.hideoutGroup.setVisible(true);
        this.floatingText(PLAYER_X, FIGHTER_Y - 70, t('fight.knockedOut'), '#ff9f9f', 1500);
        if (event.xpLost > 0) {
          this.floatingText(PLAYER_X, FIGHTER_Y - 100, `-${formatHundredths(event.xpLost)} XP`, '#ffb0b0', 1500);
        }
        break;
      case 'returnedFromHideout':
        this.hideoutGroup.setVisible(false);
        this.findButton.setVisible(true);
        break;
      case 'peaceMade':
        this.hideFightGroups();
        this.findButton.setVisible(true);
        break;
    }
  }

  /** Enemy leaves at once, bars hide. Caller decides what to show next (Find enemy or the hideout). */
  private hideFightGroups(): void {
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
    this.findButton.setVisible(false);
  }

  /** GDD 9.6: one d20 (two for Unique/Set/Legendary), then the "Found: ..." popup. */
  private rollDice(item: Item, bagFull: boolean): void {
    const faces = diceFaces(item, this.config.loot);
    const dice: Dice[] = [faces.second === null ? new Dice(this, W / 2, 220) : new Dice(this, W / 2 - 40, 220)];
    let remaining = 1;
    const onAllDone = () => {
      remaining -= 1;
      if (remaining > 0) return;
      dice.forEach((d) => d.destroyDelayed(400));
      // M5.2a: bag was at BAG_CAPACITY, the item was rolled but not kept.
      const label = bagFull ? `${t('loot.found')}: ${itemName(item)} (${t('loot.bagFull')})` : `${t('loot.found')}: ${itemName(item)}`;
      this.floatingText(PLAYER_X, FIGHTER_Y - 130, label, bagFull ? '#ff9f9f' : this.rarityColors.get(item.rarityId) ?? '#ffffff', 1800);
    };
    if (faces.second !== null) {
      remaining = 2;
      dice.push(new Dice(this, W / 2 + 40, 220, true));
      dice[1]?.roll(faces.second, onAllDone);
    }
    dice[0]?.roll(faces.first, onAllDone);
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

/** 3723000 ms -> "01:02:03" */
function formatDuration(ms: number): string {
  const total = Math.floor(ms / 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}
