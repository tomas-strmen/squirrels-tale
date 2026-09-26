# HRA-vevericka – spôsob práce a etapy

Cieľ: 2D mobilná hra robená s AI asistentom, testovateľná v prehliadači na PC, vydaná na Google Play (premium nákup + reklamy). Bez deadlinov – mapa smerovania.

**Dokumenty projektu:** `docs/GDD.md` (čo je hra + plán etáp MVP M0–M20, jediný zdroj pravdy), `CLAUDE.md` (ako má AI pracovať), `docs/PROMPT-vyvoj.md` a `docs/archiv/GDD-odpovede.md` (archív z obdobia pred M0).

## 1. Technológia
- **TypeScript + Phaser + Vite** – hra beží v prehliadači (`npm run dev`), hot reload, test aj na mobile cez lokálnu sieť.
- **Capacitor** – zabalí webovú hru do Android appky (.aab pre Google Play).
- Prečo: všetko je text/kód → AI to vie čítať, meniť, testovať a spúšťať (aj headless prehliadač so screenshotmi).
- Alternatíva: Godot 4 – silnejší engine, ale veľa práce v editore, ktorý AI nevidí. Pri 3D hre by dával zmysel Godot/Unity.

## 2. Architektúra (aby zmena jednej veci nerozbila inú)
1. **Dáta oddelené od kódu** – postavy, predmety, zbrane, nepriatelia v JSON so schémou (zod). Nový meč = nový záznam, nie nový kód. Test overí platnosť dát aj odkazy (napr. predmet v loot tabuľke existuje).
2. **Logika oddelená od vykresľovania** – `src/core` je čisté TS bez Phaseru (inventár, boj, ekonomika) → unit testy. `src/game` (Phaser scény) len zobrazuje.
3. **Moduly s kontraktmi** – každý systém (player, inventory, items, combat, map, save, monetization) vo vlastnom priečinku s README: čo robí, verejné API, závislosti. Komunikácia cez event bus / rozhrania.
4. **Mapy v Tiled** (JSON export) – mapa je dáta. (Pre MVP stačí mapa políčok v `data/tiles.json`, Tiled až ak bude treba.)
5. **Save s verziou a migráciami** – zmena inventára nerozbije uložené hry.
6. **Platformová vrstva** – rozhrania `Ads` a `Store`; na webe mock („simulovať kúpu"), na Androide skutočná implementácia.
7. **Texty v súboroch od začiatku** – vydanie **len v angličtine**, všetky texty v `strings/en.json` (ďalší jazyk sa dá pridať neskôr bez prerábky).

```
src/
  core/        # čistá logika + testy (podrobne v GDD kap. 20)
  game/        # Phaser scény, UI
  platform/    # ads, store, storage (web mock | android)
data/          # items.json, enemies.json, tiles.json, balance.json ...
strings/       # en.json
tools/sim/     # headless simulácia tempa
docs/          # GDD.md (kópia z projektu), ARCHITECTURE.md, moduly
CLAUDE.md      # pravidlá pre AI
PROGRESS.md    # stav vývoja
```

## 3. Bezpečnostná sieť
- Git + GitHub, každá zmena na vlastnej vetve cez Pull Request.
- Vitest (logika + validácia dát), Playwright smoke test (hra sa načíta, prejde menu, screenshot).
- GitHub Actions CI – nič sa nemerguje s červenými testami.
- Automatický deploy webovej verzie (GitHub Pages / itch.io) – testeri hrajú v mobile bez inštalácie.

## 4. Pracovný cyklus (ja = orchestrátor)
Dokumenty: `GDD.md` (čo je hra), `ARCHITECTURE.md`, `CLAUDE.md` (pravidlá: nemeň iný modul bez dôvodu, vždy spusti testy, obsah len cez `data/`), `PROGRESS.md`, GitHub Issues ako backlog. Podrobný postup: `claude/PROMPT-vyvoj.md`.

Jedna úloha (20–40 min môjho času denne):
1. AI povie stav a navrhne malý krok + ako ho otestujem.
2. Schválim.
3. AI implementuje na vetve, píše testy, spustí ich.
4. Zahrám si v prehliadači podľa checklistu.
5. Merge + aktualizácia `PROGRESS.md`.

Pravidlá: malé úlohy, pred prerábkou systému najprv „napíš testy na súčasné správanie".
Nástroje: Claude Code / Claude na kód, tento Claude projekt na plánovanie a dizajn.

## 5. Etapy
0. **Nápad** – ✅ hotové: GDD v1.0 (žáner, core loop, rozsah MVP, Premium, plán etáp M0–M20).
1. **Kostra** (GDD M0) – repo, Vite+TS+Phaser, testy, CI, CLAUDE.md, web deploy. Hotové: na mobile otvorím link a vidím, ako sa veverička-štvorček sama bije s nepriateľom.
2. **Prototyp core loopu** (GDD M1–M9) – sivé kocky, žiadna grafika. Otázka: je to zábava? Meniť sa oplatí tu, je to lacné.
3. **Systémy riadené dátami** (GDD M10–M20) – obchod, strom, questy, bossovia, úkryt, kováč, vrátenie v čase, boosty, mock Ads/Store, balans.
4. **Obsah a grafika** – asset packy (Kenney, itch.io), AI/vlastná grafika, `CREDITS.md` s licenciami, zvuk, hudba, menu, nastavenia.
5. **Mobil** – Capacitor Android, dotykové ovládanie, rozlíšenia, výkon, pauza pri prepnutí appky, test na reálnom telefóne.
6. **Monetizácia** – AdMob (len rewarded, na vyžiadanie hráča – žiadne interstitial), jednorazový nákup „Premium" cez Google Play Billing (príp. RevenueCat), obnova nákupov, GDPR súhlas (UMP), privacy policy.
7. **Google Play** – vývojársky účet (jednorazový poplatok, overenie identity); nový osobný účet: uzavretý test s ≥12 testermi 14 dní pred produkciou; target API 36 (od 31. 8. 2026); podpísaný .aab, Data safety, hodnotenie obsahu (IARC), store listing, payments profile.
8. **Po vydaní** – crash reporting, analytika, aktualizácie, remote config, backlog z GDD kap. 23 (achievementy, počasie, pets, mesto, cloud save…).
