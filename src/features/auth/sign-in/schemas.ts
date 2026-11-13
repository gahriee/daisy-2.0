import { z } from "zod";

const email = z.string().trim().toLowerCase().pipe(z.email().max(254));

export const signInSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password.").max(256),
});

export type SignInInput = z.infer<typeof signInSchema>;
export type AuthSessionState =
  "authenticated" | "unauthenticated" | "unavailable";
