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

// GDD 5: stats always display rounded to 0.1. A delta smaller than that would
// show as a confusing "-0.0"/"+0.0", so it counts as "no visible change" here.
const HUNDREDTHS_DISPLAY_THRESHOLD = 5; // 0.05 design units
const HIT_PCT_DISPLAY_THRESHOLD = 0.05; // hitPct is already plain percent, not hundredths
const MS_DISPLAY_THRESHOLD = 5; // 0.005 s

/** Signed delta for display, e.g. -130 -> "-1.3" (not the design-value floor rule - this is a diff). */
function signedHundredths(hundredths: number): string {
  const v = fromHundredths(Math.abs(hundredths)).toFixed(1);
  return hundredths < 0 ? `-${v}` : `+${v}`;
}

/** One comparison line, tagged so the UI can color it (M5.2b1: green = better, red = worse). */
export interface EquipComparisonLine {
  readonly text: string;
  readonly verdict: 'better' | 'worse';
}

/**
 * Per-stat diff for tap-to-compare (M5.2b1): one line per field with a visible
 * (>= 0.1 at display) change, each tagged better/worse so the panel can color
 * it green/red - e.g. "Damage: +0.3/+0.5" (better), "Attack interval: +0.20 s" (worse).
 */
export function equipComparisonLines(diff: EquipComparison): readonly EquipComparisonLine[] {
  const lines: EquipComparisonLine[] = [];
  if (Math.abs(diff.damageMin) >= HUNDREDTHS_DISPLAY_THRESHOLD || Math.abs(diff.damageMax) >= HUNDREDTHS_DISPLAY_THRESHOLD) {
    lines.push({
      text: `${t('stats.damage')}: ${signedHundredths(diff.damageMin)}/${signedHundredths(diff.damageMax)}`,
      verdict: diff.damageMin + diff.damageMax >= 0 ? 'better' : 'worse',
    });
  }
  if (Math.abs(diff.attackIntervalMs) >= MS_DISPLAY_THRESHOLD) {
    const s = (Math.abs(diff.attackIntervalMs) / 1000).toFixed(2);
    lines.push({
      text: `${t('stats.attackInterval')}: ${diff.attackIntervalMs < 0 ? '-' : '+'}${s} s`,
      verdict: diff.attackIntervalMs < 0 ? 'better' : 'worse', // shorter = better
    });
  }
  if (Math.abs(diff.maxHp) >= HUNDREDTHS_DISPLAY_THRESHOLD) {
    lines.push({ text: `${t('stats.maxHp')}: ${signedHundredths(diff.maxHp)}`, verdict: diff.maxHp > 0 ? 'better' : 'worse' });
  }
  if (Math.abs(diff.armor) >= HUNDREDTHS_DISPLAY_THRESHOLD) {
    lines.push({ text: `${t('stats.armor')}: ${signedHundredths(diff.armor)}`, verdict: diff.armor > 0 ? 'better' : 'worse' });
  }
  if (Math.abs(diff.hitPct) >= HIT_PCT_DISPLAY_THRESHOLD) {
    lines.push({
      text: `${t('stats.hitChance')}: ${diff.hitPct > 0 ? '+' : '-'}${Math.abs(diff.hitPct).toFixed(1)} %`,
      verdict: diff.hitPct > 0 ? 'better' : 'worse',
    });
  }
  return lines;
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
