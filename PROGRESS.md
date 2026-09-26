# PROGRESS – stav vývoja

## Aktuálne
- **Etapa:** M3 Progres (GDD kap. 22)
- **Posledný krok:** M3.1b – zvyšok GDD v1.7/v1.8 v kóde – hotové, čaká na test/schválenie (PR na GitHube)
- **Pracovný režim:** Claude desktop → **Code** (Local, D:\Strmienka\HRA-vevericka). Model: podľa náročnosti kroku (poviem vopred). Od teraz: AI pripraví vetvu/commit/push a dá Tomasovi presné príkazy/odkaz na PR, test a merge robí Tomas sám (šetrí tokeny oproti ovládaniu prehliadača).
- **Git:** repozitár https://github.com/tomas-strmen/squirrels-tale (**verejný** – pred vydaním prepnúť na súkromný, GDD/ROADMAP etapa 6–7), vetva `main`, autor Tomas Strmen `<174743142+tomas-strmen@users.noreply.github.com>`. GitHub účet: **tomas-strmen** (súkromný, e-mail skrytý, blokovanie pushov s e-mailom zapnuté). CI (GitHub Actions) beží pri každom pushi/PR a je zelené. Od M0.3 zmeny cez Pull Request.
- **Hra online:** https://tomas-strmen.github.io/squirrels-tale/ – automaticky sa aktualizuje po každom merge do `main`.

## Hotové
### M3.1b – GDD v1.7/v1.8 v kóde (2026-09-26)
- `core/numbers`: zobrazenie **floor na 0.1** (4.99 → 4.9); interne 2 desatinné miesta (stotiny).
- `core/combat`: hod poškodenia po **0.01**, výsledok zaokrúhlený na 0.01 (min 0.1); presnosť
  `hit + 0.5 % × (level útočníka − level obrancu) − dodge`, hod v krokoch 0.01 %.
- `core/progression`: XP krivka **1.3** (Lv2: 13, Lv10: 106); `attackIntervalMsAtLevel` – **×1.01/level**, min 0.5 s.
- `core/encounter`: `enemyLevel` (GDD 8.4, zatiaľ pevne základný level z dát), presnosť oboch strán podľa
  rozdielu levelov, interval útoku veveričky podľa levelu (`playerAttackIntervalMs`).
- Dáta: `balance.json` – `attackSpeedPctPerLevel: 1`, `hitPctPerLevelDiff: 0.5`, `minAttackIntervalS: 0.5`;
  `enemies.json` – `baseLevel: 1` (Worker Ant). Zod schémy rozšírené.
- `FightScene`: „Worker Ant Lv1“ pri mene; v Show stats pribudol interval útoku a presnosť voči nepriateľovi.
- **Zámerne neskôr (M6 mapa):** náhodný level nepriateľa z rozsahu políčka a rast nepriateľa za level
  (HP +10 %, poškodenie +5 %, XP +10 %, dodge +0.5 %, crit +1 %).
- 144 testov zelených (bolo 133). Overené v prehliadači.

### Zmeny z Cowork relácie – GDD v1.7/v1.8 (2026-09-26)
- **GDD v1.7** (`docs/GDD.md`): výpočty na 2 desatinné miesta + zobrazenie floor na 0.1; poškodenie +0.1 max
  každý level a +0.1 min každý 2. (párny) level (nahrádza pravidlo z v1.6: +0.1 max každý 2., +0.1 min každý 5.);
  rýchlosť útoku ×1.01/level; presnosť 85 % ±0.5 %/level rozdielu s nepriateľom; XP krivka 1.3; debug rýchlosť ×50.
- **GDD v1.8** (Tomas schválil): postava vs. výbava oddelene (level mení len postavu, v boji sa sčítajú);
  nová kap. 8.4 levely nepriateľov (rozsahy T1–T9, rast HP/poškodenia/XP/dodge/critu za level); presnosť potvrdená.
  Otvorené (GDD 24): interval útoku so zbraňou, prepočet rozsahov zbraní z 9.4.
- **Kód zapracovaný zatiaľ len pre nový rast poškodenia** (`core/progression`, `core/encounter` – testy/README/komentáre):
  Lv2: 0.4–0.5, Lv3: 0.4–0.6, Lv4: 0.5–0.7, Lv10: 0.8–1.3 (bez zbrane, základ 0.3–0.4).
