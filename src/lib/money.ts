const MONEY_PATTERN = /^(-)?(\d+)(?:\.(\d{1,2}))?$/;
const ZERO = BigInt(0);
const ONE = BigInt(1);
const TWO = BigInt(2);
const HUNDRED = BigInt(100);

/**
 * Validates and normalizes a non-negative monetary decimal string (up to 2 decimal places)
 * into a canonical 2-decimal string (e.g. "4500" -> "4500.00").
 */
export function normalizeNonNegativeMoneyDecimal(value: string): string {
  const trimmed = value.trim();
  const match = MONEY_PATTERN.exec(trimmed);
  if (!match || match[1] === "-") {
    throw new RangeError(
      "Enter a non-negative peso amount (up to 2 decimals).",
    );
  }
  const centavos = parseMoneyDecimal(trimmed);
  if (centavos < ZERO) {
    throw new RangeError("Amount cannot be negative.");
  }
  return formatMoneyDecimal(centavos);
}

/**
 * Parses a decimal string with up to 2 fractional digits into integer centavos.
 */
export function parseMoneyDecimal(value: string): bigint {
  const trimmed = value.trim();
  const match = MONEY_PATTERN.exec(trimmed);
  if (!match) {
    throw new RangeError("Invalid monetary decimal string.");
  }
  const sign = match[1] === "-" ? -ONE : ONE;
  const whole = BigInt(match[2] ?? "0");
  const fracRaw = (match[3] ?? "").padEnd(2, "0");
  const frac = BigInt(fracRaw);
  const centavos = whole * HUNDRED + frac;
  return centavos === ZERO ? ZERO : sign * centavos;
}

/**
 * Formats integer centavos as an exact two-decimal string for DTOs.
 */
export function formatMoneyDecimal(centavos: bigint): string {
  const negative = centavos < ZERO;
  const abs = negative ? -centavos : centavos;
  const whole = abs / HUNDRED;
  const frac = (abs % HUNDRED).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${whole.toString()}.${frac}`;
}

/**
 * Formats integer centavos or a validated decimal string in Philippine pesos.
 */
export function formatPhpCurrency(value: bigint | string): string {
  const centavos = typeof value === "bigint" ? value : parseMoneyDecimal(value);
  const negative = centavos < ZERO;
  const abs = negative ? -centavos : centavos;
  const whole = abs / HUNDRED;
  const frac = (abs % HUNDRED).toString().padStart(2, "0");
  const groupedWhole = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}₱${groupedWhole}.${frac}`;
}

export function addMoney(a: bigint, b: bigint): bigint {
  return a + b;
}

export function subtractMoney(a: bigint, b: bigint): bigint {
  return a - b;
}

export function compareMoney(a: bigint, b: bigint): -1 | 0 | 1 {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/**
 * Scales centavos by `numerator / denominator` using explicit HALF_UP rounding.
 */
export function prorateMoneyHalfUp(
  centavos: bigint,
  numerator: bigint,
  denominator: bigint,
): bigint {
  if (denominator <= ZERO) {
    throw new RangeError("Proration denominator must be positive.");
  }
  if (numerator < ZERO) {
    throw new RangeError("Proration numerator must be non-negative.");
  }
  const negative = centavos < ZERO;
  const abs = negative ? -centavos : centavos;
  const doubled = abs * numerator * TWO + denominator;
  const rounded = doubled / (denominator * TWO);
  if (rounded === ZERO) return ZERO;
  return negative ? -rounded : rounded;
}
