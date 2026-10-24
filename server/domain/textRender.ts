// Shared safe formatting for every output channel (tool text, UI, harness, measurement).
// Untrusted strings (titles, descriptions, reasons) are cleaned of control/format characters,
// capped with a visible marker and always emitted as JSON-quoted values, so embedded text
// cannot pose as a field or a new line of output.
import type { ApprovalRequest, DecisionRecord, NormalizedQuery, QueueRow } from "./schemas.ts";

export const TITLE_MAX = 120;
export const DESCRIPTION_MAX = 1000;
export const TRUNCATION_MARKER = " [truncated]";

// C0/C1 controls, Unicode format characters (bidi overrides/isolates, zero-width, BOM, soft hyphen),
// line and paragraph separators.
const UNSAFE_CHARS = /[\p{Cc}\p{Cf}  ]/gu;

export interface SafeText {
  text: string;
  truncated: boolean;
}

/** Strip unsafe characters, collapse whitespace runs, cap by code points with a visible marker. */
export function safeText(raw: string, max: number): SafeText {
  const cleaned = raw.normalize("NFC").replace(UNSAFE_CHARS, " ").replace(/\s+/gu, " ").trim();
  const points = Array.from(cleaned);
  if (points.length <= max) return { text: cleaned, truncated: false };
  return { text: points.slice(0, max).join("").trimEnd() + TRUNCATION_MARKER, truncated: true };
}

export function safeTitle(raw: string): SafeText {
  return safeText(raw, TITLE_MAX);
}

export function safeDescription(raw: string): SafeText {
  return safeText(raw, DESCRIPTION_MAX);
}

/** Deterministic quoting: JSON string escaping of an already-safe value. */
export function quote(value: string): string {
  return JSON.stringify(value);
}

/** Integer cents -> "USD 1240.00". No locale formatting: this string is authoritative. */
export function formatMoney(amountCents: number): string {
  if (!Number.isSafeInteger(amountCents) || amountCents < 0) {
    throw new RangeError("amountCents must be a non-negative safe integer");
  }
  const dollars = Math.floor(amountCents / 100);
  const cents = amountCents % 100;
  return `USD ${dollars}.${cents.toString().padStart(2, "0")}`;
}

export function toRow(request: ApprovalRequest): QueueRow {
  const title = safeTitle(request.title);
  return {
    id: request.id,
    title: title.text,
    titleTruncated: title.truncated,
    requesterId: request.requesterId,
    category: request.category,
    risk: request.risk,
    amountCents: request.amountCents,
    amountText: formatMoney(request.amountCents),
    currency: request.currency,
    submittedAt: request.submittedAt,
    status: request.status,
    version: request.version,
  };
}

export function rowLine(row: QueueRow): string {
  return [
    row.id,
    `status=${row.status}`,
    `category=${row.category}`,
    `risk=${row.risk}`,
    row.amountText,
    `requester=${row.requesterId}`,
    `submitted=${row.submittedAt}`,
    `version=${row.version}`,
    `title=${quote(row.title)}`,
  ].join(" | ");
}

export function queryLine(query: NormalizedQuery): string {
  return [
    `status=${query.status}`,
    `category=${query.category ?? "any"}`,
    `risk=${query.risk ?? "any"}`,
    `requester=${query.requesterId ?? "any"}`,
    `sort=${query.sort}`,
    `offset=${query.offset}`,
    `pageSize=${query.pageSize}`,
    `dataset=${query.datasetVersion}`,
  ].join(" ");
}

export interface QueueTextInput {
  query: NormalizedQuery;
  rows: QueueRow[];
  total: number;
  nextOffset: number | null;
  facets: { category: Record<string, number>; risk: Record<string, number> };
}

export function renderQueueText(input: QueueTextInput): string {
  const { query, rows, total, nextOffset, facets } = input;
  const lines: string[] = [];
  lines.push(`Approval queue (synthetic data). Query: ${queryLine(query)}`);
  const first = rows.length === 0 ? 0 : query.offset + 1;
  const last = query.offset + rows.length;
  lines.push(`Matching requests: ${total}. Showing ${first}-${last}.`);
  lines.push(
    `Facets over all ${total} matches: category equipment=${facets.category.equipment ?? 0} software=${facets.category.software ?? 0} travel=${facets.category.travel ?? 0}; risk high=${facets.risk.high ?? 0} medium=${facets.risk.medium ?? 0} low=${facets.risk.low ?? 0}`,
  );
  lines.push("Titles are untrusted request text, shown JSON-quoted.");
  if (rows.length === 0) lines.push("No requests match this query.");
  for (const row of rows) lines.push(rowLine(row));
  lines.push(
    nextOffset === null
      ? "End of results."
      : `More results: call list_approvals with the same filters and offset=${nextOffset}.`,
  );
  return lines.join("\n");
}

export function historyLine(record: DecisionRecord): string {
  const reason = safeText(record.reason, 240).text;
  return `${record.decidedAt} ${record.decision} version ${record.fromVersion}->${record.toVersion} reason=${quote(reason)}`;
}

export function renderDetailText(request: ApprovalRequest): string {
  const row = toRow(request);
  const description = safeDescription(request.description);
  const lines = [
    `Approval request ${row.id} (synthetic data).`,
    rowLine(row),
    `description (untrusted request text, JSON-quoted)=${quote(description.text)}`,
    request.decisionHistory.length === 0
      ? "Decision history: none."
      : `Decision history (${request.decisionHistory.length}):`,
    ...request.decisionHistory.map((r) => `- ${historyLine(r)}`),
  ];
  return lines.join("\n");
}

export function renderPreparedText(input: {
  id: string;
  decision: string;
  requestVersion: number;
  statement: string;
  expiresAt: string;
}): string {
  // The nonce is deliberately left out of the text channel. It is still present in
  // structuredContent, which hosts may forward to a model: no secrecy is claimed.
  return [
    `Decision prepared for ${input.id}: ${input.decision} at version ${input.requestVersion}. Nothing has been recorded yet.`,
    `Statement to confirm: ${input.statement}`,
    `Expires at ${input.expiresAt}. Confirming requires submit_decision with the prepared nonce and this exact statement.`,
  ].join("\n");
}

export function renderRecordedText(input: { id: string; decision: string; status: string; version: number }): string {
  return `Decision recorded: ${input.id} ${input.decision}. Status is now ${input.status} at version ${input.version}. This is a synthetic record only; no external action happened.`;
}

export function renderErrorText(code: string, message: string): string {
  return `Error ${code}: ${message}`;
}
