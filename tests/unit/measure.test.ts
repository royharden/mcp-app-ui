// The replay's scripted "model turn" parses the same text the server emits, and every text-mode
// plan reaches its independent oracle. Pure functions only: no tool calls, no timing.
import { describe, expect, it } from "vitest";
import tasks from "../../measure/tasks.v1.json" with { type: "json" };
import { extract, rowsOf, satisfies } from "../../measure/replay.ts";
import { seedRequests } from "../../server/domain/dataset.ts";
import { normalizeQuery, runQuery } from "../../server/domain/query.ts";
import type { QueryInput } from "../../server/domain/schemas.ts";
import { renderDetailText, renderQueueText } from "../../server/domain/textRender.ts";

function textFor(tool: string, args: Record<string, unknown>): string {
  const seed = seedRequests();
  if (tool === "list_approvals") return renderQueueText(runQuery(seed, normalizeQuery(args as QueryInput)));
  if (tool === "get_approval") return renderDetailText(seed.find((r) => r.id === args.id)!);
  throw new Error(`unexpected tool ${tool}`);
}

describe("comparison tasks (text mode, pure)", () => {
  it("defines six read tasks and two separately reported policy demonstrations", () => {
    expect(tasks.readTasks.map((t) => t.id)).toEqual(["T1", "T2", "T3", "T4", "T5", "T6"]);
    expect(tasks.policyDemonstrations.map((d) => d.id)).toEqual(["D1", "D2"]);
  });

  it("parses every row line the formatter emits, including the adversarial REQ-109 title", () => {
    const text = textFor("list_approvals", { status: "all", pageSize: 25 });
    expect(rowsOf(text).map((r) => r.id)).toHaveLength(12);
  });

  for (const task of tasks.readTasks) {
    it(`${task.id}: the text plan's extracted answer satisfies the oracle`, () => {
      const texts = task.text.calls.map((c) => textFor(c.tool, c.arguments as Record<string, unknown>));
      const oracle = task.oracle as Record<string, unknown>;
      expect(satisfies(extract(task.text.extract, texts, oracle), oracle)).toBe(true);
    });
  }

  it("a wrong answer fails the predicate", () => {
    expect(satisfies({ id: "REQ-102", risk: "high", amountText: "USD 1800.00" }, tasks.readTasks[0].oracle)).toBe(false);
  });
});
