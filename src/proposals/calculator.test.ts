import { describe, expect, it } from "vitest";
import { buildProposal, QuoteError } from "./calculator.js";

describe("buildProposal", () => {
  it("prices the platform, the seat tier, and hosted pages in USD", () => {
    const quote = buildProposal({ seats: 4, pages: 200, currency: "USD" });

    expect(quote.lines.map((line) => [line.code, line.amountUsd])).toEqual([
      ["PLATFORM", 500],
      ["SEATS", 720],
      ["PAGES", 50],
    ]);
    expect(quote.subtotalUsd).toBe(1270);
    expect(quote.discountUsd).toBe(0);
    expect(quote.totalUsd).toBe(1270);
    expect(quote.total).toBe(1270);
    expect(quote.formattedTotal).toBe("$1,270.00");
  });

  it("bills every seat at the tier the quantity falls in", () => {
    const growth = buildProposal({ seats: 11, pages: 0, currency: "USD" });
    const seatLine = growth.lines.find((line) => line.code === "SEATS");

    expect(seatLine).toMatchObject({ description: "11-50 seats", unitUsd: 140, amountUsd: 1540 });
    expect(growth.totalUsd).toBe(2040);
  });

  it("uses the lower page tier above 1,000 pages", () => {
    const quote = buildProposal({ seats: 1, pages: 1001, currency: "USD" });
    const pageLine = quote.lines.find((line) => line.code === "PAGES");

    expect(pageLine).toMatchObject({ unitUsd: 0.15, amountUsd: 150.15 });
  });

  it("omits the page line when the room has no documents", () => {
    const quote = buildProposal({ seats: 1, pages: 0, currency: "EUR" });

    expect(quote.lines.map((line) => line.code)).toEqual(["PLATFORM", "SEATS"]);
    // 680 USD * 0.92 = 625.60 EUR.
    expect(quote.total).toBe(625.6);
    expect(quote.formattedTotal).toBe("€625.60");
  });

  it("rounds a half-cent discount up before converting", () => {
    // 10% of 680.25 is 68.025, which rounds half-up to 68.03.
    const quote = buildProposal({
      seats: 1,
      pages: 1,
      currency: "USD",
      discountRate: 0.1,
    });

    expect(quote.subtotalUsd).toBe(680.25);
    expect(quote.discountUsd).toBe(68.03);
    expect(quote.totalUsd).toBe(612.22);
  });

  it("rounds a half yen up", () => {
    // 680.25 USD * 150 = 102037.5 JPY, which rounds half-up to 102038.
    const quote = buildProposal({ seats: 1, pages: 1, currency: "JPY" });

    expect(quote.totalUsd).toBe(680.25);
    expect(quote.total).toBe(102038);
    expect(quote.formattedTotal).toBe("¥102,038");
  });

  it("converts the discounted USD total, then rounds half-up", () => {
    // Platform 500 + 1 seat at 180 + 1 page at 0.25 = 680.25 USD.
    // 10% of 680.25 is 68.025, which rounds half-up to 68.03.
    // 612.22 USD * 150 = 91833 JPY.
    const quote = buildProposal({
      seats: 1,
      pages: 1,
      currency: "JPY",
      discountRate: 0.1,
    });

    expect(quote.discountUsd).toBe(68.03);
    expect(quote.totalUsd).toBe(612.22);
    expect(quote.total).toBe(91833);
    expect(quote.formattedTotal).toBe("¥91,833");
  });

  it("keeps three decimal places for Bahraini dinars", () => {
    const quote = buildProposal({ seats: 1, pages: 0, currency: "BHD" });

    // 680 USD * 0.376 = 255.680 BHD.
    expect(quote.formattedTotal).toBe("BD 255.680");
  });

  it("rejects a discount above 40 percent", () => {
    expect(() => buildProposal({ seats: 2, pages: 0, currency: "USD", discountRate: 0.41 })).toThrow(
      QuoteError,
    );
  });

  it("rejects a fractional seat count", () => {
    expect(() => buildProposal({ seats: 1.5, pages: 0, currency: "USD" })).toThrow(QuoteError);
  });

  it("rejects an unknown currency", () => {
    expect(() => buildProposal({ seats: 1, pages: 0, currency: "XYZ" })).toThrow(
      /supported ISO code/,
    );
  });
});
