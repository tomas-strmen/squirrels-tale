import Phaser from 'phaser';
import affixesData from '../../../data/affixes.json';
import balanceData from '../../../data/balance.json';
import enemiesData from '../../../data/enemies.json';
import itemsData from '../../../data/items.json';
import raritiesData from '../../../data/rarities.json';
import tilesData from '../../../data/tiles.json';
import en from '../../../strings/en.json';
import { now } from '../../core/clock/clock';
import { toEncounterConfigInput } from '../../core/content/encounterInput';
import {
  parseAffixes,
  parseBalance,
  parseEnemies,
  parseItems,
  parseRarities,
  parseTiles,
  type TileData,
} from '../../core/content/schemas';
import {
  activeWeaponMode,
  attackProgress,
  classifyEquip,
  currentAmmo,
  compareEquip,
  createEncounter,
  createEncounterConfig,
  equipItem,
  fightingPlayer,
  hideoutProgress,
  hpFraction,
  makePeace,
  playerHitMultiplier,
  playerStats,
  searchProgress,
  setKeepNuts,
  startSearch,
  switchTile,
  tick,
  discardBagRarity,
  eatFood,
  enemyLootOf,
  enemyStats,
  toggleItemLock,
  unequipItem,
  unlockAutoFood,
  type Combatant,
  type EncounterConfig,
  type EncounterEvent,
  type EncounterState,
} from '../../core/encounter/encounter';
import { hitChancePct } from '../../core/combat/combat';
import { killsToUnlock, unlockedTileIds } from '../../core/tiles/tiles';
import { formatHpHundredths, formatHundredths, fromHundredths } from '../../core/numbers/numbers';
import { regenAmountHundredths, xpToNextLevelHundredths } from '../../core/progression/progression';
import { CURRENCY_IDS } from '../../core/currency/currency';
import { FOOD_IDS, type FoodId } from '../../core/food/food';
import { createRng } from '../../core/rng/rng';
import { restore } from '../../core/save/save';
import { createOfflineConfig, offlineMs, simulateOffline, type OfflineConfig, type OfflineSummary } from '../../core/offline/offline';
import { SummaryPanel, type SummaryLine } from '../ui/SummaryPanel';
import { SaveManager } from '../SaveManager';
import { slotsFor } from '../../core/inventory/inventory';
import { diceFaces, pityCountdowns, type Item } from '../../core/loot/loot';
import { consumeFrame, DEFAULT_MAX_STEPS_PER_FRAME, TICK_MS } from '../../core/time/fixedStep';
import { equipComparisonLines, itemName, rarityName } from '../itemText';
import { t, tDynamic, type TextKey } from '../text';
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
/** Left edge of the tile picker row (right of the "Found items" button). */
const TILE_ROW_LEFT = 430;
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
  /** Debug tool (M7.3a): treat every enemy as flying, to test weapon auto-switching before T5. */
  private debugFlying = false;

  private tiles: TileData[] = [];
  /** Unmodified per-tile configs (M6.2); `this.config` may additionally have the debug drop rate applied. */
  private baseConfigByTileId = new Map<string, EncounterConfig>();
  private tileButtons: Button[] = [];

  private player!: Phaser.GameObjects.Rectangle;
  private enemy!: Phaser.GameObjects.Rectangle;
  private enemyNameText!: Phaser.GameObjects.Text;
  /** "(flying)" left of the enemy, clear of its lunge and the wallet line (M7.3c). */
  private enemyFlyingText!: Phaser.GameObjects.Text;
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
  private flyingButton!: Button;
  private weaponText!: Phaser.GameObjects.Text;
  private levelText!: Phaser.GameObjects.Text;
  private statsButton!: Button;
  private statsPanel!: StatsPanel;
  private lootButton!: Button;
  private lootPanel!: ItemsPanel;
  private rarityColors = new Map<string, string>();
  /** Multiple items can drop from one kill now (GDD 9.3 v2.4) - their dice rolls queue up. */
  private diceQueue: { item: Item; bagFull: boolean }[][] = [];
  private diceAnimating = false;
  /** M5.2b2: rarities.json order = value, for the bag's "Sort: Rarity". */
  private rarityRanks = new Map<string, number>();
  /** Simulated game time (counts faster at x4/x20/x50 - it follows the simulation). */
  private simElapsedMs = 0;
  private timeText!: Phaser.GameObjects.Text;
  private pityText!: Phaser.GameObjects.Text;
  private walletText!: Phaser.GameObjects.Text;
  private foodButtons: Button[] = [];
  private autoFoodText!: Phaser.GameObjects.Text;
  private autoFoodBar!: ProgressBar;
  private keepNutsText!: Phaser.GameObjects.Text;
  /** Save game (GDD 19, M8.1): load at start, autosave. */
  private readonly saves = new SaveManager();
  private otherTabText!: Phaser.GameObjects.Text;
  private offlineConfig!: OfflineConfig;

  constructor() {
    super('FightScene');
  }

  create(): void {
    // Validated against their zod schemas (core/content) so bad data fails
    // loudly here too, not only in tests.
    const enemies = parseEnemies(enemiesData);
    const balance = parseBalance(balanceData);
    this.tiles = parseTiles(tilesData);
    const firstTile = this.tiles[0];
    if (!firstTile) throw new Error('data/tiles.json has no tiles');

    const rarities = parseRarities(raritiesData);
    this.rarityColors = new Map(rarities.map((r) => [r.id, r.color]));
    this.rarityRanks = new Map(rarities.map((r, i) => [r.id, i]));
    const lootData = { items: parseItems(itemsData), rarities, affixes: parseAffixes(affixesData) };
    this.baseConfigByTileId = new Map(
      this.tiles.map((tile) => [
        tile.id,
        createEncounterConfig(
          toEncounterConfigInput(balance, tile, enemies, lootData),
        ),
      ]),
    );
    // M8.1: continue the saved game, or start a new one (seeded Rng, GDD 5).
    this.offlineConfig = createOfflineConfig(balance.offline);
    const saved = this.saves.load();
    let playTimeMs = 0;
    /** M9: time away since the save, caught up once the UI exists (end of create). */
    let away = { ms: 0, farming: false };
    if (saved) {
      // A tile removed from the data since -> continue on the first tile.
      const tileId = this.tiles.some((t) => t.id === saved.tiles.current) ? saved.tiles.current : firstTile.id;
      this.config = this.configFor(tileId);
      this.state = restore(this.config, { ...saved, tiles: { ...saved.tiles, current: tileId } });
      playTimeMs = saved.stats.playTimeMs;
      away = { ms: offlineMs(saved.savedAt, saved.maxSeenTime, now(), this.offlineConfig), farming: saved.tiles.farming };
    } else {
      this.config = this.configFor(firstTile.id);
      this.state = createEncounter(this.config, createRng(now()), firstTile.id);
    }
    // Save when the page is hidden or closed (GDD 19) - the browser may not give us another chance.
    const saveNow = () => this.saves.save(this.state, this.simElapsedMs);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') saveNow();
    });
    window.addEventListener('pagehide', saveNow);
    this.accumulatorMs = 0;

    const textStyle = this.textStyle;

    this.add.text(W / 2, 60, t('game.title'), { ...textStyle, fontSize: '44px' }).setOrigin(0.5);

    // Player (always visible)
    this.player = this.add.rectangle(PLAYER_X, FIGHTER_Y, FIGHTER_SIZE, FIGHTER_SIZE, 0xc8c8c8);
    this.add
      .text(PLAYER_X, FIGHTER_Y + 90, t('player.name'), { ...textStyle, fontSize: '26px' })
      .setOrigin(0.5);
    // Auto-switched weapon vs the current enemy (GDD 7.1, M7.3a), right of the squirrel
    // (below her name it would hide behind the open Stats panel), clear of her attack lunge.
    this.weaponText = this.add
      .text(PLAYER_X + FIGHTER_SIZE / 2 + LUNGE_PX + 12, FIGHTER_Y + 40, '', { ...textStyle, fontSize: '15px', color: '#b0b0b0' })
      .setOrigin(0, 0.5);
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
    // GDD 8.4: level shown next to the name ("Worker Ant Lv1"), rerolled per enemy - see onEvent('enemyFound').
    this.enemyNameText = this.add
      .text(ENEMY_X, FIGHTER_Y + 90, this.enemyLabel(), {
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
    this.enemyFlyingText = this.add
      .text(ENEMY_X - FIGHTER_SIZE / 2 - LUNGE_PX - 12, FIGHTER_Y - 40, t('enemy.flying'), {
        ...textStyle,
        fontSize: '16px',
        color: '#a8d8ff',
      })
      .setOrigin(1, 0.5);
    this.enemyGroup = this.add.container(0, 0, [
      this.enemy,
      this.enemyNameText,
      this.enemyFlyingText,
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
    // Debug tool (M7.3a): every enemy counts as flying -> squirrel switches to the slingshot.
    this.flyingButton = new Button(this, W - 320 + 3 * 88, 90, '', () => this.onToggleFlying(), {
      width: 80,
      height: 40,
      fontSize: 14,
    });
    this.refreshFlyingButton();

    // Tile picker (GDD 8.1, M6.2): one button per tile, locked ones show kills still needed.
    // Fits all tiles in one row between "Found items" and the right edge (M7.3c: 5 tiles).
    const tileSlot = Math.min(170, (W - 10 - TILE_ROW_LEFT) / this.tiles.length);
    this.tileButtons = this.tiles.map((tile, index) =>
      new Button(this, TILE_ROW_LEFT + tileSlot * (index + 0.5), 140, '', () => this.onSelectTile(tile.id), {
        width: tileSlot - 8,
        height: 60,
        fontSize: 14,
      }),
    );
    this.refreshTileButtons();

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
        this.saves.requestSave();
      },
      onUnequip: (slot) => {
        this.state = unequipItem(this.state, this.config, slot);
        this.saves.requestSave();
      },
      colorOf: (item) => this.rarityColors.get(item.rarityId) ?? '#ffffff',
      compareToSlot: (item, slot) =>
        equipComparisonLines(
          compareEquip(this.config, this.state.progression.level, this.state.inventory.equipment, item, slot),
        ),
      // M5.2b1: faint blue bag row - true if `item` beats what's worn in at least one stat,
      // for at least one fitting slot ('better' or 'mixed' both mean "some upgrade in there").
      hasUpgrade: (item) =>
        slotsFor(item.slot).some((slot) => {
          const verdict = classifyEquip(
            compareEquip(this.config, this.state.progression.level, this.state.inventory.equipment, item, slot),
          );
          return verdict === 'better' || verdict === 'mixed';
        }),
      onToggleLock: (uid) => {
        this.state = toggleItemLock(this.state, this.config, uid);
        this.saves.requestSave();
      },
      rarityRank: (item) => this.rarityRanks.get(item.rarityId) ?? 0,
      discardGroups: () => {
        const counts = new Map<string, number>();
        for (const item of this.state.inventory.bag) {
          if (item.locked) continue;
          counts.set(item.rarityId, (counts.get(item.rarityId) ?? 0) + 1);
        }
        return [...counts.entries()]
          .sort((a, b) => (this.rarityRanks.get(a[0]) ?? 0) - (this.rarityRanks.get(b[0]) ?? 0))
          .map(([rarityId, count]) => ({ rarityId, count, name: rarityName(rarityId) }));
      },
      onDiscardRarity: (rarityId) => {
        this.state = discardBagRarity(this.state, this.config, rarityId);
        this.saves.requestSave();
      },
    });
    this.lootPanel.setVisible(false);

    // Bottom-left info: game time (follows the simulation speed) and the pity countdown (GDD 9.6).
    this.simElapsedMs = playTimeMs;
    // Save tools (GDD 19 export/import, debug reset - M8.2): bottom row under Find enemy, clear of
    // the pity line on the left (it grows with every unlocked rarity).
    const saveButton = (x: number, label: string, onClick: () => void) =>
      new Button(this, x, 692, label, onClick, { width: 110, height: 26, fontSize: 13 });
    saveButton(W / 2 - 120, t('save.export'), () => void this.onExportSave());
    saveButton(W / 2, t('save.import'), () => this.onImportSave());
    saveButton(W / 2 + 120, t('save.reset'), () => this.onResetGame());
    this.otherTabText = this.add
      .text(W / 2, 562, t('save.otherTab'), { ...textStyle, fontSize: '17px', color: '#ff7a7a' })
      .setOrigin(0.5)
      .setVisible(false);
    this.timeText = this.add.text(10, 640, '', { ...textStyle, fontSize: '16px', color: '#a0a0a0' });
    this.pityText = this.add.text(10, 662, '', { ...textStyle, fontSize: '16px', color: '#a0a0a0' });
    // Wallet (GDD 11.1): the three currencies, top right under the Drop rate row's tile picker.
    this.walletText = this.add
      .text(W - 20, 190, '', { ...textStyle, fontSize: '20px', color: '#e8d9a0' })
      .setOrigin(1, 0.5);

    // Food (GDD 7.4, M7.2): quick-eat buttons + auto-food, which is locked until a (mock) ad is watched.
    this.add.text(1020, 236, t('food.title'), { ...textStyle, fontSize: '18px', color: '#c8c8c8' }).setOrigin(0, 0.5);
    this.foodButtons = FOOD_IDS.map((id, index) =>
      new Button(this, 1060 + index * 80, 275, '', () => this.onEat(id), { width: 76, height: 44, fontSize: 13 }),
    );
    this.autoFoodText = this.add
      .text(1020, 330, '', { ...textStyle, fontSize: '18px', color: '#c8c8c8' })
      .setOrigin(0, 0.5);
    this.autoFoodBar = new ProgressBar(this, 1160, 360, { width: 220, height: 16, fillColor: 0x6fbf6f });
    new Button(this, 1140, 405, t('food.watchAd'), () => this.onWatchAd(), { width: 200, height: 40, fontSize: 16 });

    // Ammo (GDD 7.3, M7.3b): "keep at least N nuts" - the slingshot never shoots below it.
    this.keepNutsText = this.add
      .text(1020, 458, '', { ...textStyle, fontSize: '18px', color: '#c8c8c8' })
      .setOrigin(0, 0.5);
    this.add
      .text(1020, 480, t('ammo.keepNutsHint'), { ...textStyle, fontSize: '13px', color: '#909090' })
      .setOrigin(0, 0.5);
    const keepStep = (delta: number) => () => {
      this.state = setKeepNuts(this.state, this.state.keepNuts + delta);
      this.saves.requestSave();
    };
    new Button(this, 1195, 465, '−', keepStep(-1), { width: 36, height: 32, fontSize: 18 });
    new Button(this, 1240, 465, '+', keepStep(1), { width: 36, height: 32, fontSize: 18 });

    // Debug time skip (CLAUDE.md debug tools, GDD 22 M9 test): as if the game was closed for 1 h / 3 h.
    this.add.text(W / 2 + 190, 692, t('debug.skip'), { ...textStyle, fontSize: '14px', color: '#909090' }).setOrigin(0, 0.5);
    for (const [index, hours] of [1, 3].entries()) {
      new Button(this, W / 2 + 262 + index * 64, 692, `+${hours} h`, () => this.onSkipTime(hours), {
        width: 58,
        height: 26,
        fontSize: 13,
      });
    }

    // M9: catch up the time the game was closed, then continue farming if she was.
    this.catchUp(away.ms, away.farming, false);
  }

  /**
   * Offline progress (GDD 17, M9): simulates `awayMs` on the current tile, shows "While You Were
   * Away" (if long enough, or `alwaysShow` for the debug skip) and resumes the search if she was farming.
   */
  private catchUp(awayMs: number, farming: boolean, alwaysShow: boolean): void {
    const resume = () => {
      if (farming && this.state.phase === 'idle') this.onFindEnemy();
    };
    if (awayMs <= 0) {
      resume();
      return;
    }
    const result = simulateOffline(this.state, this.config, awayMs, farming);
    this.state = result.state;
    this.hideFightGroups();
    this.findButton.setVisible(true);
    this.hideoutGroup.setVisible(false);
    this.saves.requestSave();
    if (alwaysShow || awayMs >= this.offlineConfig.minSummaryMs) {
      new SummaryPanel(this, t('away.title'), this.awayLines(result.summary), t('away.ok'), resume);
    } else {
      resume();
    }
  }

  private onSkipTime(hours: number): void {
    const farming = this.state.phase === 'searching' || this.state.phase === 'fighting';
    this.catchUp(Math.min(hours * 3_600_000, this.offlineConfig.capMs), farming, true);
  }

  /** Text of the "While You Were Away" summary (GDD 17.2 step 6). */
  private awayLines(s: OfflineSummary): SummaryLine[] {
    const fill = (key: TextKey, values: Record<string, string | number>) =>
      Object.entries(values).reduce((text, [k, v]) => text.replace(`{${k}}`, String(v)), t(key));
    const list = (counts: Readonly<Record<string, number>>) =>
      Object.entries(counts)
        .filter(([, n]) => n > 0)
        .map(([id, n]) => `${tDynamic(`currency.${id}.name`)} ${n}`)
        .join(' · ');
    const lines: SummaryLine[] = [{ text: fill('away.time', { time: formatAway(s.awayMs) }) }];
    if (!s.farming) {
      lines.push({ text: t('away.resting') });
      return lines;
    }
    if (s.halfPace) lines.push({ text: fill('away.halfPace', { time: formatAway(s.farmedMs) }), color: '#ffb070' });
    lines.push({ text: fill('away.kills', { n: s.kills }) });
    lines.push({ text: fill('away.xp', { xp: formatHundredths(s.xpGained) }) });
    if (s.levelAfter > s.levelBefore) {
      lines.push({ text: fill('away.level', { from: s.levelBefore, to: s.levelAfter }), color: '#ffe08a' });
    }
    const found = list(s.found);
    if (found) lines.push({ text: fill('away.found', { list: found }), color: '#e8d9a0' });
    const eaten = list(s.eaten);
    if (eaten) lines.push({ text: fill('away.eaten', { list: eaten }) });
    if (s.nutsShot > 0) lines.push({ text: fill('away.nutsShot', { n: s.nutsShot }) });
    if (s.deaths > 0) {
      lines.push({ text: fill('away.deaths', { n: s.deaths, time: formatAway(s.hideoutMs) }), color: '#ff8a8a' });
    }
    lines.push({ text: fill('away.items', { n: s.items.length }) });
    const shown = 8;
    for (const item of s.items.slice(0, shown)) {
      lines.push({ text: `  ${itemName(item)} [${rarityName(item.rarityId)}]`, color: this.rarityColors.get(item.rarityId) ?? '#dddddd' });
    }
    if (s.items.length > shown) lines.push({ text: fill('away.more', { n: s.items.length - shown }) });
    if (s.itemsLost.length > 0) lines.push({ text: fill('away.itemsLost', { n: s.itemsLost.length }), color: '#ff8a8a' });
    return lines;
  }

  private onEat(food: FoodId): void {
    const step = eatFood(this.state, this.config, food);
    this.state = step.state;
    step.events.forEach((e) => this.onEvent(e));
  }

  /** Mock ad (GDD 18.1/M19): pressing the button counts as having watched one. */
  private onWatchAd(): void {
    this.state = unlockAutoFood(this.state, this.config);
  }

  private refreshFoodPanel(): void {
    const { wallet, autoFoodMsLeft, eatCooldownMs } = this.state;
    this.foodButtons.forEach((button, index) => {
      const id = FOOD_IDS[index];
      if (id) button.setLabel(`${tDynamic(`currency.${id}.name`)} ×${wallet[id]}`).setAlpha(eatCooldownMs > 0 || wallet[id] <= 0 ? 0.55 : 1);
    });
    const unlocked = autoFoodMsLeft > 0;
    this.autoFoodText.setText(
      unlocked ? `${t('food.auto')}  ${Math.ceil(autoFoodMsLeft / 1000)} s` : `🔒 ${t('food.auto')}`,
    );
    this.autoFoodBar.setVisible(unlocked).setProgress(autoFoodMsLeft / this.config.food.autoFoodUnlockMs);
    this.keepNutsText.setText(t('ammo.keepNuts').replace('{n}', String(this.state.keepNuts)));
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
    this.config = this.configFor(this.state.tileId);
    this.refreshDropRateButtons();
  }

  private refreshDropRateButtons(): void {
    this.dropRateButtons.forEach((button, index) => button.setSelected(index === this.dropRateIndex));
  }

  private onToggleFlying(): void {
    this.debugFlying = !this.debugFlying;
    this.config = this.configFor(this.state.tileId);
    this.refreshFlyingButton();
  }

  private refreshFlyingButton(): void {
    this.flyingButton.setLabel(`${t('debug.flying')}\n${this.debugFlying ? 'ON' : 'off'}`);
    this.flyingButton.setSelected(this.debugFlying);
  }

  /**
   * `tileId`'s base config (M6.2) with the debug overrides applied: drop rate (Tomas) scales
   * every enemy's per-item drop chance (GDD 9.3 v2.4) by the selected multiplier, capped at
   * 100 %; Flying (M7.3a) makes every enemy flying.
   */
  private configFor(tileId: string): EncounterConfig {
    const base = this.baseConfigByTileId.get(tileId);
    if (!base) throw new Error(`No config for tile "${tileId}"`);
    const multiplier = DROP_RATE_OPTIONS[this.dropRateIndex] ?? 1;
    if (multiplier === 1 && !this.debugFlying) return base;
    const scale = (bp: number) => (multiplier === 100 ? 10000 : Math.min(10000, bp * multiplier));
    const enemies = base.enemies.map((enemy) => ({
      ...enemy,
      flying: enemy.flying || this.debugFlying,
      loot: {
        ...enemy.loot,
        items: enemy.loot.items.map((item) => ({
          ...item,
          pctBpAtMin: scale(item.pctBpAtMin),
          pctBpAtMax: scale(item.pctBpAtMax),
        })),
      },
    }));
    return { ...base, enemies };
  }

  /** Player clicked a tile button (GDD 8.1, M6.2). No-op in core if it's already current or still locked. */
  private onSelectTile(tileId: string): void {
    const unlocked = unlockedTileIds(this.tiles, this.state.killsByTile, this.state.progression.level);
    const step = switchTile(this.state, this.configFor(tileId), tileId, unlocked);
    this.state = step.state;
    if (step.events.some((e) => e.type === 'tileSwitched')) {
      this.saves.requestSave();
      this.config = this.configFor(tileId);
      this.hideFightGroups();
      this.findButton.setVisible(true);
    }
    this.refreshTileButtons();
  }

  private refreshTileButtons(): void {
    const unlocked = unlockedTileIds(this.tiles, this.state.killsByTile, this.state.progression.level);
    this.tileButtons.forEach((button, index) => {
      const tile = this.tiles[index];
      if (!tile) return;
      const name = tDynamic(`tile.${tile.id}.name`);
      button.setLabel(unlocked.has(tile.id) ? name : `🔒 ${name}\n${this.lockLabel(tile)}`);
      button.setSelected(tile.id === this.state.tileId);
    });
  }

  /** "N kills to unlock" / "Lv N to unlock" / both, for a still-locked tile button (GDD 8.2, M6.2c). */
  private lockLabel(tile: TileData): string {
    const kills = killsToUnlock(this.tiles, this.state.killsByTile, tile.id);
    const levelNeeded =
      tile.unlockLevel !== undefined ? Math.max(0, tile.unlockLevel - this.state.progression.level) : 0;
    if (levelNeeded > 0 && kills > 0) {
      return t('tile.lockedLevelAndKills').replace('{level}', String(tile.unlockLevel)).replace('{kills}', String(kills));
    }
    if (levelNeeded > 0) {
      return t('tile.lockedLevel').replace('{level}', String(tile.unlockLevel));
    }
    return t('tile.locked').replace('{kills}', String(kills));
  }

  /** M8.2: copies the save text to the clipboard (falls back to a box to copy it from by hand). */
  private async onExportSave(): Promise<void> {
    const text = this.saves.exportText(this.state, this.simElapsedMs);
    try {
      await navigator.clipboard.writeText(text);
      this.floatingText(W / 2, BUTTON_Y - 60, t('save.exported'), '#a0e0a0', 1500);
    } catch {
      window.prompt(t('save.exportPrompt'), text); // e.g. http on the local network: no clipboard API
    }
  }

  /** M8.2: replaces the game with a pasted save and reloads. An unreadable save changes nothing. */
  private onImportSave(): void {
    const text = window.prompt(t('save.importPrompt'));
    if (!text) return;
    try {
      this.saves.importText(text);
    } catch (error) {
      window.alert(t('save.importInvalid').replace('{error}', error instanceof Error ? error.message : String(error)));
      return;
    }
    window.location.reload();
  }

  /** Debug reset (CLAUDE.md debug tools): deletes the save and starts over. */
  private onResetGame(): void {
    if (!window.confirm(t('save.resetConfirm'))) return;
    this.saves.clear();
    window.location.reload();
  }

  private onToggleStats(): void {
    this.statsPanel.setVisible(!this.statsPanel.visible);
  }

  /** "Moth Lv10" - GDD 8.4 level next to the name. */
  private enemyLabel(): string {
    return `${tDynamic(`enemy.${this.state.enemyId}.name`)} ${t('fight.levelShort')}${this.state.enemyLevel}`;
  }

  private isEnemyFlying(): boolean {
    return this.config.enemies.find((e) => e.id === this.state.enemyId)?.flying ?? false;
  }

  /** "Twig Slingshot (Ranged)" / "Fists", plus a hit penalty vs flying (M7.3a) or the ammo (M7.3b) line. */
  private weaponLines(): string[] {
    const mode = activeWeaponMode(this.state, this.config);
    const gear = this.state.inventory.equipment;
    const item = mode === 'ranged' ? gear.ranged : mode === 'melee' ? (gear.rightPaw ?? gear.leftPaw) : null;
    const modeName = tDynamic(`weapon.mode.${mode}`);
    const lines = [`${t('stats.weapon')}: ${item ? `${itemName(item)} (${modeName})` : modeName}`];
    const hitMult = playerHitMultiplier(this.state, this.config);
    if (hitMult !== 1) lines.push(t('weapon.fistsVsFlying').replace('{pct}', String(Math.round(hitMult * 100))));
    const ammo = currentAmmo(this.state, this.config);
    if (ammo === 'nuts') lines.push(t('ammo.nuts'));
    if (ammo === 'ground') lines.push(t('ammo.ground').replace('{pct}', String(this.config.ammo.groundAmmoDamagePct)));
    return lines;
  }

  private refreshStatsPanel(): void {
    // Damage, interval, DPS and hit chance: with the weapon auto-switched for the current enemy (M7.3a).
    const composed = fightingPlayer(this.state, this.config);
    const stats = composed.fighter;
    const intervalS = composed.attackIntervalMs / 1000;
    const { level, xp } = this.state.progression;
    const needed = xpToNextLevelHundredths(level);
    this.statsPanel.setLines([
      t('stats.title'),
      `${t('stats.level')}: ${level}`,
      `${t('stats.xp')}: ${formatHundredths(xp)} / ${formatHundredths(needed)}`,
      `${t('stats.maxHp')}: ${formatHundredths(stats.maxHp)}`,
      this.weaponLines().join(' - '),
      `${t('stats.damage')}: ${formatHundredths(stats.damageMin)} - ${formatHundredths(stats.damageMax)}`,
      // Explicit 2 decimals here (not the usual floor-to-0.1) so small per-level changes show up.
      `${t('stats.attackInterval')}: ${intervalS.toFixed(2)} s`,
      // DPS = damage / attack interval (no crit yet, GDD 5 range display).
      `${t('stats.dps')}: ${(fromHundredths(stats.damageMin) / intervalS).toFixed(1)} - ${(
        fromHundredths(stats.damageMax) / intervalS
      ).toFixed(1)}`,
      `${t('stats.regen')}: ${formatHundredths(
        regenAmountHundredths(fromHundredths(this.config.regenAmount), level, this.config.regenGrowthPctPerLevel),
      )} / ${(this.config.regenIntervalMs / 1000).toFixed(1)} s`,
      // Against the current enemy (level difference, GDD 7.2 v1.7); floor to 0.1 for display.
      `${t('stats.hitChance')}: ${(Math.floor(hitChancePct(stats, enemyStats(this.config, this.state.enemyId, this.state.enemyLevel), this.config.rules, level - this.state.enemyLevel, playerHitMultiplier(this.state, this.config)) * 10) / 10).toFixed(1)} %`,
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
      // Every item a single kill drops (GDD 9.3 v2.4) arrives as its own event in this same
      // step - group them so their dice roll side by side instead of one after another.
      const found: { item: Item; bagFull: boolean }[] = [];
      for (const e of step.events) {
        if (e.type === 'itemFound') found.push({ item: e.item, bagFull: e.bagFull });
        else this.onEvent(e);
      }
      if (found.length > 0) {
        this.queueDiceGroup(found);
        this.saves.requestSave();
      }
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
    this.weaponText.setText(this.weaponLines().join('\n'));
    if (this.statsPanel.visible) this.refreshStatsPanel();
    if (this.lootPanel.visible) this.refreshLootPanel();
    this.refreshTileButtons();
    this.refreshFoodPanel();
    this.timeText.setText(`${t('hud.time')}: ${formatDuration(this.simElapsedMs)}`);
    // Autosave every 30 s of real time, or right after an important action (M8.1).
    this.saves.update(delta, this.state, this.simElapsedMs);
    if (this.saves.otherTabActive && !this.otherTabText.visible) this.otherTabText.setVisible(true);
    // One line per pity rarity that can drop here (GDD 9.6 v2.2); locked ones stay hidden.
    const countdowns = pityCountdowns(
      this.state.loot,
      this.config.loot,
      enemyLootOf(this.config, this.state.enemyId),
      { magicFindPct: 0, unlocked: new Set() },
    );
    this.walletText.setText(
      CURRENCY_IDS.map((id) => `${tDynamic(`currency.${id}.name`)} ${this.state.wallet[id]}`).join(' · '),
    );
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
        `${formatHpHundredths(this.state.enemyHp)} / ${formatHundredths(enemyStats(this.config, this.state.enemyId, this.state.enemyLevel).maxHp)}`,
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
        // GDD 8.4: level rolled per encounter within the enemy's range.
        this.enemyNameText.setText(this.enemyLabel());
        this.enemyFlyingText.setVisible(this.isEnemyFlying());
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
        this.enemyHpText.setText(`0.0 / ${formatHundredths(enemyStats(this.config, this.state.enemyId, this.state.enemyLevel).maxHp)}`);
        this.playerAttackGroup.setVisible(false);
        this.tweens.add({
          targets: this.enemyGroup,
          alpha: 0,
          duration: 400,
          onComplete: () => this.enemyGroup.setVisible(false),
        });
        break;
      case 'currencyFound':
        // GDD 11.1: "+2 Pebbles" style popups above the defeated enemy, one line per currency.
        event.drops.forEach((drop, i) =>
          this.floatingText(
            ENEMY_X,
            FIGHTER_Y - 150 - i * 32,
            `+${drop.amount} ${tDynamic(`currency.${drop.currencyId}.name`)}`,
            '#e8d9a0',
            1400,
          ),
        );
        break;
      case 'ate':
        // GDD 7.4: "+0.3 HP" above the squirrel (green; a bit lower than the level-up text).
        this.floatingText(
          PLAYER_X,
          FIGHTER_Y - 70,
          t('food.healed').replace('{hp}', formatHundredths(event.healed)),
          '#7fe08a',
          1000,
        );
        break;
      case 'leveledUp':
        this.saves.requestSave();
        this.floatingText(PLAYER_X, FIGHTER_Y - 100, t('fight.leveledUp'), '#ffe08a', 1200);
        break;
      case 'playerDefeated':
        this.saves.requestSave();
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

  /**
   * A kill can now drop several items at once (GDD 9.3 v2.4: each drop-table entry rolls
   * independently) - one kill's items roll side by side; a later kill's items queue behind them.
   */
  private queueDiceGroup(entries: { item: Item; bagFull: boolean }[]): void {
    this.diceQueue.push(entries);
    if (!this.diceAnimating) this.processDiceQueue();
  }

  private processDiceQueue(): void {
    const group = this.diceQueue.shift();
    if (!group) {
      this.diceAnimating = false;
      return;
    }
    this.diceAnimating = true;
    this.rollDiceGroup(group, () => this.processDiceQueue());
  }

  /** GDD 9.6: one d20 per item (two for Unique/Set/Legendary), side by side, then the "Found: ..." popups. */
  private rollDiceGroup(entries: { item: Item; bagFull: boolean }[], onDone: () => void): void {
    const SLOT_WIDTH = 140;
    const startX = W / 2 - ((entries.length - 1) * SLOT_WIDTH) / 2;
    const allDice: Dice[] = [];
    let remainingDice = 0;

    const onAllDiceDone = () => {
      remainingDice -= 1;
      if (remainingDice > 0) return;
      allDice.forEach((d) => d.destroyDelayed(400));
      entries.forEach(({ item, bagFull }, i) => {
        // M5.2a: bag was at BAG_CAPACITY, the item was rolled but not kept.
        const label = bagFull ? `${t('loot.found')}: ${itemName(item)} (${t('loot.bagFull')})` : `${t('loot.found')}: ${itemName(item)}`;
        this.floatingText(
          PLAYER_X,
          FIGHTER_Y - 130 - i * 26,
          label,
          bagFull ? '#ff9f9f' : this.rarityColors.get(item.rarityId) ?? '#ffffff',
          1800,
        );
      });
      onDone();
    };

    entries.forEach(({ item }, i) => {
      const slotX = startX + i * SLOT_WIDTH;
      const faces = diceFaces(item, this.config.loot);
      const dice = [faces.second === null ? new Dice(this, slotX, 220) : new Dice(this, slotX - 30, 220)];
      remainingDice += 1;
      dice[0]?.roll(faces.first, onAllDiceDone);
      if (faces.second !== null) {
        const gold = new Dice(this, slotX + 30, 220, true);
        remainingDice += 1;
        gold.roll(faces.second, onAllDiceDone);
        dice.push(gold);
      }
      allDice.push(...dice);
    });
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
/** "3 h 05 min" / "4 min 20 s" / "12 s" for the offline summary. */
function formatAway(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const min = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  if (h > 0) return `${h} h ${String(min).padStart(2, '0')} min`;
  if (min > 0) return `${min} min ${String(sec).padStart(2, '0')} s`;
  return `${sec} s`;
}

function formatDuration(ms: number): string {
  const total = Math.floor(ms / 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}
