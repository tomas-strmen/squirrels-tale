# Squirrel's Tale (working title)

Idle RPG about a squirrel. TypeScript + Phaser + Vite. See `docs/GDD.md` and `docs/ROADMAP.md`.

## Run
```
npm install
npm run dev
```
Open http://localhost:5173

## Check
```
npm run check   # typecheck + lint + tests
npm run test:e2e # Playwright smoke test (builds + opens it in a real browser)
```

## Play in the browser
https://tomas-strmen.github.io/squirrels-tale/ (auto-deployed from `main`)

## Layout
```
src/core/     pure game logic + tests (no Phaser)
src/game/     Phaser scenes and UI (only renders)
data/         game data (JSON)
strings/      texts (en.json)
docs/         GDD, ROADMAP, working agreement
```
