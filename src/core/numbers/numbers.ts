/**
 * Design numbers (GDD 5): stats and other non-duration values (HP, damage, armor, ...).
 *
 * Design values in data/*.json have at most 1 decimal place. Internally they are
 * stored as whole "hundredths" integers (5.3 -> 530), so game math never runs into
 * floating point rounding drift. For display, they are rounded back to 0.1.
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

/** Rounds hundredths to the nearest 0.1 and formats it with exactly 1 decimal place. */
export function formatHundredths(hundredths: number): string {
  const tenths = Math.round(hundredths / 10) * 10;
  return fromHundredths(tenths).toFixed(1);
}