- **Rýchlosť:** namiesto jedného tlačidla 4 tlačidlá ×1 / ×4 / ×20 / ×50 vpravo hore, aktívne je modré
  (`Button` dostal `setSelected` a voliteľnú veľkosť). Limit krokov za snímku sa násobí rýchlosťou, aby ×50 nebolo brzdené.
- 133 testov zelených, typecheck + lint + build OK (overené v Code pred týmto commitom).
- **Ešte nezapracované do kódu z v1.7/v1.8** (návrh ďalšieho kroku nižšie): XP krivka 1.3, rýchlosť ×1.01/level,
  presnosť podľa rozdielu levelov, výpočty na 2 desatinné miesta + zobrazenie floor na 0.1, levely nepriateľov (8.4).

### M3.1 – XP, levely, rast štatistík, Show stats (2026-09-26)
- Nový modul `core/progression`: XP krivka podľa GDD 6.2 (`need(L) = round(10 × 1.4^(L−1))`),
  levelovanie bez stropu. Bonusy za level (Tomas): **+1.0 max HP** (hneď aj vylieči presne o toľko,
  nie plné doliečenie), **každý 2. level +0.1** k hornej hranici úderu, **každý 5. level +0.1**
  aj k dolnej hranici. Zapísané do GDD 6.1/6.2 + Changelog v1.6 (pôvodne bolo +0.5 HP/level).
- `data/enemies.json`: Worker Ant dostal `xp: 2` (GDD 8.3). Zod schéma rozšírená.
- `core/encounter`: `playerBase` (level 1) + `playerStats(config, level)` počíta efektívne štatistiky;
  po zabití nepriateľa sa pripočíta XP a prípadne prebehne levelovanie (aj viacnásobné z jedného
  zisku), s udalosťou `leveledUp { level }`. Dočasná smrť (M2) teraz vracia na aktuálne (leveled) max HP.
- `FightScene`: level a XP progres viditeľné trvalo nad HP barom, „Level up!“ pri leveli. Nové
  tlačidlo **„Show stats“** otvára/zatvára panel so štatistikami (level, XP, max HP, poškodenie,
  zásah, armor), živo sa aktualizuje.
- Overené v prehliadači: level 1→2, HP 5.0→6.0, poškodenie 0.3–0.4 → 0.3–0.5, panel Show stats.
  133 testov zelených (bolo 109 → +24).
- **Zámerne mimo tohto kroku (M3.2):** regenerácia HP a skutočná smrť (úkryt, strata XP, GDD 6.3) –
  zatiaľ platí dočasné správanie z M2 (plné/leveled HP v idle po páde).

### M2.2 – rýchlosť ×1/×4/×20 (2026-09-26)
- Tlačidlo vpravo hore v `FightScene` cyklí ×1 → ×4 → ×20 → ×1. Zrýchľuje len simuláciu (viac
  100 ms krokov za snímku), nie vizuálne animácie (skok, čísla poškodenia) – tie sa pri vyšších
  rýchlostiach môžu prekrývať, čo je pri debug nástroji v poriadku.
- `Button` dostal `setLabel()` na zmenu textu bez nového tlačidla.
- Overené v prehliadači: ×20 zoberie obom bojovníkom väčšinu HP za ~3 s. 109 testov zelených (bez zmeny).

### M2.1 – boj s HP (2026-09-26)
- `data/enemies.json`: Worker Ant 1.2 HP, úder 0.2–0.3, zásah 65 %, armor 0, dodge 0 (GDD 8.3).
  `data/balance.json`: veverička 5.0 HP, úder bez zbrane **0.3–0.4** (Tomas; GDD v1.5), zásah 85 %,
  armor 0; konštanty vzorca `combat` (zásah 5–98 %, armor + 10, max. redukcia 75 %, min. 0.1).
- Nový modul `core/combat`: jeden úder podľa GDD 7.2 (hit − dodge, rovnomerný hod po 0.1, armor,
  zaokrúhlenie na 0.1, min. 0.1). Crit/stun/dodge veveričky zamknuté (GDD 6.1), bonusy zo zbraní/skillov neskôr.
