import type { Item, ItemStat } from '../core/loot/loot';
import { formatHundredths } from '../core/numbers/numbers';
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

/** One-line summary: "Sharp Twig [Uncommon] - Damage 0.3-0.5, +Armor 0.1" */
export function itemSummary(item: Item): string {
  const parts: string[] = [];
  if (item.weapon) {
    parts.push(`${t('loot.damage')} ${formatHundredths(item.weapon.damageMin)}-${formatHundredths(item.weapon.damageMax)}`);
  }
  for (const s of [...item.stats, ...item.affixes]) parts.push(statText(s));
  return `${itemName(item)} [${rarityName(item.rarityId)}]${parts.length ? ' - ' + parts.join(', ') : ''}`;
}
