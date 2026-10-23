export const ErrorCodes = {
  missingActor: "missing_actor",
  unknownApproval: "unknown_approval",
  notPending: "not_pending",
  notOwner: "not_owner",
  challengeMismatch: "challenge_mismatch",
  challengeExpired: "challenge_expired",
  challengeUsed: "challenge_used",
  statementMismatch: "statement_mismatch",
  actorMismatch: "actor_mismatch",
  appToolForbidden: "app_tool_forbidden",
  badSource: "bad_source",
  notInitialized: "not_initialized",
  missingConfig: "missing_config",
  unauthenticated: "unauthenticated",
  invalidInput: "invalid_input",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
