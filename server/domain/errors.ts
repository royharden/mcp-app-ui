// Stable domain error codes. Protocol-level failures (malformed envelopes, unknown methods)
// are the SDK's job; these cover tool-level outcomes the caller can act on.
export const ERROR_CODES = [
  "invalid_input",
  "not_found",
  "not_pending",
  "nonce_unknown",
  "nonce_used",
  "nonce_expired",
  "statement_mismatch",
  "decision_mismatch",
  "version_conflict",
  "nonce_capacity",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

const DEFAULT_MESSAGES: Record<ErrorCode, string> = {
  invalid_input: "The input is not valid for this tool.",
  not_found: "No request has that id in this dataset.",
  not_pending: "The request is no longer pending, so no decision can be recorded.",
  nonce_unknown: "The confirmation nonce is not known to this session. Prepare the decision again.",
  nonce_used: "The confirmation nonce was already used. Each preparation records at most one decision.",
  nonce_expired: "The confirmation nonce has expired. Prepare the decision again.",
  statement_mismatch: "The statement does not match the prepared statement for the current request.",
  decision_mismatch: "The id or decision does not match what was prepared with this nonce.",
  version_conflict: "The request changed after this decision was prepared. Refresh and prepare again.",
  nonce_capacity: "Too many open preparations in this session. Wait for expiry or reset the session.",
};

export class DomainError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message?: string) {
    super(message ?? DEFAULT_MESSAGES[code]);
    this.code = code;
    this.name = "DomainError";
  }
}

export function isDomainError(value: unknown): value is DomainError {
  return value instanceof DomainError;
}

export function defaultMessage(code: ErrorCode): string {
  return DEFAULT_MESSAGES[code];
}
