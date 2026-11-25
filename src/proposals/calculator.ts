import {
  convert,
  divideRoundHalfUp,
  formatMoney,
  isCurrencyCode,
  type CurrencyCode,
} from "../pricing/currency.js";

/**
 * Annual proposal for a data room.
 * The whole seat count and the whole page count are billed at the tier they
 * fall in. The discount is taken in USD, then the net is converted once.
 */

const PLATFORM_FEE_CENTS = 50_000;
const MAX_DISCOUNT_BPS = 4_000;

const SEAT_TIERS = [
  { upTo: 10, label: "1-10 seats", centsPerUnit: 18_000 },
  { upTo: 50, label: "11-50 seats", centsPerUnit: 14_000 },
  { upTo: 200, label: "51-200 seats", centsPerUnit: 11_000 },
  { upTo: Number.POSITIVE_INFINITY, label: "201+ seats", centsPerUnit: 8_000 },
] as const;

const PAGE_TIERS = [
  { upTo: 1_000, label: "1-1,000 pages", centsPerUnit: 25 },
  { upTo: 10_000, label: "1,001-10,000 pages", centsPerUnit: 15 },
  { upTo: Number.POSITIVE_INFINITY, label: "10,001+ pages", centsPerUnit: 8 },
] as const;

export class QuoteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuoteError";
  }
}

export interface ProposalLine {
  code: "PLATFORM" | "SEATS" | "PAGES";
  description: string;
  quantity: number;
  unitUsd: number;
  amountUsd: number;
}

export interface Proposal {
  currency: CurrencyCode;
  lines: ProposalLine[];
  subtotalUsd: number;
  discountRate: number;
  discountUsd: number;
  totalUsd: number;
  /** Quote-currency total, rounded half-up to that currency's minor units. */
  total: number;
  formattedTotal: string;
}

export function buildProposal(input: unknown): Proposal {
  const body = record(input);
  const seats = requireInt(body.seats, "seats", 1, 100_000);
  const pages = requireInt(body.pages, "pages", 0, 5_000_000);
  const currency = requireCurrency(body.currency);
  const discountRate = body.discountRate === undefined ? 0 : requireDiscount(body.discountRate);
  const discountBps = discountBasisPoints(discountRate);

  const seatTier = tierFor(SEAT_TIERS, seats);
  const pageTier = pages === 0 ? undefined : tierFor(PAGE_TIERS, pages);
  const seatCents = seats * seatTier.centsPerUnit;
  const pageCents = pageTier === undefined ? 0 : pages * pageTier.centsPerUnit;
  const subtotalCents = PLATFORM_FEE_CENTS + seatCents + pageCents;
  const discountCents = Number(
    divideRoundHalfUp(BigInt(subtotalCents) * BigInt(discountBps), 10_000n),
  );
  const totalCents = subtotalCents - discountCents;

  const lines: ProposalLine[] = [
    {
      code: "PLATFORM",
      description: "Data room platform",
      quantity: 1,
      unitUsd: fromCents(PLATFORM_FEE_CENTS),
      amountUsd: fromCents(PLATFORM_FEE_CENTS),
    },
    {
      code: "SEATS",
      description: seatTier.label,
      quantity: seats,
      unitUsd: fromCents(seatTier.centsPerUnit),
      amountUsd: fromCents(seatCents),
    },
  ];
  if (pageTier !== undefined) {
    lines.push({
      code: "PAGES",
      description: pageTier.label,
      quantity: pages,
      unitUsd: fromCents(pageTier.centsPerUnit),
      amountUsd: fromCents(pageCents),
    });
  }

  const subtotalUsd = fromCents(subtotalCents);
  const discountUsd = fromCents(discountCents);
  const totalUsd = fromCents(totalCents);
  // Discount in USD first, then one conversion of the net. Rounding the
  // converted subtotal before the discount moves a half-unit the other way.
  const total = convert(totalUsd, "USD", currency);

  return {
    currency,
    lines,
    subtotalUsd,
    discountRate,
    discountUsd,
    totalUsd,
    total,
    formattedTotal: formatMoney(total, currency),
  };
}

function record(input: unknown): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new QuoteError("quote must be an object");
  }
  return input as Record<string, unknown>;
}

function requireInt(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new QuoteError(`${label} must be an integer from ${min} to ${max}`);
  }
  return value;
}

function requireCurrency(value: unknown): CurrencyCode {
  if (typeof value !== "string" || !isCurrencyCode(value)) {
    throw new QuoteError("currency must be a supported ISO code");
  }
  return value;
}

function requireDiscount(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new QuoteError("discountRate must be a number from 0 to 0.4");
  }
  return value;
}

function discountBasisPoints(rate: number): number {
  if (rate === 0) {
    return 0;
  }
  const match = /^0\.(\d{1,4})$/.exec(rate.toString());
  if (!match?.[1]) {
    throw new QuoteError("discountRate must be from 0 to 0.4 with at most 4 decimal places");
  }
  const bps = Number(match[1].padEnd(4, "0"));
  if (bps > MAX_DISCOUNT_BPS) {
    throw new QuoteError("discountRate cannot exceed 0.4");
  }
  return bps;
}

function tierFor<T extends { upTo: number }>(tiers: readonly T[], quantity: number): T {
  const tier = tiers.find((candidate) => quantity <= candidate.upTo);
  if (tier === undefined) {
    throw new QuoteError("quantity is outside every tier");
  }
  return tier;
}

function fromCents(cents: number): number {
  return cents / 100;
}
