import { describe, expect, it } from "vitest";
import {
  convert,
  currencyCodes,
  divideRoundHalfUp,
  formatMoney,
  roundHalfUp,
} from "./currency.js";

describe("currencies", () => {
  it("lists ten quote currencies", () => {
    expect(currencyCodes()).toEqual([
      "USD",
      "EUR",
      "GBP",
      "CHF",
      "JPY",
      "CAD",
      "AUD",
      "SEK",
      "SGD",
      "BHD",
    ]);
  });
});

describe("roundHalfUp", () => {
  it("rounds a trailing 5 away from zero", () => {
    expect(roundHalfUp(1.005, 2)).toBe(1.01);
    expect(roundHalfUp(1.225, 2)).toBe(1.23);
    expect(roundHalfUp(2.5, 0)).toBe(3);
    expect(roundHalfUp(-1.5, 0)).toBe(-2);
  });

  it("leaves a digit below 5 alone", () => {
    expect(roundHalfUp(1.224, 2)).toBe(1.22);
    expect(roundHalfUp(1.2344, 3)).toBe(1.234);
  });

  it("rounds half a fils up to 3 decimal places", () => {
    expect(roundHalfUp(1.2345, 3)).toBe(1.235);
  });
});

describe("divideRoundHalfUp", () => {
  it("rounds an exact half up", () => {
    expect(divideRoundHalfUp(1n, 2n)).toBe(1n);
    expect(divideRoundHalfUp(-1n, 2n)).toBe(-1n);
    expect(divideRoundHalfUp(1n, 3n)).toBe(0n);
  });
});

describe("convert", () => {
  it("converts one dollar into the static rates", () => {
    expect(convert(1, "USD", "USD")).toBe(1);
    expect(convert(1, "USD", "EUR")).toBe(0.92);
    expect(convert(1, "USD", "JPY")).toBe(150);
    expect(convert(1, "USD", "SEK")).toBe(10.5);
    expect(convert(1, "USD", "BHD")).toBe(0.376);
  });

  it("rounds a half yen up", () => {
    // 680.25 USD * 150 = 102037.5 JPY.
    expect(convert(680.25, "USD", "JPY")).toBe(102038);
  });

  it("converts euros back to dollars", () => {
    expect(convert(92, "EUR", "USD")).toBe(100);
  });
});

describe("formatMoney", () => {
  it("formats minor units and thousands separators", () => {
    expect(formatMoney(680.25, "USD")).toBe("$680.25");
    expect(formatMoney(102038, "JPY")).toBe("¥102,038");
    expect(formatMoney(255.68, "BHD")).toBe("BD 255.680");
    expect(formatMoney(-1.5, "EUR")).toBe("-€1.50");
  });
});
