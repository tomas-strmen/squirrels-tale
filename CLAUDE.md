# CLAUDE.md – rules for the AI developer

Project: **Squirrel's Tale** – mobile idle RPG about a squirrel (TypeScript + Phaser + Vite, later Capacitor/Android).
Tomas = orchestrator (decides, approves, tests). AI = proposes, programs, tests, explains.

## Sources of truth (read at the start of every session)
1. `docs/GDD.md` – what the game is (rules, numbers, MVP scope, plan M0–M20 in ch. 22).
2. `docs/ROADMAP.md` – technology, architecture, safety net.
3. `PROGRESS.md` – where we stopped, what is next, open questions.
4. `docs/PROMPT-vyvoj.md` – full working agreement. `docs/archiv/` = archive only; on conflict the GDD wins.
`docs/GDD.md` in this repo is the single source of truth (no other copy is kept anywhere else).

## Session flow
Status (3–5 points) → propose ONE small step (files touched, what stays untouched, how Tomas tests it in 10–20 min)
→ **wait for "ok"** → implement on a new branch, small commits, tests → hand-off (≤10 lines + test checklist + run command)
→ fixes within the same step → after "schválené": PR/merge + update `PROGRESS.md`.

## Code rules
- Touch only the modules the step is about. Need to change another one? Say so and explain first.
- **Logic in `src/core`** (pure TS, no Phaser, with Vitest tests). `src/game` only renders and forwards input.
- **Content and numbers only in `data/*.json`** (zod schemas from M1). New item = new record, not new code.
- **All texts in `strings/en.json`**, never hard-coded. The game is in English.
- Numbers (GDD 5): design values max. 1 decimal; internally integers (hundredths; durations in ms); display rounded to 0.1.
- Randomness only via seeded `Rng`. Simulation in fixed **100 ms** steps (`core/time`).
- Save must never break: format change = new version + migration + test.
- Before reworking an existing system, write tests for its current behaviour.
- No features outside the plan – write ideas into `PROGRESS.md` and ask.
- GDD change: propose exact old → new text + reason; after approval update GDD + Changelog.
- Keep debug tools working (speed ×1/×4/×20, time skip, add items, reset).
- MVP graphics = grey shapes / placeholders.
- Each `src/core` module has a README (what it does, public API, dependencies).

## Definition of done
Works in the browser per the checklist · unit tests for new logic · `npm run check` green (typecheck + lint + tests) · CI green (from M0.2)
· data valid, texts in `en.json` · `PROGRESS.md` updated · GDD changes in the Changelog.

## Communication
Talk to Tomas in **Slovak**, short and clear (he is not a professional programmer – explain technical things in one sentence).
Code, comments, commits and game texts in **English**. Max. 3 questions at a time, always with a recommendation.
Always separate: **done & tested** / **done, not tested** / **not done**.

## Commands
- `npm install` – install dependencies (once, or after `package.json` changes)
- `npm run dev` – dev server at http://localhost:5173 (also reachable on the local network)
- `npm run check` – typecheck + lint + tests
- `npm run build` – production build into `dist/`
