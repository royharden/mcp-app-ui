// Deterministic read semantics: filter, facets over the filtered subset, sort, page.
import {
  DATASET_VERSION,
  DEFAULT_PAGE_SIZE,
  type ApprovalRequest,
  type NormalizedQuery,
  type QueryInput,
  type QueueOutput,
  SCHEMA_VERSION,
} from "./schemas.ts";
import { toRow } from "./textRender.ts";

const RISK_RANK = { high: 0, medium: 1, low: 2 } as const;

export function normalizeQuery(input: QueryInput = {}): NormalizedQuery {
  return {
    status: input.status ?? "pending",
    category: input.category ?? null,
    risk: input.risk ?? null,
    requesterId: input.requesterId ?? null,
    sort: input.sort ?? "submittedAsc",
    offset: input.offset ?? 0,
    pageSize: input.pageSize ?? DEFAULT_PAGE_SIZE,
    datasetVersion: DATASET_VERSION,
  };
}

/** Stable signature used by the view to discard late results for an older query. */
export function querySignature(query: NormalizedQuery): string {
  return [query.status, query.category, query.risk, query.requesterId, query.sort, query.offset, query.pageSize].join("|");
}

function byId(a: ApprovalRequest, b: ApprovalRequest): number {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function compareRequests(sort: NormalizedQuery["sort"]) {
  return (a: ApprovalRequest, b: ApprovalRequest): number => {
    switch (sort) {
      case "submittedAsc": {
        const d = Date.parse(a.submittedAt) - Date.parse(b.submittedAt);
        return d !== 0 ? d : byId(a, b);
      }
      case "riskDesc": {
        const r = RISK_RANK[a.risk] - RISK_RANK[b.risk];
        if (r !== 0) return r;
        const m = b.amountCents - a.amountCents;
        return m !== 0 ? m : byId(a, b);
      }
      case "amountDesc": {
        const m = b.amountCents - a.amountCents;
        return m !== 0 ? m : byId(a, b);
      }
      case "idAsc":
        return byId(a, b);
    }
  };
}

export function matches(request: ApprovalRequest, query: NormalizedQuery): boolean {
  if (query.status !== "all" && request.status !== query.status) return false;
  if (query.category !== null && request.category !== query.category) return false;
  if (query.risk !== null && request.risk !== query.risk) return false;
  if (query.requesterId !== null && request.requesterId !== query.requesterId) return false;
  return true;
}

export function runQuery(requests: readonly ApprovalRequest[], query: NormalizedQuery): QueueOutput {
  const filtered = requests.filter((r) => matches(r, query));
  const facets = {
    category: { equipment: 0, software: 0, travel: 0 },
    risk: { low: 0, medium: 0, high: 0 },
  };
  for (const r of filtered) {
    facets.category[r.category] += 1;
    facets.risk[r.risk] += 1;
  }
  const sorted = [...filtered].sort(compareRequests(query.sort));
  const page = sorted.slice(query.offset, query.offset + query.pageSize);
  const end = query.offset + page.length;
  return {
    kind: "approval-queue",
    schemaVersion: SCHEMA_VERSION,
    datasetVersion: DATASET_VERSION,
    query: {
      status: query.status,
      category: query.category,
      risk: query.risk,
      requesterId: query.requesterId,
      sort: query.sort,
      offset: query.offset,
      pageSize: query.pageSize,
      datasetVersion: query.datasetVersion,
    },
    total: filtered.length,
    nextOffset: end < filtered.length ? end : null,
    rows: page.map(toRow),
    facets,
  };
}
