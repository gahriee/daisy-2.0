export type AppErrorCode =
  | "validation_error"
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "allocation_conflict"
  | "precondition_failed"
  | "rate_limited"
  | "service_unavailable";

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly status: number;
  readonly retryAfterSeconds: number | undefined;

  constructor(
    code: AppErrorCode,
    status: number,
    message: string,
    retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export class ValidationError extends AppError {
  constructor(message = "Check the submitted values and try again.") {
    super("validation_error", 400, message);
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message = "Sign in as the Owner to continue.") {
    super("unauthenticated", 401, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have access to perform this action.") {
    super("forbidden", 403, message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "The requested record was not found.") {
    super("not_found", 404, message);
  }
}

export class ConflictError extends AppError {
  constructor(
    message = "This record changed since you loaded it. Reload and review before saving.",
  ) {
    super("conflict", 409, message);
  }
}

export class AllocationConflictError extends AppError {
  constructor(
    message = "The selected bed or room is already allocated for part of that interval.",
  ) {
    super("allocation_conflict", 409, message);
  }
}

export class PreconditionError extends AppError {
  constructor(message = "Complete the required setup before continuing.") {
    super("precondition_failed", 422, message);
  }
}

export class RateLimitedError extends AppError {
  constructor(
    retryAfterSeconds: number,
    message = "Too many attempts. Try again shortly.",
  ) {
    super("rate_limited", 429, message, retryAfterSeconds);
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message = "Service temporarily unavailable.") {
    super("service_unavailable", 503, message);
  }
}
