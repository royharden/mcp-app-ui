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
