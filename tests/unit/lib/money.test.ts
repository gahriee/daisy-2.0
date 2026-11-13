import { describe, expect, it } from "vitest";
import {
  addMoney,
  compareMoney,
  formatMoneyDecimal,
  formatPhpCurrency,
  parseMoneyDecimal,
  prorateMoneyHalfUp,
  subtractMoney,
} from "../../../src/lib/money";

describe("money helpers", () => {
  it("parses and formats exact centavos without floating-point drift", () => {
    expect(parseMoneyDecimal("0")).toBe(BigInt(0));
    expect(parseMoneyDecimal("-0.00")).toBe(BigInt(0));
    expect(parseMoneyDecimal("1250.5")).toBe(BigInt(125050));
    expect(parseMoneyDecimal("999999999.99")).toBe(BigInt("99999999999"));
    expect(formatMoneyDecimal(BigInt(125050))).toBe("1250.50");
    expect(formatMoneyDecimal(BigInt(-500))).toBe("-5.00");
    expect(formatPhpCurrency(BigInt(123456789))).toBe("₱1,234,567.89");
    expect(formatPhpCurrency("-50.5")).toBe("-₱50.50");
  });

  it("rejects malformed or over-precise monetary strings", () => {
    expect(() => parseMoneyDecimal("")).toThrow(RangeError);
    expect(() => parseMoneyDecimal("12.345")).toThrow(RangeError);
    expect(() => parseMoneyDecimal("1e5")).toThrow(RangeError);
    expect(() => parseMoneyDecimal("₱100.00")).toThrow(RangeError);
  });

  it("performs exact arithmetic and HALF_UP proration", () => {
    expect(addMoney(BigInt(1050), BigInt(250))).toBe(BigInt(1300));
    expect(subtractMoney(BigInt(1050), BigInt(250))).toBe(BigInt(800));
    expect(compareMoney(BigInt(100), BigInt(200))).toBe(-1);
    expect(compareMoney(BigInt(200), BigInt(200))).toBe(0);
    expect(compareMoney(BigInt(300), BigInt(200))).toBe(1);

    // 100.01 * (1 / 2) = 50.005 -> rounds HALF_UP to 50.01 (5001)
    expect(prorateMoneyHalfUp(BigInt(10001), BigInt(1), BigInt(2))).toBe(
      BigInt(5001),
    );
    // 100.00 * (1 / 3) = 33.333... -> 3333
    expect(prorateMoneyHalfUp(BigInt(10000), BigInt(1), BigInt(3))).toBe(
      BigInt(3333),
    );
    expect(prorateMoneyHalfUp(BigInt(10000), BigInt(0), BigInt(30))).toBe(
      BigInt(0),
    );
    expect(() =>
      prorateMoneyHalfUp(BigInt(10000), BigInt(1), BigInt(0)),
    ).toThrow(RangeError);
    expect(() =>
      prorateMoneyHalfUp(BigInt(10000), BigInt(-1), BigInt(30)),
    ).toThrow(RangeError);
  });
});
