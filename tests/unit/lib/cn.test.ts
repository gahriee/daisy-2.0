import { expect, it } from "vitest";
import { cn } from "../../../src/lib/cn";

it("lets consumer utilities override shared control recipes", () => {
  expect(cn("px-4 bg-primary", false, ["px-6"], { "bg-surface": true })).toBe(
    "px-6 bg-surface",
  );
});
