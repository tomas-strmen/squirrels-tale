/**
 * Ammo for the ranged weapon (GDD 7.3, M7.3b). Pure; the wallet and the shots
 * live in `core/encounter`, which calls these helpers.
 *
 * Every shot spends `nutsPerShot` nuts from the wallet, but never below the
 * player's "keep at least N nuts" reserve (kept for food/trade). Without nuts
 * to spare the slingshot shoots pebbles from the ground: unlimited, but only
 * `groundAmmoDamagePct` % of the damage. The reserve does not limit eating.
 */
import type { Wallet } from '../currency/currency';

export type AmmoKind = 'nuts' | 'ground';

/** Design values from data/balance.json `ammo`. */
export interface AmmoConfigInput {
  readonly nutsPerShot: number;
  readonly groundAmmoDamagePct: number;
  /** Starting value of the "keep at least N nuts" setting. */
  readonly keepNutsDefault: number;
}

export type AmmoConfig = AmmoConfigInput;

export function createAmmoConfig(input: AmmoConfigInput): AmmoConfig {
  const wholeAtLeast = (v: number, min: number) => Number.isInteger(v) && v >= min;
  if (!wholeAtLeast(input.nutsPerShot, 1)) throw new Error('nutsPerShot must be a whole number >= 1');
  if (!wholeAtLeast(input.keepNutsDefault, 0)) throw new Error('keepNutsDefault must be a whole number >= 0');
  if (!(input.groundAmmoDamagePct > 0 && input.groundAmmoDamagePct <= 100)) {
    throw new Error('groundAmmoDamagePct must be in 1..100');
  }
  return { ...input };
}

/** What the next shot uses: nuts if the wallet can spare them above `keepNuts`, else ground pebbles. */
export function nextAmmo(wallet: Wallet, keepNuts: number, config: AmmoConfig): AmmoKind {
  return wallet.nuts - config.nutsPerShot >= keepNuts ? 'nuts' : 'ground';
}

/** Damage of a shot with `ammo`, in % of the normal damage (GDD 7.2 ammoMult). */
export function ammoDamagePct(ammo: AmmoKind, config: AmmoConfig): number {
  return ammo === 'nuts' ? 100 : config.groundAmmoDamagePct;
}

/** Wallet after one shot with `ammo` (ground pebbles are free). */
export function spendAmmo(wallet: Wallet, ammo: AmmoKind, config: AmmoConfig): Wallet {
  return ammo === 'nuts' ? { ...wallet, nuts: wallet.nuts - config.nutsPerShot } : wallet;
}
