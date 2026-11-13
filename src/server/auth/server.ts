import "server-only";
import { createNeonAuth } from "@neon/auth/next/server";
import { z } from "zod";

let instance: ReturnType<typeof createNeonAuth> | undefined;

export function getAuth(): ReturnType<typeof createNeonAuth> {
  if (instance) return instance;
  const result = z
    .object({
      NEON_AUTH_BASE_URL: z.url().startsWith("https://"),
      NEON_AUTH_COOKIE_SECRET: z.string().min(32),
    })
    .safeParse(process.env);
  if (!result.success)
    throw new Error("Configure Neon Auth URL and cookie secret.");
  instance = createNeonAuth({
    baseUrl: result.data.NEON_AUTH_BASE_URL,
    cookies: {
      secret: result.data.NEON_AUTH_COOKIE_SECRET,
      sameSite: "strict",
    },
    logLevel: "silent",
  });
  return instance;
}
