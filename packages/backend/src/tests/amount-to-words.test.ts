import { describe, expect, test } from "bun:test";
import { amountToWords } from "../utils/amount-to-words";

describe("amountToWords", () => {
  test("renders zero and whole amounts", () => {
    expect(amountToWords(0)).toBe("Zero Only");
    expect(amountToWords(1234)).toBe("One Thousand Two Hundred Thirty-Four Only");
  });

  test("uses Indian number groups and includes paise as a fractional amount", () => {
    expect(amountToWords(123456.78)).toBe(
      "One Lakh Twenty-Three Thousand Four Hundred Fifty-Six and Seventy-Eight/100 Only",
    );
  });

  test("preserves a negative sign", () => {
    expect(amountToWords(-12.5)).toBe("Minus Twelve and Fifty/100 Only");
  });
});
