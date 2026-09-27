import type { EquipComparison } from '../core/encounter/encounter';
import type { Item, ItemStat } from '../core/loot/loot';
import { formatHundredths, fromHundredths } from '../core/numbers/numbers';
import { t, tDynamic } from './text';

/** "Sharp Twig" */
export function itemName(item: Item): string {
  return tDynamic(`item.${item.baseId}.name`);
}

/** "Uncommon" */
export function rarityName(rarityId: string): string {
  return tDynamic(`rarity.${rarityId}.name`);
}

/** "+Armor 0.1" or "+Damage 4.2 %" (percent stats end with "Pct"; values floor to 0.1). */
export function statText(stat: ItemStat): string {
  // Both flat and percent values are hundredths (0.25 -> 25, 3 % -> 300), so one formatter fits.
  const suffix = stat.stat.endsWith('Pct') ? ' %' : '';
  return `+${tDynamic(`stat.${stat.stat}.name`)} ${formatHundredths(stat.value)}${suffix}`;
}

/** Signed delta for display, e.g. -130 -> "-1.3", 0 -> "0" (not the design-value floor rule - this is a diff). */
function signedHundredths(hundredths: number): string {
  const v = fromHundredths(Math.abs(hundredths)).toFixed(1);
  return hundredths < 0 ? `-${v}` : hundredths > 0 ? `+${v}` : '0';
}

/**
 * One-line stat diff for tap-to-compare (M5.2b1): only non-zero fields, e.g.
 * "Damage: +0.3/+0.5, Attack interval: -0.40 s, Hit chance: +1.9 %".
 */
export function equipComparisonText(diff: EquipComparison): string {
  const parts: string[] = [];
  if (diff.damageMin !== 0 || diff.damageMax !== 0) {
    parts.push(`${t('stats.damage')}: ${signedHundredths(diff.damageMin)}/${signedHundredths(diff.damageMax)}`);
  }
  if (diff.attackIntervalMs !== 0) {
    const s = (diff.attackIntervalMs / 1000).toFixed(2);
    parts.push(`${t('stats.attackInterval')}: ${diff.attackIntervalMs > 0 ? '+' : ''}${s} s`);
  }
  if (diff.maxHp !== 0) parts.push(`${t('stats.maxHp')}: ${signedHundredths(diff.maxHp)}`);
  if (diff.armor !== 0) parts.push(`${t('stats.armor')}: ${signedHundredths(diff.armor)}`);
  if (diff.hitPct !== 0) {
    parts.push(`${t('stats.hitChance')}: ${diff.hitPct > 0 ? '+' : ''}${diff.hitPct.toFixed(1)} %`);
  }
  return parts.length ? parts.join(', ') : t('compare.none');
}

/** One-line summary: "Sharp Twig [Uncommon] - Damage 0.3-0.5, +Armor 0.1" */
export function itemSummary(item: Item): string {
  const parts: string[] = [];
  if (item.weapon) {
    parts.push(`${t('loot.damage')} ${formatHundredths(item.weapon.damageMin)}-${formatHundredths(item.weapon.damageMax)}`);
  }
  for (const s of [...item.stats, ...item.affixes]) parts.push(statText(s));
  return `${itemName(item)} [${rarityName(item.rarityId)}]${parts.length ? ' - ' + parts.join(', ') : ''}`;
}
