import { expect, it } from "vitest";
import {
  requestCodeSchema,
  resetPasswordSchema,
} from "../../../../../src/features/auth/recovery/schemas";
import { projectRecoveryNotification } from "../../../../../src/features/auth/recovery/notifications";

it("normalizes email without exposing additional request properties", () => {
  expect(
    requestCodeSchema.parse({
      email: " Owner@Example.test ",
      ownerId: "foreign",
    }),
  ).toEqual({ email: "owner@example.test" });
});
it.each(["123", "abcdef", "12345678901"])(
  "rejects an invalid recovery code",
  (otp) => {
    expect(
      resetPasswordSchema.safeParse({
        email: "owner@example.test",
        otp,
        password: "a-long-test-passphrase",
      }).success,
    ).toBe(false);
  },
);
it.each(["short", "x".repeat(129)])(
  "rejects out-of-policy passwords",
  (password) => {
    expect(
      resetPasswordSchema.safeParse({
        email: "owner@example.test",
        otp: "123456",
        password,
      }).success,
    ).toBe(false);
  },
);
it("keeps routine events audit-only and scopes completed-reset notifications", () => {
  const event = {
    id: "event",
    ownerUserId: "owner",
    action: "RESET_REQUESTED",
  };
  expect(projectRecoveryNotification(event, "owner")).toBeNull();
  expect(
    projectRecoveryNotification(
      { ...event, action: "RESET_COMPLETED" },
      "foreign",
    ),
  ).toBeNull();
  expect(
    projectRecoveryNotification(
      { ...event, action: "RESET_COMPLETED" },
      "owner",
    )?.href,
  ).toBe("/auth/reset-password");
});
