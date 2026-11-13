import { expect, it } from "vitest";
import { signInSchema } from "../../../../../src/features/auth/sign-in/schemas";

it("normalizes email case and surrounding whitespace while preserving password characters", () => {
  const parsed = signInSchema.parse({
    email: "  Owner@Example.COM ",
    password: "  pass phrase 123 ",
  });
  expect(parsed.email).toBe("owner@example.com");
  expect(parsed.password).toBe("  pass phrase 123 ");
});

it("accepts legacy shorter passwords when non-empty", () => {
  expect(
    signInSchema.safeParse({
      email: "owner@example.com",
      password: "short",
    }).success,
  ).toBe(true);
});

it("rejects invalid or oversized email addresses", () => {
  expect(
    signInSchema.safeParse({
      email: "not-an-email",
      password: "valid-password",
    }).success,
  ).toBe(false);
  expect(
    signInSchema.safeParse({
      email: `${"a".repeat(245)}@example.com`,
      password: "valid-password",
    }).success,
  ).toBe(false);
});

it("rejects empty or oversized passwords", () => {
  expect(
    signInSchema.safeParse({
      email: "owner@example.com",
      password: "",
    }).success,
  ).toBe(false);
  expect(
    signInSchema.safeParse({
      email: "owner@example.com",
      password: "a".repeat(257),
    }).success,
  ).toBe(false);
});
