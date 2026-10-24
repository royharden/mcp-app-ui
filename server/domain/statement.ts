// One canonical confirmation statement, shared by the server and the view.
// Safe title, normalized reason, version and canonical amount fix the exact UTF-8 bytes.
import { DomainError } from "./errors.ts";
import type { ApprovalRequest, Decision } from "./schemas.ts";
import { formatMoney, quote, safeTitle } from "./textRender.ts";

export const REASON_MAX = 240;

// Newlines and other controls, bidi embeddings/overrides/isolates/marks, zero-width characters.
const REJECTED_REASON_CHARS = /[\p{Cc}  ​-‏‪-‮⁠-⁩؜﻿]/u;

/**
 * Normalize once at prepare time: NFC, trim outer whitespace, 1..240 code points.
 * Characters that would be silently altered are rejected instead.
 */
export function normalizeReason(raw: string): string {
  const reason = raw.normalize("NFC").trim();
  if (REJECTED_REASON_CHARS.test(reason)) {
    throw new DomainError(
      "invalid_input",
      "The reason may not contain line breaks, control, bidirectional-format or zero-width characters.",
    );
  }
  const length = Array.from(reason).length;
  if (length < 1) throw new DomainError("invalid_input", "A reason is required.");
  if (length > REASON_MAX) {
    throw new DomainError("invalid_input", `The reason is ${length} characters; the limit is ${REASON_MAX}.`);
  }
  return reason;
}

export function decisionVerb(decision: Decision): "Approve" | "Reject" {
  return decision === "approve" ? "Approve" : "Reject";
}

/**
 * Approve REQ-104 | title="Renew sandbox editor" | USD 1240.00 | version=3 | reason="Sandbox renewal approved"
 * `reason` must already be normalized.
 */
export function buildStatement(
  request: Pick<ApprovalRequest, "id" | "title" | "amountCents" | "version">,
  decision: Decision,
  reason: string,
): string {
  return [
    `${decisionVerb(decision)} ${request.id}`,
    `title=${quote(safeTitle(request.title).text)}`,
    formatMoney(request.amountCents),
    `version=${request.version}`,
    `reason=${quote(reason)}`,
  ].join(" | ");
}

/**
 * The only text the view may send to the conversation: canonical id and decision enum.
 * No title, description, reason or other copied request text.
 */
export function decisionMessage(id: string, decision: Decision): string {
  return `Decision recorded: ${id} ${decision}`;
}
