import { expect, it } from "vitest";
import {
  formatRetryWaitMessage,
  parseRetryAfterSeconds,
} from "../../../../../src/features/auth/sign-in/retry-after";

it("parses positive integer delay-seconds values", () => {
  expect(parseRetryAfterSeconds("1")).toBe(1);
  expect(parseRetryAfterSeconds(" 45 ")).toBe(45);
  expect(parseRetryAfterSeconds("900")).toBe(900);
});

it("rejects zero, negative, non-finite, empty, and malformed values", () => {
  expect(parseRetryAfterSeconds(null)).toBeNull();
  expect(parseRetryAfterSeconds("")).toBeNull();
  expect(parseRetryAfterSeconds("0")).toBeNull();
  expect(parseRetryAfterSeconds("-5")).toBeNull();
  expect(parseRetryAfterSeconds("Infinity")).toBeNull();
  expect(parseRetryAfterSeconds("NaN")).toBeNull();
  expect(parseRetryAfterSeconds("soon")).toBeNull();
});

it("parses future HTTP-dates relative to now and ignores elapsed dates", () => {
  const now = Date.parse("Fri, 13 Nov 2026 08:00:00 GMT");
  expect(parseRetryAfterSeconds("Fri, 13 Nov 2026 08:00:45 GMT", now)).toBe(45);
  expect(
    parseRetryAfterSeconds("Fri, 13 Nov 2026 08:00:00 GMT", now),
  ).toBeNull();
  expect(
    parseRetryAfterSeconds("Fri, 13 Nov 2026 07:59:00 GMT", now),
  ).toBeNull();
});

it("formats retry guidance with seconds under one minute and proper minute plurals", () => {
  expect(formatRetryWaitMessage(null)).toBe(
    "Wait a moment before trying again.",
  );
  expect(formatRetryWaitMessage(0)).toBe("Wait a moment before trying again.");
  expect(formatRetryWaitMessage(1)).toBe("Wait 1 second before trying again.");
  expect(formatRetryWaitMessage(45)).toBe(
    "Wait 45 seconds before trying again.",
  );
  expect(formatRetryWaitMessage(60)).toBe("Wait 1 minute before trying again.");
  expect(formatRetryWaitMessage(121)).toBe(
    "Wait 3 minutes before trying again.",
  );
});
