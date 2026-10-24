// Controller-level checks of the view session store with a scripted fake App.
// These supplement, and never substitute for, the exact-bundle harness layer (tests/harness).
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it, vi } from "vitest";
import { normalizeQuery, runQuery } from "../../server/domain/query.ts";
import { seedRequests } from "../../server/domain/dataset.ts";
import { createViewSession, type ViewApp } from "../../view/sessionStore.ts";

type Call = { name: string; arguments?: Record<string, unknown>; resolve: (r: CallToolResult) => void; reject: (e: unknown) => void };

function fakeApp(options: { hostCaps?: Record<string, unknown>; connect?: () => Promise<void> } = {}) {
  const calls: Call[] = [];
  const app: ViewApp & { calls: Call[]; closed: boolean } = {
    calls,
    closed: false,
    connect: options.connect ?? (() => Promise.resolve()),
    close: async () => {
      app.closed = true;
    },
    callServerTool: (params) =>
      new Promise<CallToolResult>((resolve, reject) => calls.push({ ...params, resolve, reject })),
    sendMessage: vi.fn(async () => ({})),
    getHostCapabilities: () => options.hostCaps ?? {},
    getHostContext: () => ({ theme: "light" }),
    ontoolinput: undefined,
    ontoolresult: undefined,
    ontoolcancelled: undefined,
    onhostcontextchanged: undefined,
    onteardown: undefined,
  };
  return app;
}

