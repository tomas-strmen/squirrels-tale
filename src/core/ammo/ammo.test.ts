import { describe, expect, it } from 'vitest';
import { EMPTY_WALLET } from '../currency/currency';
import { ammoDamagePct, createAmmoConfig, nextAmmo, spendAmmo } from './ammo';

const config = createAmmoConfig({ nutsPerShot: 1, groundAmmoDamagePct: 50, keepNutsDefault: 5 });
const nuts = (n: number) => ({ ...EMPTY_WALLET, nuts: n });

describe('ammo (GDD 7.3, M7.3b)', () => {
  it('shoots nuts while the wallet stays at or above the reserve', () => {
    expect(nextAmmo(nuts(6), 5, config)).toBe('nuts');
    expect(nextAmmo(nuts(5), 5, config)).toBe('ground');
    expect(nextAmmo(nuts(1), 0, config)).toBe('nuts');
    expect(nextAmmo(nuts(0), 0, config)).toBe('ground');
  });

  it('a nut shot spends nuts, a ground shot is free', () => {
    expect(spendAmmo(nuts(6), 'nuts', config).nuts).toBe(5);
    const w = nuts(3);
    expect(spendAmmo(w, 'ground', config)).toBe(w);
  });

  it('ground pebbles deal 50 % damage', () => {
    expect(ammoDamagePct('nuts', config)).toBe(100);
    expect(ammoDamagePct('ground', config)).toBe(50);
  });

  it('rejects invalid numbers', () => {
    expect(() => createAmmoConfig({ nutsPerShot: 0, groundAmmoDamagePct: 50, keepNutsDefault: 5 })).toThrow();
    expect(() => createAmmoConfig({ nutsPerShot: 1, groundAmmoDamagePct: 0, keepNutsDefault: 5 })).toThrow();
    expect(() => createAmmoConfig({ nutsPerShot: 1, groundAmmoDamagePct: 50, keepNutsDefault: -1 })).toThrow();
  });
});
