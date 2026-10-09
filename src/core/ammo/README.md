# core/ammo

Ammo for the ranged weapon (GDD 7.3, M7.3b). Pure TypeScript, no Phaser.

Each shot spends `nutsPerShot` nuts from the wallet (`core/currency`), but never below the
player's "keep at least N nuts" reserve (`state.keepNuts` in `core/encounter`, default
`keepNutsDefault`). Without nuts to spare the slingshot shoots pebbles from the ground:
unlimited, `groundAmmoDamagePct` % damage (GDD 7.2 `ammoMult`). The reserve never limits eating.
Numbers in `data/balance.json` `ammo`.

## Public API
- `AmmoKind` = `'nuts' | 'ground'`, `createAmmoConfig(input)`.
- `nextAmmo(wallet, keepNuts, config)` – what the next shot uses.
- `ammoDamagePct(ammo, config)` – 100 or `groundAmmoDamagePct`.
- `spendAmmo(wallet, ammo, config)` – wallet after one shot.

## Depends on
`core/currency` (`Wallet`).