- `core/encounter`: HP oboch, seedovaný Rng v stave; po zabití mravca hneď nové hľadanie 1.0 s (GDD 7.1);
  keď veverička padne → späť do čakania s plným HP (dočasné do M3). Peace! HP nemení.
- `core/content/encounterInput.ts`: jedno miesto, ktoré z dát skladá konfiguráciu boja (hra aj testy).
- `FightScene`: HP bary + čísla HP, vyskakujúce poškodenie / „Miss“, mravec po smrti zmizne, „Knocked out!“.
- Test bez prehliadača: 100 bojov s rovnakým seedom = presne rovnaký výsledok (GDD M2). 109 testov zelených.
- Tempo (len na vedomie, ladí sa v M20): ~20 s na mravca, bez regenerácie (M3) veverička padne približne pri 3. mravcovi.

### M1.3 – debug panel (2026-09-26)
- `src/game/ui/DebugPanel.ts`: prekryv v ľavom hornom rohu, zapína/vypína klávesou **D**.
  Ukazuje zoznam načítaných nepriateľov (id + interval útoku) a počet načítaných textov
  z `en.json` (GDD kap. 22, M1: „debug panel ukáže načítaných nepriateľov a texty“).
- `FightScene` teraz validuje `data/enemies.json` aj `data/balance.json` cez zod schémy
  z `core/content` (M1.1) priamo pri behu hry, nielen v testoch.
- Texty: `debug.hint`, `debug.title`, `debug.enemiesLoaded`, `debug.textsLoaded` v `en.json`.
- Overené v prehliadači (AI): D zobrazí/skryje panel, žiadna zmena v boji.

### M1.2 – core/rng, core/clock, core/events (2026-09-26)
- `src/core/rng`: seedovaný deterministický RNG (mulberry32) – `createRng`, `next`, `nextInt`,
  `nextBool`, `branch` (nezávislý vetvený stream zo seedu + labelu, napr. pre loot alebo
  vrátenie v čase M17). Zatiaľ sa nikde nepoužíva (boj ešte nemá hit/miss/crit – príde v M2).
- `src/core/clock`: reálny čas oddelený od simulačných krokov – `now()` (jediné miesto s
  `Date.now()`), `guardAgainstClockRewind` (ochrana proti posúvaniu hodín, GDD 17.3),
  `utcDaysBetween`/`isNewUtcDay` (denné resety questov/login odmeny podľa UTC polnoci).
- `src/core/events`: malý typovaný event bus (`createEventBus`) na komunikáciu medzi
  modulmi bez vzájomných importov (ROADMAP kap. 20). Zatiaľ nezapojený do `FightScene`.
- 84 testov zelených (bolo 52 → +32). Žiadna zmena v `core/encounter` ani `FightScene`.

### M1.1 – core/numbers + zod validácia dát (2026-09-26)
- Nový modul `src/core/numbers`: `toHundredths`/`fromHundredths`/`formatHundredths` – design
  čísla (max 1 desatinné miesto) ↔ interné celé stotiny ↔ zobrazenie na 0.1 (GDD 5). Zatiaľ sa
  nepoužíva v boji (ten čísla zatiaľ nepotrebuje), pripravené pre HP/poškodenie v M2.
- Nový modul `src/core/content`: zod schémy pre `data/enemies.json` a `data/balance.json`
  (`idSchema`, `designSecondsSchema`, `enemySchema`/`enemiesSchema`, `balanceSchema`,
  `parseEnemies`/`parseBalance`). Nahradili ručné kontroly v `src/content.test.ts`.
- Balans: rýchlosť útoku veveričky bez zbrane **3.0 s → 4.0 s** (GDD 6.1, Changelog v1.4;
  Tomas si vyžiadal pomalšie tempo).
- 52 testov zelených (bolo 33 → +19).

### Vyhladenie barov hľadania/útoku (2026-09-26)
- `searchProgress`/`attackProgress` v `core/encounter` majú nový voliteľný parameter `extraMs`
  (reálny čas od posledného 100 ms kroku) – bary sa vykresľujú plynulo medzi krokmi, samotná
  simulácia stále beží len v pevných 100 ms krokoch (GDD 5, nezmenené).
