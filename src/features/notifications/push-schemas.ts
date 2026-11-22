import { z } from "zod";

export const PushSubscribeSchema = z.object({
  endpoint: z
    .string()
    .trim()
    .url("Invalid push endpoint URL.")
    .max(2048, "Push endpoint URL is too long.")
    .refine(
      (url) => url.startsWith("https://"),
      "Push endpoint must use HTTPS.",
    ),
  keys: z.object({
    p256dh: z
      .string()
      .trim()
      .min(16, "Invalid push encryption key.")
      .max(256, "Push encryption key is too long."),
    auth: z
      .string()
      .trim()
      .min(8, "Invalid push auth secret.")
      .max(128, "Push auth secret is too long."),
  }),
  deviceLabel: z
    .string()
    .trim()
    .max(120, "Keep device label under 120 characters.")
    .optional(),
});

export type PushSubscribeInput = z.infer<typeof PushSubscribeSchema>;

export const PushUnsubscribeSchema = z.object({
  endpoint: z.string().trim().url("Invalid push endpoint URL.").max(2048),
});

export type PushUnsubscribeInput = z.infer<typeof PushUnsubscribeSchema>;

export type PushStatusResponse = {
  configured: boolean;
  publicKey: string | null;
  subscriptionCount: number;
  subscribedEndpoints: string[];
};
