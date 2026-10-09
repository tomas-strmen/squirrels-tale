# PROGRESS – stav vývoja

## Aktuálne
- **Etapa:** M6 Mapa (GDD kap. 8, 22) – M5 Inventár a výbava hotová ✅
- **Posledný krok:** M7.1 – meny v drop tabuľke + spawn tabuľka políčka (GDD v2.5) – otestované a zmergnuté (PR #27)
- **Rozpracované:** M7.2 – jedlo + auto-jedlo zamknuté reklamou (GDD v2.6) – hotové na vetve `m7.2-food`, čaká na Tomasov test/merge
- **Ďalší krok:** M7.3+ diaľkový boj, munícia, lietajúci nepriatelia, auto-prepínanie zbraní (Opus); M8 Save (Opus); neskôr loot krok 3 (čísla v tabuľkách) a 4 (editor tabuliek)
- **Pracovný režim:** Claude desktop → **Code** (Local, D:\Strmienka\HRA-vevericka). Model: podľa náročnosti kroku (poviem vopred). Od teraz: AI pripraví vetvu/commit/push a dá Tomasovi presné príkazy/odkaz na PR, test a merge robí Tomas sám (šetrí tokeny oproti ovládaniu prehliadača).
- **Git:** repozitár https://github.com/tomas-strmen/squirrels-tale (**verejný** – pred vydaním prepnúť na súkromný, GDD/ROADMAP etapa 6–7), vetva `main`, autor Tomas Strmen `<174743142+tomas-strmen@users.noreply.github.com>`. GitHub účet: **tomas-strmen** (súkromný, e-mail skrytý, blokovanie pushov s e-mailom zapnuté). CI (GitHub Actions) beží pri každom pushi/PR a je zelené. Od M0.3 zmeny cez Pull Request.
- **Hra online:** https://tomas-strmen.github.io/squirrels-tale/ – automaticky sa aktualizuje po každom merge do `main`.

## Hotové
### M7.2 – jedlo a auto-jedlo (2026-10-09, GDD v2.6)
- Jedlo = počítadlá v peňaženke: **Berries** (nové, len jedlo; padajú z drop tabuľky nepriateľa, štart 10 %), **Seeds**
  a **Nuts** (aj meny). Liečia 0.3 / 0.5 / 1.0 (`balance.json` `food`). Zjesť sa dá ručne 3 tlačidlami (aj počet kusov);
  spoločný cooldown 3 s; nezje sa pri plnom HP, bez kusu ani v úkryte; liečenie sa orezáva na max HP.
- **Auto-jedlo** zje pod 40 % HP v poradí bobule → semienka → oriešky. Je **zamknuté** (🔒), kým sa nepozrie reklama:
  „Watch ad (1 min)“ (mock) ho odomkne na 1 minútu (zase kliknutím obnoví), pod „Auto-eat“ sa míňa bar so sekundami,
  po vypršaní sa zamkne. Čas beží v simulácii (ticky), nie v reálnom čase - pri ×50 debug rýchlosti ubúda 50× rýchlejšie.
- `core/food` (nové), `core/encounter`: `eatFood`, `unlockAutoFood`, `state.eatCooldownMs/autoFoodMsLeft`, event `ate`.
- 282 testov zelených. V prehliadači overené: rozloženie panelu, klik na reklamu → „Auto-eat 57 s“ a bar. Samotné
  jedenie (potrebuje padnuté bobule) a vypršanie minúty over ty.
- Práh 40 % a poradie zatiaľ pevné (Settings neskôr). Premium vs. auto-jedlo: otvorená otázka v GDD 24.

### M7.1 – meny a spawn tabuľka (2026-10-09, GDD v2.5)
- **Meny v drop tabuľke nepriateľa** (`data/enemies.json` `loot.currencies`): záznam = mena (pebbles/seeds/nuts) +
  šanca na `minLevel`/`maxLevel` nepriateľa (interpolácia ako pri predmetoch) + počet kusov od–do. Mena,
  ktorá v tabuľke nie je, z nepriateľa nepadá. Štart: Worker Ant všetky tri, Pill Bug semienka+oriešky,
  Armed Ant kamienky+oriešky, Ant Soldier všetky tri (2/2/1 ks) - čísla na doladenie.
- Nový `core/currency` (peňaženka, `rollCurrencyDrops`, `addToWallet`, README, testy); vlastný Rng stream
  `currencyRng` (mince nemenia drop predmetov ani boj); event `currencyFound`; `state.wallet`.
- **Spawn tabuľka** v `data/tiles.json` (`spawns`: nepriateľ + váha) nahradila `enemyIds`; výber je vážený,
  počiatočné váhy rovnaké (50/50) = doterajšie správanie. Vložiť/odobrať nepriateľa z políčka = jeden riadok.
- UI: riadok „Pebbles x · Seeds y · Nuts z“ vpravo pod výberom políčok; popup „+2 Seeds“ nad nepriateľom.
- GDD 8.2 + 11.1 + changelog 2.5. 274 testov zelených. V prehliadači overené len rozloženie HUD.
- Pozn.: debug „Drop rate“ škáluje len predmety, mince nie (padajú 20-40 % tak či tak).

### Loot v2.4 – drop tabuľky per nepriateľ (2026-09-29)
- GDD 9.3/9.5/9.6: nahradené spoločné pravidlá (výber predmetu z tabuľky políčka, globálne váhy
  vzácnosti) za vlastnú drop tabuľku a tabuľku váh vzácnosti pre **každého nepriateľa**, obe
  škálované jeho vlastným `minLevel`/`maxLevel` (nezávisle od políčka). Z jedného zabitia môže
  padnúť 0, 1 aj viac predmetov naraz (každá položka sa hodí samostatne).
- Unikátne/set predmety sú vlastný riadok v tabuľke s pevnou vzácnosťou - starý fallback „unique
  bez kusu → Rare" už nemôže nastať. Pity nezmenené (garantuje aspoň danú vzácnosť aj mimo tabuliek).
- `data/rarities.json` stratil `weight`/`minTileTier` (len metadáta: farba, násobok, afixy, MF,
  quest zámok). `data/enemies.json`: Worker Ant/Pill Bug/Armed Ant majú vyplnené tabuľky
  (štartovacie čísla podľa starých globálnych váh - treba doladiť, krok 3 nižšie).
- `FightScene`: kocky/popupy pri viacerých dropoch naraz idú vedľa seba (nie postupne); debug
  „Drop rate" tlačidlo teraz škáluje % každej položky v tabuľke aktuálneho nepriateľa.
- 262 testov zelených (bolo 250). Tomas otestoval (aj po reštarte dev servera kvôli Vite cache
  po prepnutí vetvy) a zmergoval (PR #25).
- **Ďalšie kroky (mimo tohto):** 3 – doladiť konkrétne % a váhy v tabuľkách; 4 – editor na
  pohodlnú úpravu tabuliek (návrh príde samostatne, záleží od finálnej schémy).

### M6.2b – políčko T3 (2026-09-29)
- `data/tiles.json`: T3 Ant Trail (Armed Ant + Worker Ant, Lv 4-6), odomkne sa po 15 zabitiach
  na T2 (GDD 8.2). Nový nepriateľ Armed Ant (`data/enemies.json`, GDD 8.3).
- Schéma políčka (`tileSchema`) má voliteľné `unlockLevel` popri `unlockKills` (obe podmienky
  musia platiť) - zatiaľ nevyužité (T3 potrebuje len zabitia), pripravené pre budúci boss T4
  (30 zabití + Lv 5). `core/tiles`: `isTileUnlocked`/`unlockedTileIds` teraz berú aj level hráča.
- 250 testov zelených. Tomas otestoval a zmergoval (PR #24).

### M6.2a – políčka T1→T2 (2026-09-28)
- `data/tiles.json` (nové): T1 Fallen Nest (odomknuté), T2 Mossy Roots (odomkne sa po 8 zabitiach
  na T1). Rozsah levelu nepriateľov je teraz vlastnosť políčka (GDD 8.4 „z rozsahu políčka"), nie
  jedného nepriateľa - `enemies.json` stratil `levelMax`, `baseLevel` ostáva ako vlastná kotva
  nepriateľa (nemení sa podľa políčka).
- Nový Pill Bug (`data/enemies.json`, GDD 8.3) - druhý nepriateľ na T2, armor 1.0.
- `core/encounter`: config drží zoznam nepriateľov políčka (vyberie sa náhodne pri každom novom
  súboji, podobne ako level); `killsByTile` počíta zabitia zvlášť pre každé políčko; nové
  `switchTile()` prepne políčko (len ak odomknuté) bez straty HP/levelu/výbavy.
- Nový modul `core/tiles`: čistá logika odomykania (`isTileUnlocked`/`unlockedTileIds`/`killsToUnlock`).
- `FightScene`: tlačidlá políčok vedľa boja, zamknuté ukáže „🔒 N kills to unlock".
- Overené v prehliadači (AI): odomykanie sa dekrementuje po zabitiach, klik na zamknuté políčko
  nič nerobí, boj beží ďalej. Tomas otestoval a zmergoval (PR #24, spolu s M6.2b).

### M6.1 – levely nepriateľov (2026-09-28)
- Worker Ant má na T1 rozsah levelu 1–2 (`data/enemies.json` `levelMax`); level sa hodí náhodne
  pri každom stretnutí (vlastný Rng stream, ako loot - nemení priebeh boja).
- Za každý level nad základom: +10 % max HP, +5 % poškodenie, +10 % XP, +0.5 % dodge (max 40 %).
  Presnosť rieši už existujúci vzorec rozdielu levelov (GDD 7.2), nemenil sa. Crit zatiaľ preskočený
  (odomkne sa neskôr questom). Konštanty v `balance.json` `enemyLeveling`.
- `core/encounter`: nové `enemyStats(config, level)`, `enemyXpAt(config, level)`; `EncounterState`
  má nové `enemyLevel`/`enemyLevelRng`. V hre sa mení len meno („Worker Ant Lv2“) a HP/poškodenie/XP.
- 227 testov zelených. Overené v prehliadači: level sa mení pri nových nepriateľoch, HP 1.2→1.3 pri Lv2.

### M5.2b3 – hromadné zahodenie podľa vzácnosti (2026-09-27)
- Nad zoznamom batohu je tlačidlo pre každú vzácnosť, ktorá sa tam nachádza a nie je celá
  zamknutá: „Discard Common (12)“ atď. Klik zahodí naraz všetky nezamknuté predmety tej vzácnosti,
  zamknuté (🔒) ostanú.
- `core/inventory.discardRarity` (nový, testovaný), `core/encounter.discardBagRarity`.
- 220 testov zelených. V prehliadači overené len rozloženie (bez predmetov v batohu sa tlačidlá
  správne nezobrazujú); samotné zahadzovanie over ty.

### M5.2b2 – zamknutie + triedenie batohu (2026-09-27)
- Každý predmet v batohu má zámok 🔓/🔒 (tlačidlo pri riadku) - zatiaľ len príznak, nič nerobí
  navyše (blokovanie predaja/rozoberania príde s M16 kováčom / budúcim hromadným zahadzovaním).
- Triedenie: tlačidlo „Sort: Newest“/„Sort: Rarity“ pri hlavičke batohu - podľa dátumu nálezu
  (default) alebo podľa vzácnosti (najcennejšie prvé, v rámci rovnakej vzácnosti najnovšie prvé).
- `core/inventory.toggleLock` (nový, testovaný), `Item.locked` (voliteľný príznak).
- 217 testov zelených. V prehliadači overené len rozloženie (tlačidlo triedenia sa zobrazuje
  správne); samotné zamykanie/triedenie po drope over ty.

### M5.2b1 – porovnanie pred nasadením (2026-09-27)
- Funguje rovnako na telefóne aj PC (žiadny hover): klik na predmet v batohu rozbalí porovnanie
  oproti nasadenému kusu (dmg, armor, max HP, hit%, interval útoku), pri zbrani zvlášť pre R aj L paw.
  Druhý klik (na Equip/R paw/L paw) až potom reálne nasadí.
- `core/encounter.compareEquip` (nový, testovaný): čistá funkcia, porovná dve zloženia výbavy.
- Oprava chyby: klik na riadok v batohu vedel panel „zaseknúť“ (neviditeľný) - Phaser objekt sa
  nesmie zničiť sám vo vlastnom onClick; teraz sa prekreslenie panelu odkladá na ďalší frame.
- Oprava po teste (Tomas): rozdiel menší než 0.1 (pod presnosť zobrazenia) sa už neukazuje ako
  mätúce „-0.0“ - taký rozdiel sa ráta ako „bez zmeny“ (`core/encounter.classifyEquip`, nové).
- Nové: predmety v batohu majú jemné podfarbenie - zelené, ak je predmet pre aspoň jeden vhodný
  slot vylepšenie, červené, ak je vo všetkých horší (zmiešané zmeny sa nefarbia).
- **Redizajn podfarbenia (Tomas, po teste):** zbalený riadok v batohu má jemné **modré** podfarbenie,
  ak má predmet aspoň jeden lepší atribut než čo je nasadené (bez ohľadu na horšie atribúty).
  Po rozkliknutí sa každý riadok porovnania farbí zvlášť - **zeleno** čo je lepšie, **červeno** čo
  je horšie (napr. pri zbrani môže byť poškodenie zelené a interval červený naraz).
- Vysvetlenie k „rovnaký predmet, ale +0.1 Armor“: Common predmety sa rolujú v rozsahu 0.01 (GDD 9.3),
  napr. Pebble Pendant má armor 0.10-0.20 - dva kusy môžu vyzerať v zozname rovnako („+Armor 0.1“,
  floor na 1 desatinné miesto), no v skutočnosti majú inú hodnotu. Porovnanie ukazuje skutočný
  (skrytý) rozdiel správne - nie je to bug, len displej predmetu má menšiu presnosť než porovnanie.
- 215 testov zelených.

### M5.2a – limit batohu 20 + DPS (2026-09-27)
- `core/inventory`: `BAG_CAPACITY = 20`, `addToBag` ďalší predmet zahodí, keď je batoh plný.
- `itemFound` event má `bagFull`; keď je batoh plný, popup pri drope ukáže „(bag full, lost)“ červenou.
- Panel Found items: hlavička „FOUND ITEMS (n/20, newest first)“, pri viac než 8 predmetoch pribudnú
  šípky ▲/▼ na prehŕňanie (posun po 8).
- Stats: nový riadok **DPS** (poškodenie / interval útoku, bez critu zatiaľ) ako rozsah min-max.
- Debug: pod „Speed“ pribudlo „Drop rate“ ×1/×10/100 % na rýchle testovanie (nemení balans).
- 213 testov zelených. Overené v prehliadači: DPS riadok, počítadlo n/20, drop a Equip tlačidlá;
  presné dosiahnutie limitu 20 a scroll šípky overené len testom (batoh sa v prehliadači naplnil
  len po 7, simulácia pri ×50 v testovacom prehliadači beží nerovnomerne).

### M5.1 – výbava (2026-09-27)
- 9 slotov: pravá/ľavá labka, ranged, head, body, legs, ring, amulet, tail (tail zatiaľ bez predmetov).
- Ľavá labka: druhá zbraň pridá 50 % poškodenia (`balance.json` `offHandDamagePct`), interval nemení.
- Zbraň posúva interval o pevné sekundy (`items.json` `attackIntervalModS`): Sharp Twig −0.4 s (4.0 → 3.6 s),
  Pebble Club +0.2 s. GDD v2.3.
- Nové moduly `core/inventory` (sloty, bag, equip/unequip) a `core/stats` (skladanie štatistík z výbavy).
- UI: panel Found items = EQUIPPED + nájdené predmety s tlačidlami R paw / L paw / Equip / Off;
  Stats vľavo dole nad Time – oba panely naraz. 212 testov zelených.
- Overené v prehliadači: rozloženie panelov; nasadenie predmetu v prehliadači neoverené (overené testami).

### M4.2 – kocka k20 (2026-09-26)
- `data/rarities.json`: pridané `diceRange`/`goldDiceRange` (1–14 Common, 15–18 Uncommon, 19 Rare,
  20 → zlatá kocka s vlastným rozsahom pre Unique/Set/Legendary). Zod schéma (`diceRangeSchema`).
- `core/loot.diceFaces(item, config)`: vyberie stenu(y) kocky podľa vzácnosti predmetu – deterministicky
  z ID predmetu (kozmetické, nepoužíva boj. Rng stream).
- `src/game/ui/Dice.ts`: kocka sa krátko zatočí a zastaví na danom čísle (Phaser timer, čisto vizuál).
- `FightScene`: pri drope sa zobrazí kocka (+ zlatá druhá pri Unique/Set/Legendary), potom „Found: …“.
- 194 testov zelených (bolo 189). Overené v prehliadači: kocka padla na 17 (Uncommon rozsah), sedelo
  to s nasledujúcim „Found: Leaf Cap“.

### M4.1c – pity podľa vzácnosti (2026-09-26)
- Samostatné počítadlá: Rare 1000, Unique 5000, Legendary 20 000 zabití (`balance.json` `loot.pity`).
  Drop vynuluje počítadlá svojej a nižších vzácností. Počíta sa len keď vzácnosť môže padnúť
  (na T1: len Rare – unikáty tu nie sú, Legendary zamknutý). GDD v2.2. 189 testov zelených.
- Tip: ak hra na localhost nejde po prepnutí vetiev, reštartovať `npm run dev` (zastaraná cache Vite).

### M4.1b – úpravy po teste M4.1 (2026-09-26)
- Pity garantuje aspoň **Rare** (bolo Unique+); vľavo dole odpočet „Lucky acorn: Rare guaranteed in N kills“.
- **Legendary zamknutý** (`rarities.json` `unlockedBy`), kým ho neodomkne quest (ktorý – otvorené, GDD 24).
- Vľavo dole **čas hry** (počíta sa so simuláciou, pri ×50 beží 50× rýchlejšie).
- GDD v2.1. 186 testov zelených.

### M4.1 – generovanie a drop predmetov (2026-09-26)
- Dáta: `items.json` (5 predmetov pre T1: Sharp Twig, Pebble Club, Leaf Cap, Leaf Vest, Pebble Pendant),
  `rarities.json` (váhy, násobky, afixy, MF, pity, Set až od T3), `affixes.json` (12 afixov, zamknuté
  crit/MF/dodge/stun), `balance.json` `loot` (drop 4 %, pity 1000, rast afixov 35 %/tier). Zod schémy.
- Nový modul `core/loot`: drop 4 % za zabitie, hod na vzácnosť (MF lineárne/klesajúco, Common = zvyšok),
  pity 1000 zabití → istý Unique+ (na T1 bez unikátov = Legendary), generovanie hodnôt na 0.01 × násobok
  vzácnosti, afixy bez duplicít a bez zamknutých, Unique bez unikátu → Rare s 3 afixmi (GDD 9.5).
- `core/encounter`: po zabití hod na drop (vlastný Rng stream – loot nemení priebeh boja), udalosť
  `itemFound`, zoznam `foundItems` (dočasne, kým nepríde inventár v M5).
- `FightScene`: „Found: Sharp Twig“ vo farbe vzácnosti, tlačidlo **Found items** (posledných 10).
- GDD v2.0: 9.3 hodnoty na 0.01; 24 interval pästí = základ postavy, zbraň ho vylepšuje (vzorec v M5).
- Test podľa GDD: 10 000 hodov má správne rozdelenie vzácností. 184 testov zelených (bolo 159).
- **Neskôr:** unikáty/sety a ich vlastnosti, legendárne črty, vylepšovanie (M16); kocka + pity počítadlo
  + skladanie štatistík z výbavy (M4.2).

### Opravy po teste M3.2 (2026-09-26)
- **Bug:** HP bar/text vedel ukázať „0.0“, kým bol bojovník ešte nažive (napr. mravec po zásahu
  1.1 z 1.2 HP) a útočil ďalej – bolo to len zobrazenie (floor na 0.1 z v1.7), nie chyba v HP. Nová
  funkcia `core/numbers.formatHpHundredths`: kým je HP > 0, nikdy sa nezobrazí „0.0“ (ukáže „0.1“).
- Regenerácia **0.1 HP / 2 s → 0.1 HP / 3 s** (Tomas). GDD 6.1 + Changelog v1.9.
- Do „Show stats“ pribudla hodnota regenerácie (`Regen: 0.1 / 3.0 s`).
- Interval útoku v „Show stats“ teraz na **2 desatinné miesta** (predtým floor na 0.1, malé rozdiely
  medzi levelmi neboli vidieť).
- 159 testov zelených (bolo 156).

### M3.2 – regenerácia HP a skutočná smrť (2026-09-26)
- **Regenerácia** (GDD 6.1/7.1): 0.1 HP každé 2 s, +3 %/level (zložene). Tiká v `idle`, `searching`
  aj `fighting` (nie v úkryte – ten má vlastné doliečenie). Nikdy nepresiahne max HP.
- **Skutočná smrť (online, GDD 6.3):** pri páde na 0 HP veverička stratí **10 % postupu v aktuálnom
  leveli** (level nikdy neklesne), prejde do novej fázy **`hideout`** (úkryt) na 10 s a potom sa
  vráti do `idle` s plným HP. Kým je v úkryte, Find enemy aj Peace! nič nerobia.
- Dáta: `balance.json` – `player.regenAmount/regenIntervalS/regenGrowthPctPerLevel`, nová sekcia
  `death.hideoutRegenS/xpLossPct`. Zod schémy rozšírené.
- `FightScene`: počas úkrytu sa ukáže bar „In the hideout...“, „Knocked out!“ a „-X XP“ pri páde.
- 156 testov zelených (bolo 144). Overené v prehliadači: regenerácia drží veveričku nažive aj cez
  level 10 (mravec je na jej úrovni neškodný – to je v poriadku, zápas je nevyrovnaný zámerne, kým
  nepríde mapa s ťažšími políčkami). Smrť/úkryt som naživo nevyvolal (trvalo by to veľmi dlho pri
  súčasnom balanse), ale je pokrytá testami vrátane deterministického scenára s "istou" smrťou.

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
1. Tomas otestuje M4.2 (PR) → merge. **M4 Predmety bude tým celá hotová.**
2. Potom **M5 Inventár a výbava**: 20 slotov, 7 slotov výbavy, nasadiť/zložiť, `core/stats`
   (postava + výbava: pevné hodnoty sa sčítajú, percentá násobia – GDD 6.1 v1.8), interval útoku
   so zbraňou vylepšuje základ postavy (GDD v2.0, Tomas). Model: Opus 5.5 (skladanie štatistík).

## Rozhodnutia (2026-09-26)
- Find enemy po príchode na políčko, potom automatické hľadanie po každom zabití; Peace! zastaví a ukončí boj hneď (bez XP/lootu).
- Smrť online: úkryt, plné HP za 10 s, zostane v úkryte, hráč sám vyberie políčko. Strata 10 % aktuálneho postupu v leveli (level nikdy neklesne). Auto-ústup zrušený.
- Smrť offline: bez straty XP, 10 s regenerácia v úkryte, pokračuje na tom istom políčku; na neudržateľnom políčku čas zabitia ×2 (10 s → 20 s); súhrn ukáže loot, meny, XP, počet smrtí a čas regenerácie.

## Otvorené otázky
1. Čas zabitia ×2 offline platí len na políčku, kde by veverička umierala (tak je to v GDD v1.3), alebo pre celý offline? Potvrdiť pri M9.

## Návrhy (mimo plánu – len zapísané)
- (zatiaľ nič)
