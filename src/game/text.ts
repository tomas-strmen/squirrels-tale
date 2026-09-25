import en from '../../strings/en.json';

export type TextKey = keyof typeof en;

/** Returns the English text for a key from strings/en.json. */
export function t(key: TextKey): string {
  return en[key];
}

/** Lookup for keys built at runtime (e.g. enemy names). Falls back to the key itself. */
export function tDynamic(key: string): string {
  const table: Record<string, string> = en;
  return table[key] ?? key;
}