- Dôvod: Tomas si všimol "poskakovanie" barov; simuláciu na 30 FPS/33 ms sme nemenili
  (rozbilo by to determinizmus a čísla v dátach) – vyriešené len vo vykresľovaní.
- 2 nové testy, PR #2, CI zelené, zlúčené do `main`.

### M0.3 – Playwright smoke test + GitHub Pages (2026-09-26) – schválené
- `e2e/smoke.spec.ts` (Playwright): zbuildí produkčnú verziu, otvorí ju v reálnom prehliadači, overí že Phaser canvas sa vykreslí bez chýb, uloží screenshot. Beží v CI (`npm run test:e2e`).
- Nový `.github/workflows/deploy.yml`: po push na `main` zbuildí hru a nahrá na GitHub Pages (Settings → Pages → Source: GitHub Actions – nastavené).
- Prvý PR (#1) na tomto repozitári, CI aj deploy beh zelené, overené naostro na verejnej adrese (AI aj Tomas).

### M0.2 – GitHub repozitár + CI (2026-09-26)
- Repozitár `squirrels-tale` založený a nahraný (`git push`), zatiaľ priamo do `main` (PR workflow začne od ďalšieho kroku).
- `.github/workflows/ci.yml`: `npm ci` + `npm run check` pri push na `main` a pri každom PR. Prvý beh (#1) je zelený.
- GitHub Pages a Playwright smoke test sú v M0.3.

### M0.1b – tlačidlo Peace! (2026-09-26) – schválené
- `core/encounter`: `makePeace()` – z hľadania aj boja hneď späť do `idle` (udalosť `peaceMade`), v `idle` nič nerobí.
- `FightScene`: tlačidlo Peace! vpravo dole, viditeľné len počas hľadania a boja; text `fight.peace` v `en.json`.
- 31 testov zelených; overené v prehliadači (AI) aj Tomasom.
- `.claude/launch.json` – konfigurácia dev servera pre náhľad v Claude.

### Git (2026-09-26)
- `git init -b main`, prvý commit M0.1 (`caa0caf`).

### M0.1 – lokálna kostra + ukážka boja (2026-09-26) – schválené
- Vite + TypeScript + Phaser 4, Vitest, ESLint (`src/core` nesmie importovať Phaser).
- `src/core/time` – pevný krok 100 ms, prevod sekúnd na ms s kontrolou 1 desatinného miesta.
- `src/core/encounter` – stavy idle → searching → fighting, časovače útoku, bez HP a poškodenia.
- `src/game/scenes/FightScene` – sivé štvorce, tlačidlo Find enemy, bar hľadania (1.0 s), bary útoku, „skok“ pri útoku.
- Dáta: `data/balance.json` (veverička bez zbrane 3.0 s), `data/enemies.json` (Worker Ant 2.0 s); texty: `strings/en.json`.
- GDD v1.1 a v1.2 zapísané v `docs/GDD.md` aj v projekte (`claude/GDD.md`).

## Ďalší krok
1. Tomas otestuje M3.1b (PR) → merge.
2. **M3.2** – regenerácia HP a skutočná smrť → úkryt (GDD 6.3): online strata 10 % postupu v leveli,
   10 s regenerácia, hráč vyberie políčko. Model: Sonnet 5 stačí.

## Rozhodnutia (2026-09-26)
- Find enemy po príchode na políčko, potom automatické hľadanie po každom zabití; Peace! zastaví a ukončí boj hneď (bez XP/lootu).
- Smrť online: úkryt, plné HP za 10 s, zostane v úkryte, hráč sám vyberie políčko. Strata 10 % aktuálneho postupu v leveli (level nikdy neklesne). Auto-ústup zrušený.
- Smrť offline: bez straty XP, 10 s regenerácia v úkryte, pokračuje na tom istom políčku; na neudržateľnom políčku čas zabitia ×2 (10 s → 20 s); súhrn ukáže loot, meny, XP, počet smrtí a čas regenerácie.

## Otvorené otázky
1. Čas zabitia ×2 offline platí len na políčku, kde by veverička umierala (tak je to v GDD v1.3), alebo pre celý offline? Potvrdiť pri M9.

## Návrhy (mimo plánu – len zapísané)
- (zatiaľ nič)
