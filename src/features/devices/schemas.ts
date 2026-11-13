import { z } from "zod";

export const RegisterDeviceSchema = z.object({
  label: z
    .string()
    .trim()
    .min(1, "Enter a device name.")
    .max(60, "Keep the device name under 60 characters."),
});

export const DeviceIdSchema = z.uuid("Invalid device identifier.");
