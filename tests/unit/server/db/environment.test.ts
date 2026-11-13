import { describe, expect, it } from "vitest";
import { readDatabaseUrl } from "../../../../src/server/db/environment";

describe("database configuration", () => {
  it("accepts PostgreSQL URLs", () => {
    const DATABASE_URL = "postgresql://local:example@localhost:5432/daisy_dev";
    expect(readDatabaseUrl({ DATABASE_URL })).toBe(DATABASE_URL);
  });
  it.each([undefined, "", "https://localhost/db", "postgresql://localhost/"])(
    "rejects missing or invalid connection configuration (%s)",
    (DATABASE_URL) => {
      expect(() => readDatabaseUrl({ DATABASE_URL })).toThrow(
        "Configure a valid PostgreSQL DATABASE_URL",
      );
    },
  );
  it("keeps credentials out of errors", () => {
    expect(() =>
      readDatabaseUrl({ DATABASE_URL: "https://private:secret@localhost/db" }),
    ).toThrow("Configure a valid PostgreSQL DATABASE_URL in .env.local.");
  });
});
