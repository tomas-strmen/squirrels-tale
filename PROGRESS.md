# PROGRESS – stav vývoja

## Aktuálne
- **Etapa:** M0 Kostra (GDD kap. 22)
- **Posledný krok:** M0.1 – **schválené** Tomasom (2026-09-26)
- **Pracovný režim:** od ďalšieho sedenia Claude desktop → **Code** (Local, D:\Strmienka\HRA-vevericka). AI spúšťa npm/git sama.

## Hotové
### M0.1 – lokálna kostra + ukážka boja (2026-09-26) – schválené
- Vite + TypeScript + Phaser 4, Vitest, ESLint (`src/core` nesmie importovať Phaser).
- `src/core/time` – pevný krok 100 ms, prevod sekúnd na ms s kontrolou 1 desatinného miesta.
- `src/core/encounter` – stavy idle → searching → fighting, časovače útoku, bez HP a poškodenia.
- `src/game/scenes/FightScene` – sivé štvorce, tlačidlo Find enemy, bar hľadania (1.0 s), bary útoku, „skok“ pri útoku.
- Dáta: `data/balance.json` (veverička bez zbrane 3.0 s), `data/enemies.json` (Worker Ant 2.0 s); texty: `strings/en.json`.
- 26 testov zelených (overené aj u Tomasa).
- GDD v1.1 a v1.2 zapísané v `docs/GDD.md` aj v projekte (`claude/GDD.md`).
- **Pozor:** Git ešte nie je inicializovaný – nič nie je commitnuté.

## Ďalší krok (prvé sedenie v Code)
1. **Git:** `git config` (meno + e-mail Tomasa, e-mail až keď bude GitHub účet → noreply), `git init -b main`, prvý commit M0.1.
2. **M0.1b – tlačidlo Peace!** (GDD 7.1 v1.2): viditeľné počas hľadania aj boja; stlačenie hneď ukončí hľadanie/boj
   (nepriateľ zmizne, bez XP a lootu) → späť stav idle s tlačidlom Find enemy. Logika v `core/encounter` + testy, text v `en.json`.
3. Potom **M0.2:** GitHub účet + repozitár, push, GitHub Actions CI. **M0.3:** Playwright smoke + GitHub Pages → test na mobile.

## Rozhodnutia (2026-09-26)
- Find enemy po príchode na políčko, potom automatické hľadanie po každom zabití; Peace! zastaví a ukončí boj hneď (bez XP/lootu).
- Smrť online: úkryt, plné HP za 10 s, zostane v úkryte, hráč sám vyberie políčko. Strata 10 % aktuálneho postupu v leveli (level nikdy neklesne). Auto-ústup zrušený.
- Smrť offline: bez straty XP, 10 s regenerácia v úkryte, pokračuje na tom istom políčku; na neudržateľnom políčku čas zabitia ×2 (10 s → 20 s); súhrn ukáže loot, meny, XP, počet smrtí a čas regenerácie.

## Otvorené otázky
1. Čas zabitia ×2 offline platí len na políčku, kde by veverička umierala (tak je to v GDD v1.3), alebo pre celý offline? Potvrdiť pri M9.

## Návrhy (mimo plánu – len zapísané)
- (zatiaľ nič)
