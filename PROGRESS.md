# PROGRESS – stav vývoja

## Aktuálne
- **Etapa:** M0 Kostra (GDD kap. 22)
- **Posledný krok:** M0.2 – GitHub repozitár + CI – hotové, čaká na test Tomasa
- **Pracovný režim:** Claude desktop → **Code** (Local, D:\Strmienka\HRA-vevericka). Model Claude Sonnet 5 (Opus 5.5 len pre náročnejšie etapy – povie sa vopred). AI spúšťa npm/git sama.
- **Git:** repozitár https://github.com/tomas-strmen/squirrels-tale (**verejný** – pred vydaním prepnúť na súkromný, GDD/ROADMAP etapa 6–7), vetva `main`, autor Tomas Strmen `<174743142+tomas-strmen@users.noreply.github.com>`. GitHub účet: **tomas-strmen** (súkromný, e-mail skrytý, blokovanie pushov s e-mailom zapnuté). CI (GitHub Actions) beží pri každom pushi/PR a je zelené.

## Hotové
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
1. **M0.3:** Playwright smoke test + GitHub Pages → test na mobile na šírku. Od tohto kroku zmeny cez Pull Request (nie priamo do `main`).

## Rozhodnutia (2026-09-26)
- Find enemy po príchode na políčko, potom automatické hľadanie po každom zabití; Peace! zastaví a ukončí boj hneď (bez XP/lootu).
- Smrť online: úkryt, plné HP za 10 s, zostane v úkryte, hráč sám vyberie políčko. Strata 10 % aktuálneho postupu v leveli (level nikdy neklesne). Auto-ústup zrušený.
- Smrť offline: bez straty XP, 10 s regenerácia v úkryte, pokračuje na tom istom políčku; na neudržateľnom políčku čas zabitia ×2 (10 s → 20 s); súhrn ukáže loot, meny, XP, počet smrtí a čas regenerácie.

## Otvorené otázky
1. Čas zabitia ×2 offline platí len na políčku, kde by veverička umierala (tak je to v GDD v1.3), alebo pre celý offline? Potvrdiť pri M9.

## Návrhy (mimo plánu – len zapísané)
- (zatiaľ nič)
