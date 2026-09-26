# core/content

Zod schemas for `data/*.json`. Invalid data fails a test with a clear message
instead of crashing somewhere unrelated later. A new enemy/item is a new
record in the JSON, never new code here.

## Public API
- `idSchema` – snake_case id (`worker_ant`).
- `designSecondsSchema` – a design duration in seconds (GDD 5: max. 1 decimal place, >= 0).
- `enemySchema` / `enemiesSchema` (+ `Enemy` type), `balanceSchema` (+ `Balance` type) –
  schemas for `data/enemies.json` and `data/balance.json`.
- `designValueSchema`, `percentSchema` – HP/damage/armor (max. 1 decimal) and whole percentages.
- `parseEnemies(data)`, `parseBalance(data)` – parse + throw a readable `ZodError`
  if the data is invalid.
- `toEncounterConfigInput(balance, enemy)` (`encounterInput.ts`) – maps validated data to
  the input of `createEncounterConfig`, used by the game and the content tests.

## Depends on
- `zod`; `core/encounter` (types only).
