# core/content

Zod schemas for `data/*.json`. Invalid data fails a test with a clear message
instead of crashing somewhere unrelated later. A new enemy/item is a new
record in the JSON, never new code here.

## Public API
- `idSchema` – snake_case id (`worker_ant`).
- `designSecondsSchema` – a design duration in seconds (GDD 5: max. 1 decimal place, >= 0).
- `enemySchema` / `enemiesSchema` (+ `Enemy` type), `balanceSchema` (+ `Balance` type) –
  schemas for `data/enemies.json` and `data/balance.json`.
- `parseEnemies(data)`, `parseBalance(data)` – parse + throw a readable `ZodError`
  if the data is invalid.

## Depends on
- `zod`.
