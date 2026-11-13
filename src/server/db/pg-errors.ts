import "server-only";
import { Prisma } from "@/generated/prisma/client";

type PgErrorDetails = {
  code: string;
  constraint?: string;
  message?: string;
};

const PG_SQLSTATE_PATTERN = /^[0-9]{2}[0-9A-Z]{3}$/;

function extractConstraintFromMessage(message: unknown): string | undefined {
  if (typeof message !== "string") return undefined;
  return message.match(/constraint "([^"]+)"/i)?.[1];
}

function extractDriverAdapterCause(
  error: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const meta =
    error.meta && typeof error.meta === "object"
      ? (error.meta as Record<string, unknown>)
      : undefined;
  const adapterErr =
    meta?.driverAdapterError && typeof meta.driverAdapterError === "object"
      ? (meta.driverAdapterError as Record<string, unknown>)
      : undefined;
  if (!adapterErr) return undefined;
  if (adapterErr.cause && typeof adapterErr.cause === "object") {
    return adapterErr.cause as Record<string, unknown>;
  }
  return adapterErr;
}

/**
 * Extracts the underlying PostgreSQL SQLSTATE code and constraint name from
 * Prisma / Neon driver adapter errors without exposing raw SQL or credentials.
 */
export function extractPgError(error: unknown): PgErrorDetails | null {
  let current: unknown = error;
  const visited = new Set<unknown>();

  while (current && typeof current === "object" && !visited.has(current)) {
    visited.add(current);
    const obj = current as Record<string, unknown>;

    const driverCause = extractDriverAdapterCause(obj);
    if (driverCause) {
      const rawCode =
        typeof driverCause.originalCode === "string" &&
        PG_SQLSTATE_PATTERN.test(driverCause.originalCode)
          ? driverCause.originalCode
          : typeof driverCause.code === "string" &&
              PG_SQLSTATE_PATTERN.test(driverCause.code)
            ? driverCause.code
            : obj.code === "P2002"
              ? "23505"
              : undefined;

      if (rawCode) {
        const rawMessage =
          typeof driverCause.originalMessage === "string"
            ? driverCause.originalMessage
            : typeof driverCause.message === "string"
              ? driverCause.message
              : typeof obj.message === "string"
                ? obj.message
                : undefined;

        const constraintObj =
          driverCause.constraint && typeof driverCause.constraint === "object"
            ? (driverCause.constraint as Record<string, unknown>)
            : undefined;
        const constraint =
          typeof driverCause.constraint === "string"
            ? driverCause.constraint
            : typeof constraintObj?.index === "string"
              ? constraintObj.index
              : extractConstraintFromMessage(rawMessage);

        return {
          code: rawCode,
          ...(constraint ? { constraint } : {}),
          ...(rawMessage ? { message: rawMessage } : {}),
        };
      }
    }

    if (current instanceof Prisma.PrismaClientKnownRequestError) {
      const target = current.meta?.target;
      const targetConstraint = Array.isArray(target)
        ? target.join("_")
        : typeof target === "string"
          ? target
          : undefined;
      if (current.code === "P2002") {
        const constraint =
          targetConstraint ?? extractConstraintFromMessage(current.message);
        return {
          code: "23505",
          message: current.message,
          ...(constraint ? { constraint } : {}),
        };
      }
    }

    const directCode =
      typeof obj.originalCode === "string" &&
      PG_SQLSTATE_PATTERN.test(obj.originalCode)
        ? obj.originalCode
        : typeof obj.code === "string" && PG_SQLSTATE_PATTERN.test(obj.code)
          ? obj.code
          : undefined;

    if (directCode) {
      const rawMessage =
        typeof obj.originalMessage === "string"
          ? obj.originalMessage
          : typeof obj.message === "string"
            ? obj.message
            : undefined;
      const constraint =
        typeof obj.constraint === "string"
          ? obj.constraint
          : extractConstraintFromMessage(rawMessage);
      return {
        code: directCode,
        ...(constraint ? { constraint } : {}),
        ...(rawMessage ? { message: rawMessage } : {}),
      };
    }

    current = obj.cause;
  }

  return null;
}

export function isPgConstraintError(
  error: unknown,
  code: string,
  constraintName?: string,
): boolean {
  const details = extractPgError(error);
  if (!details || details.code !== code) return false;
  if (!constraintName) return true;
  if (details.constraint === constraintName) return true;
  if (details.message?.includes(constraintName)) return true;
  const message = error instanceof Error ? error.message : "";
  return message.includes(constraintName);
}
