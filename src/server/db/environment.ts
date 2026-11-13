import { z } from "zod";

const connectionUrl = z
  .string()
  .url()
  .refine((value) => {
    if (!URL.canParse(value)) return false;
    const url = new URL(value);
    return (
      ["postgres:", "postgresql:"].includes(url.protocol) &&
      url.pathname.length > 1
    );
  });

export function readDatabaseUrl(
  environment: Record<string, string | undefined>,
): string {
  const result = connectionUrl.safeParse(environment.DATABASE_URL);
  if (!result.success) {
    // Never include validation input or credentials in errors.
    throw new Error("Configure a valid PostgreSQL DATABASE_URL in .env.local.");
  }
  return result.data;
}
