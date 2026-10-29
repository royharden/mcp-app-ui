// DOMAIN-01: fixture/filter/sort/page/facets match independent answers; text and structured agree.
import { describe, expect, it } from "vitest";
import { seedRequests } from "../../server/domain/dataset.ts";
import { normalizeQuery, runQuery } from "../../server/domain/query.ts";
import { QueryInputSchema, QueueOutputSchema } from "../../server/domain/schemas.ts";
import { renderQueueText } from "../../server/domain/textRender.ts";

const ids = (out: ReturnType<typeof runQuery>) => out.rows.map((r) => r.id);

describe("DOMAIN-01 fixed dataset and read semantics", () => {
  const seed = seedRequests();

  it("has the twelve seeded rows with the planned states", () => {
    expect(seed.map((r) => r.id)).toEqual([
      "REQ-101", "REQ-102", "REQ-103", "REQ-104", "REQ-105", "REQ-106",
      "REQ-107", "REQ-108", "REQ-109", "REQ-110", "REQ-111", "REQ-112",
    ]);
    expect(seed.find((r) => r.id === "REQ-104")).toMatchObject({
      title: "Renew sandbox editor",
      version: 3,
      amountCents: 124000,
    });
    expect(seed.filter((r) => r.status === "pending")).toHaveLength(9);
  });

  it("defaults to pending, oldest first, offset 0, ten per page", () => {
    const out = runQuery(seed, normalizeQuery());
    expect(out.query).toMatchObject({ status: "pending", sort: "submittedAsc", offset: 0, pageSize: 10 });
    expect(out.total).toBe(9);
    expect(ids(out)).toEqual([
      "REQ-101", "REQ-102", "REQ-104", "REQ-105", "REQ-107", "REQ-108", "REQ-109", "REQ-111", "REQ-112",
    ]);
    expect(out.nextOffset).toBeNull();
    expect(out.facets.category).toEqual({ equipment: 3, software: 3, travel: 3 });
  });

  it("riskDesc orders high, medium, low, then amount descending, then id", () => {
    const out = runQuery(seed, normalizeQuery({ sort: "riskDesc" }));
    expect(ids(out).slice(0, 5)).toEqual(["REQ-105", "REQ-102", "REQ-108", "REQ-111", "REQ-104"]);
    expect(out.rows[0].amountText).toBe("USD 2400.00");
  });

  it("filters by requester and by category and computes facets before paging", () => {
    expect(ids(runQuery(seed, normalizeQuery({ requesterId: "R02" })))).toEqual(["REQ-102", "REQ-104", "REQ-108"]);
    const software = runQuery(seed, normalizeQuery({ category: "software", sort: "amountDesc", pageSize: 1 }));
    expect(software.total).toBe(3);
    expect(ids(software)).toEqual(["REQ-111"]);
    expect(software.nextOffset).toBe(1);
    expect(software.facets.risk).toEqual({ low: 1, medium: 0, high: 2 });
  });

  it("pages deterministically and reports the next offset", () => {
    const first = runQuery(seed, normalizeQuery({ status: "all", sort: "idAsc", pageSize: 5 }));
    const second = runQuery(seed, normalizeQuery({ status: "all", sort: "idAsc", pageSize: 5, offset: 5 }));
    const third = runQuery(seed, normalizeQuery({ status: "all", sort: "idAsc", pageSize: 5, offset: 10 }));
    expect([...ids(first), ...ids(second), ...ids(third)]).toHaveLength(12);
    expect(first.nextOffset).toBe(5);
    expect(third.nextOffset).toBeNull();
  });

  it("rejects unknown properties and out-of-range values", () => {
    expect(QueryInputSchema.safeParse({ sql: "select 1" }).success).toBe(false);
    expect(QueryInputSchema.safeParse({ pageSize: 26 }).success).toBe(false);
    expect(QueryInputSchema.safeParse({ offset: 1001 }).success).toBe(false);
    expect(QueryInputSchema.safeParse({ category: "food" }).success).toBe(false);
    expect(QueryInputSchema.safeParse({ datasetVersion: "approvals-v2" }).success).toBe(false);
  });

  it("text and structured results carry the same ids, totals and facets", () => {
    const out = runQuery(seed, normalizeQuery({ category: "equipment" }));
    expect(QueueOutputSchema.safeParse(out).success).toBe(true);
    const text = renderQueueText(out);
    for (const id of ids(out)) expect(text).toContain(id);
    expect(text).toContain(`Matching requests: ${out.total}.`);
    expect(text).toContain("category equipment=3 software=0 travel=0");
  });
});
