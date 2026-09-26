/**
 * Design numbers (GDD 5): stats and other non-duration values (HP, damage, armor, ...).
 *
 * Design values in data/*.json have at most 1 decimal place. Internally everything
 * is computed with 2 decimals, as whole "hundredths" integers (5.3 -> 530), so game
 * math never runs into floating point drift. For display, values are rounded DOWN
 * to 0.1 (GDD 5, v1.7).
 *
 * Durations (ms) are a separate concern - see core/time.
 */

const HUNDREDTHS_PER_UNIT = 100;

/**
 * Converts a design value (max. 1 decimal place, e.g. from data/*.json) to whole
 * hundredths. Throws if the value has more than 1 decimal place or is not finite.
 */
export function toHundredths(designValue: number): number {
  if (!Number.isFinite(designValue)) {
    throw new Error(`Invalid number: ${designValue} (must be finite)`);
  }
  const tenths = designValue * 10;
  const roundedTenths = Math.round(tenths);
  if (Math.abs(roundedTenths - tenths) > 1e-9) {
    throw new Error(`Invalid number: ${designValue} (max. 1 decimal place allowed)`);
  }
  return roundedTenths * (HUNDREDTHS_PER_UNIT / 10);
}

/** Converts whole hundredths back to a plain decimal number (for further math). */
export function fromHundredths(hundredths: number): number {
  return hundredths / HUNDREDTHS_PER_UNIT;
}

/**
 * Formats hundredths for display with exactly 1 decimal place, rounded DOWN
 * (GDD 5, v1.7): 4.99 -> "4.9", 0.25 -> "0.2". Internal math keeps 2 decimals.
 */
export function formatHundredths(hundredths: number): string {
  const tenths = Math.floor(hundredths / 10);
  return (tenths / 10).toFixed(1);
}

/**
 * Same floor-to-0.1 display as `formatHundredths`, but a value that is still
 * above 0 never displays as "0.0" (it shows "0.1" instead) - so a bar of HP
 * that is barely alive never looks dead. Only exactly 0 shows "0.0".
 */
export function formatHpHundredths(hundredths: number): string {
  if (hundredths <= 0) return '0.0';
  const tenths = Math.max(1, Math.floor(hundredths / 10));
  return (tenths / 10).toFixed(1);
}
