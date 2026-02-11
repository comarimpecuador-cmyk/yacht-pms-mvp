export type FlagOption = {
  code: string;
  country: string;
  emoji: string;
};

const COUNTRY_BY_CODE: Record<string, string> = {
  AR: 'Argentina',
  AU: 'Australia',
  BR: 'Brazil',
  CA: 'Canada',
  CL: 'Chile',
  CO: 'Colombia',
  DE: 'Germany',
  EC: 'Ecuador',
  ES: 'Spain',
  FR: 'France',
  GB: 'United Kingdom',
  IT: 'Italy',
  MX: 'Mexico',
  NL: 'Netherlands',
  PA: 'Panama',
  PE: 'Peru',
  PT: 'Portugal',
  US: 'United States',
  UY: 'Uruguay',
  VE: 'Venezuela',
};

function toFlagEmoji(code: string): string {
  const normalized = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) {
    return '\u{1F3F3}\u{FE0F}';
  }

  const chars = Array.from(normalized).map((char) =>
    String.fromCodePoint(127397 + char.charCodeAt(0)),
  );

  return chars.join('');
}

export const FLAG_OPTIONS: FlagOption[] = Object.entries(COUNTRY_BY_CODE)
  .map(([code, country]) => ({
    code,
    country,
    emoji: toFlagEmoji(code),
  }))
  .sort((a, b) => a.country.localeCompare(b.country));

export function normalizeFlagCode(code: string): string {
  return code.trim().toUpperCase();
}

export function formatFlagLabel(code: string): string {
  const normalized = normalizeFlagCode(code);
  if (!normalized) {
    return 'Sin bandera';
  }

  const country = COUNTRY_BY_CODE[normalized];
  if (country) {
    return `${toFlagEmoji(normalized)} ${country} (${normalized})`;
  }

  return `${toFlagEmoji(normalized)} ${normalized}`;
}
