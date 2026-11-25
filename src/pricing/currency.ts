/**
 * Indicative FX for deal-room quotes. Rates are static on purpose.
 * `unitsPerUsd` is how many units of that currency one US dollar buys.
 * Money is rounded half away from zero to the currency's minor units.
 */

export const CURRENCIES = {
  USD: { name: "US Dollar", symbol: "$", minorUnits: 2, unitsPerUsd: 1 },
  EUR: { name: "Euro", symbol: "€", minorUnits: 2, unitsPerUsd: 0.92 },
  GBP: { name: "British Pound", symbol: "£", minorUnits: 2, unitsPerUsd: 0.78 },
  CHF: { name: "Swiss Franc", symbol: "CHF ", minorUnits: 2, unitsPerUsd: 0.88 },
  JPY: { name: "Japanese Yen", symbol: "¥", minorUnits: 0, unitsPerUsd: 150 },
  CAD: { name: "Canadian Dollar", symbol: "CA$", minorUnits: 2, unitsPerUsd: 1.36 },
  AUD: { name: "Australian Dollar", symbol: "A$", minorUnits: 2, unitsPerUsd: 1.53 },
  SEK: { name: "Swedish Krona", symbol: "SEK ", minorUnits: 2, unitsPerUsd: 10.5 },
  SGD: { name: "Singapore Dollar", symbol: "S$", minorUnits: 2, unitsPerUsd: 1.34 },
  BHD: { name: "Bahraini Dinar", symbol: "BD ", minorUnits: 3, unitsPerUsd: 0.376 },
} as const;

export type CurrencyCode = keyof typeof CURRENCIES;

export interface Currency {
  code: CurrencyCode;
  name: string;
  symbol: string;
  minorUnits: number;
  unitsPerUsd: number;
}

export function currencyCodes(): CurrencyCode[] {
  return Object.keys(CURRENCIES) as CurrencyCode[];
}

export function isCurrencyCode(value: string): value is CurrencyCode {
  return Object.prototype.hasOwnProperty.call(CURRENCIES, value);
}

export function getCurrency(code: CurrencyCode): Currency {
  const row = CURRENCIES[code];
  return { code, ...row };
}

/** Round half away from zero to `minorUnits` decimal places. */
export function roundHalfUp(amount: number, minorUnits: number): number {
  const minor = scaleRoundHalfUp(amount, minorUnits);
  return minorToNumber(minor, minorUnits);
}

/** Integer division, rounding half away from zero. */
export function divideRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) {
    throw new Error("denominator must be positive");
  }
  const negative = numerator < 0n;
  const dividend = negative ? -numerator : numerator;
  const quotient = dividend / denominator;
  const remainder = dividend % denominator;
  const rounded = remainder * 2n >= denominator ? quotient + 1n : quotient;
  return negative ? -rounded : rounded;
}

export function convert(amount: number, from: CurrencyCode, to: CurrencyCode): number {
  const source = getCurrency(from);
  const target = getCurrency(to);
  const sourceMinor = scaleRoundHalfUp(amount, source.minorUnits);
  if (from === to) {
    return minorToNumber(sourceMinor, source.minorUnits);
  }

  const fromRate = parseRate(source.unitsPerUsd);
  const toRate = parseRate(target.unitsPerUsd);
  const numerator = sourceMinor * fromRate.den * toRate.num * 10n ** BigInt(target.minorUnits);
  const denominator = 10n ** BigInt(source.minorUnits) * fromRate.num * toRate.den;
  return minorToNumber(divideRoundHalfUp(numerator, denominator), target.minorUnits);
}

export function formatMoney(amount: number, code: CurrencyCode): string {
  const currency = getCurrency(code);
  const minor = scaleRoundHalfUp(amount, currency.minorUnits);
  const negative = minor < 0n;
  const digits = (negative ? -minor : minor).toString().padStart(currency.minorUnits + 1, "0");
  const whole = currency.minorUnits === 0 ? digits : digits.slice(0, -currency.minorUnits);
  const fraction = currency.minorUnits === 0 ? "" : digits.slice(-currency.minorUnits);
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const body = fraction === "" ? grouped : `${grouped}.${fraction}`;
  return `${negative ? "-" : ""}${currency.symbol}${body}`;
}

function parseRate(unitsPerUsd: number): { num: bigint; den: bigint } {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(unitsPerUsd.toString());
  if (!match?.[1]) {
    throw new Error(`FX rate is not a decimal: ${unitsPerUsd}`);
  }
  const fraction = match[2] ?? "";
  return {
    num: BigInt(`${match[1]}${fraction}`),
    den: 10n ** BigInt(fraction.length),
  };
}

function scaleRoundHalfUp(amount: number, minorUnits: number): bigint {
  if (!Number.isFinite(amount)) {
    throw new Error("amount must be finite");
  }
  if (!Number.isInteger(minorUnits) || minorUnits < 0 || minorUnits > 8) {
    throw new Error("minorUnits must be an integer from 0 to 8");
  }
  if (amount === 0) {
    return 0n;
  }

  const negative = amount < 0;
  const text = Math.abs(amount).toString();
  if (text.includes("e") || text.includes("E")) {
    throw new Error("amount is outside the supported decimal range");
  }

  const [whole, fraction = ""] = text.split(".");
  const padded = fraction.padEnd(minorUnits + 1, "0");
  const kept = padded.slice(0, minorUnits);
  const next = padded[minorUnits] ?? "0";
  let scaled = BigInt(`${whole}${kept}`);
  if (next >= "5") {
    scaled += 1n;
  }
  return negative ? -scaled : scaled;
}

function minorToNumber(minor: bigint, minorUnits: number): number {
  const negative = minor < 0n;
  const value = Number(negative ? -minor : minor) / 10 ** minorUnits;
  return negative ? -value : value;
}
