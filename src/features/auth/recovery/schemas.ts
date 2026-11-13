import { z } from "zod";

const email = z.string().trim().toLowerCase().pipe(z.email().max(254));
export const requestCodeSchema = z.object({ email });
export const resetPasswordSchema = z.object({
  email,
  otp: z.string().regex(/^\d{6,10}$/),
  password: z.string().min(12).max(128),
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