function queueResult(query = {}) {
  const out = runQuery(seedRequests(), normalizeQuery(query));
  return { content: [{ type: "text" as const, text: "queue" }], structuredContent: out } as CallToolResult;
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("view session store", () => {
  it("INIT-02: a launch result delivered right after connect is retained for the first subscriber", async () => {
    const app = fakeApp();
    const session = createViewSession({ createApp: () => app, createTransport: () => ({}) });
    await session.connect();
    app.ontoolresult?.(queueResult());
    // No subscriber existed when the result arrived.
    expect(session.listenerCount()).toBe(0);
    expect(session.getSnapshot().queue?.total).toBe(9);
    expect(session.getSnapshot().queueSource).toBe("launch");
  });

  it("INIT-01: initialization timeout is visible and Retry makes one new attempt", async () => {
    vi.useFakeTimers();
    try {
      let attempts = 0;
      const session = createViewSession(
        {
          createApp: () => fakeApp({ connect: () => (++attempts === 1 ? new Promise<void>(() => {}) : Promise.resolve()) }),
          createTransport: () => ({}),
        },
        { initTimeoutMs: 5000 },
      );
      const first = session.connect();
      await vi.advanceTimersByTimeAsync(5000);
      await first;
      expect(session.getSnapshot().phase).toBe("error");
      expect(attempts).toBe(1);
      await session.retry();
      expect(session.getSnapshot().phase).toBe("ready");
      expect(attempts).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("ORDER-01: a late result for query A cannot overwrite newer query B, nor can a late launch", async () => {
    const app = fakeApp();
    const session = createViewSession({ createApp: () => app, createTransport: () => ({}) });
    await session.connect();
    void session.query({ category: "travel" });
    void session.query({ category: "software" });
    const [a, b] = app.calls;
    b.resolve(queueResult({ category: "software" }));
    await flush();
    a.resolve(queueResult({ category: "travel" }));
    await flush();
    app.ontoolresult?.(queueResult());
    expect(session.getSnapshot().query.category).toBe("software");
    expect(session.getSnapshot().ignoredLateResults).toBe(2);
  });

  it("ORDER-01: an old detail cannot populate a newer selection", async () => {
    const app = fakeApp();
    const session = createViewSession({ createApp: () => app, createTransport: () => ({}) });
    await session.connect();
    session.select("REQ-101");
    session.select("REQ-102");
    const [first] = app.calls;
    first.resolve({ content: [], structuredContent: { kind: "approval-detail" } } as CallToolResult);
    await flush();
    expect(session.getSnapshot().selection.id).toBe("REQ-102");
    expect(session.getSnapshot().selection.detail).toBeNull();
  });

  it("refuses view-to-host calls before ready and after teardown", async () => {
    const app = fakeApp();
    const session = createViewSession({ createApp: () => app, createTransport: () => ({}) });
    await session.query({});
    expect(app.calls).toHaveLength(0);
    await session.connect();
    await session.teardown();
    await session.query({});
    expect(app.calls).toHaveLength(0);
    expect(app.closed).toBe(true);
  });

  it("CTX-01: host context changes keep query and selection; missing message capability disables messaging", async () => {
    const app = fakeApp({ hostCaps: {} });
    const session = createViewSession({ createApp: () => app, createTransport: () => ({}) });
    await session.connect();
    app.ontoolresult?.(queueResult({ requesterId: "R02" }));
    app.onhostcontextchanged?.({ theme: "dark", locale: "fr-FR" });
    const s = session.getSnapshot();
    expect(s.theme).toBe("dark");
    expect(s.locale).toBe("fr-FR");
    expect(s.query.requesterId).toBe("R02");
    expect(s.canMessage).toBe(false);
  });

  describe("decision flow (P2 review fixes)", () => {
    const detail = () => {
      const request = seedRequests().find((r) => r.id === "REQ-104")!;
      return {
        content: [{ type: "text", text: "detail" }],
        structuredContent: {
          kind: "approval-detail",
          schemaVersion: 1,
          datasetVersion: "approvals-v1",
          request: {
            id: request.id,
            title: request.title,
            titleTruncated: false,
            requesterId: request.requesterId,
            category: request.category,
            risk: request.risk,
            amountCents: request.amountCents,
            amountText: "USD 1240.00",
            currency: "USD",
            submittedAt: request.submittedAt,
            status: "pending",
            version: 3,
            description: request.description,
            descriptionTruncated: false,
            decisionHistory: [],
          },
        },
      } as CallToolResult;
    };
    const prepared = (reason: string) =>
      ({
        content: [{ type: "text", text: "prepared" }],
        structuredContent: {
          kind: "decision-prepared",
          schemaVersion: 1,
          id: "REQ-104",
          decision: "approve",
          requestVersion: 3,
          reason,
          statement: `Approve REQ-104 | title="Renew sandbox editor" | USD 1240.00 | version=3 | reason=${JSON.stringify(reason)}`,
          nonce: "n1",
          expiresAt: "2026-10-20T12:05:00.000Z",
        },
      }) as CallToolResult;
    const recorded = {
      content: [{ type: "text", text: "recorded" }],
      structuredContent: {
        kind: "decision-recorded",
        schemaVersion: 1,
        id: "REQ-104",
        decision: "approve",
        status: "approved",
        version: 4,
        record: { decision: "approve", reason: "ok", decidedAt: "2026-10-20T12:00:00Z", fromVersion: 3, toVersion: 4 },
      },
    } as CallToolResult;

    async function preparedSession(hostCaps: Record<string, unknown> = { message: {} }) {
      const app = fakeApp({ hostCaps });
      const session = createViewSession({ createApp: () => app, createTransport: () => ({}) });
      await session.connect();
      session.select("REQ-104");
      app.calls.at(-1)!.resolve(detail());
      await flush();
      session.setDecision("approve");
      session.setReason("ok");
      void session.prepare();
      app.calls.at(-1)!.resolve(prepared("ok"));
      await flush();
      return { app, session };
    }

    it("a recorded outcome and Tell the assistant survive the post-decision queue refresh", async () => {
      const { app, session } = await preparedSession();
      void session.confirm();
      app.calls.at(-1)!.resolve(recorded);
      await flush();
      // Pending refresh no longer lists REQ-104; the drawer and outcome stay.
      for (const call of app.calls.filter((c) => c.name === "list_approvals")) call.resolve(queueResult());
      for (const call of app.calls.filter((c) => c.name === "get_approval").slice(1)) call.resolve(detail());
      await flush();
      const s = session.getSnapshot();
      expect(s.selection.id).toBe("REQ-104");
      expect(s.submit).toMatchObject({ status: "recorded", forId: "REQ-104" });
      await session.tellAssistant();
      expect(app.sendMessage).toHaveBeenCalledTimes(1);
      expect(app.sendMessage).toHaveBeenCalledWith({
        role: "user",
        content: [{ type: "text", text: "Decision recorded: REQ-104 approve" }],
      });
      await session.tellAssistant();
      expect(app.sendMessage).toHaveBeenCalledTimes(1);
    });

    it("SEC-02: without the message capability nothing is sent", async () => {
      const { app, session } = await preparedSession({});
      void session.confirm();
      app.calls.at(-1)!.resolve(recorded);
      await flush();
      await session.tellAssistant();
      expect(app.sendMessage).not.toHaveBeenCalled();
    });

    it("DEC-04: editing the reason discards the preparation, and a late prepare result is dropped", async () => {
      const { app, session } = await preparedSession();
      expect(session.getSnapshot().preparation.status).toBe("ready");
      session.setReason("ok, edited");
      expect(session.getSnapshot().preparation).toMatchObject({ status: "idle", prepared: null });
      void session.prepare();
      const pending = app.calls.at(-1)!;
      session.setReason("edited again");
      pending.resolve(prepared("ok, edited"));
      await flush();
      expect(session.getSnapshot().preparation.status).toBe("idle");
    });

    it("DEC-04: an uncertain submit shows unknown, refreshes detail once and never retries", async () => {
      const { app, session } = await preparedSession();
      void session.confirm();
      app.calls.at(-1)!.reject(new Error("Request timed out"));
      await flush();
      const s = session.getSnapshot();
      expect(s.submit.status).toBe("unknown");
      const names = app.calls.map((c) => c.name);
      expect(names.filter((n) => n === "submit_decision")).toHaveLength(1);
      expect(names.filter((n) => n === "prepare_decision")).toHaveLength(1);
      expect(names.at(-1)).toBe("get_approval");
    });

    it("CANCEL-01: after host teardown, final teardown still closes the App and detaches listeners", async () => {
      vi.useFakeTimers();
      try {
        const app = fakeApp();
        const session = createViewSession({ createApp: () => app, createTransport: () => ({}) });
        await session.connect();
        session.subscribe(() => {});
        await app.onteardown?.();
        await vi.runAllTimersAsync();
        expect(app.closed).toBe(true);
        expect(session.listenerCount()).toBe(0);
        expect(session.getSnapshot().phase).toBe("closed");
      } finally {
        vi.useRealTimers();
      }
    });
  });

  it("LIFE-01: subscribers can come and go without touching the connection", async () => {
    let created = 0;
    const session = createViewSession({
      createApp: () => {
        created += 1;
        return fakeApp();
      },
      createTransport: () => ({}),
    });
    await session.connect();
    const off1 = session.subscribe(() => {});
    off1();
    const off2 = session.subscribe(() => {});
    expect(session.listenerCount()).toBe(1);
    off2();
    await session.connect();
    expect(created).toBe(1);
  });
});
