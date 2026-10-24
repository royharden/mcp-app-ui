// Eager per-document session store for the view.
//
// Created before connect and before React renders. Every host notification handler is
// registered synchronously on a fresh App before connect(), and results are retained in the
// snapshot, so a tool-result that arrives after `initialized` but before React's first commit
// is still rendered. React only subscribes; it never owns the connection, so StrictMode's
// mount/unmount/mount cannot create a second connection. Final teardown is separate.
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  DetailOutputSchema,
  ErrorOutputSchema,
  PrepareOutputSchema,
  QueryInputSchema,
  QueueOutputSchema,
  SubmitOutputSchema,
  type Decision,
  type DetailOutput,
  type NormalizedQuery,
  type PrepareOutput,
  type QueryInput,
  type QueueOutput,
  type SubmitOutput,
} from "../server/domain/schemas.ts";
import { normalizeQuery, querySignature } from "../server/domain/query.ts";
import { decisionMessage, decisionVerb } from "../server/domain/statement.ts";

export const INIT_TIMEOUT_MS = 5000;
export const SUBMIT_TIMEOUT_MS = 10000;
export const READ_TIMEOUT_MS = 10000;

export type Phase = "disconnected" | "initializing" | "ready" | "error" | "closed";

/** The subset of the SDK App the store uses; the real App satisfies it. */
export interface ViewApp {
  connect(transport: unknown): Promise<void>;
  close(): Promise<void>;
  callServerTool(
    params: { name: string; arguments?: Record<string, unknown> },
    options?: { timeout?: number },
  ): Promise<CallToolResult>;
  sendMessage(params: {
    role: "user";
    content: Array<{ type: "text"; text: string }>;
  }): Promise<{ isError?: boolean } | Record<string, unknown>>;
  getHostCapabilities(): Record<string, unknown> | undefined;
  getHostContext(): Record<string, unknown> | undefined;
  ontoolinput: ((params: { arguments?: Record<string, unknown> }) => void) | undefined;
  ontoolresult: ((params: CallToolResult) => void) | undefined;
  ontoolcancelled: ((params: { reason?: string }) => void) | undefined;
  onhostcontextchanged: ((params: Record<string, unknown>) => void) | undefined;
  onteardown: (() => Promise<Record<string, never>> | Record<string, never>) | undefined;
}

export interface Connector {
  createApp(): ViewApp;
  createTransport(): unknown;
}

export type SubmitStatus = "idle" | "submitting" | "recorded" | "unknown" | "failed";
export type MessageStatus = "idle" | "sending" | "sent" | "failed";

export interface ViewSnapshot {
  phase: Phase;
  connectError: string | null;
  attempt: number;
  theme: "light" | "dark";
  locale: string | null;
  canMessage: boolean;
  initialInput: QueryInput | null;
  query: NormalizedQuery;
  queue: QueueOutput | null;
  queueSource: "launch" | "query" | null;
  queueLoading: boolean;
  queueError: string | null;
  ignoredLateResults: number;
  launchCancelled: string | null;
  selection: {
    id: string | null;
    generation: number;
    detail: DetailOutput["request"] | null;
    loading: boolean;
    error: string | null;
  };
  draft: { decision: Decision | null; reason: string };
  preparation: { status: "idle" | "preparing" | "ready" | "failed"; prepared: PrepareOutput | null; error: string | null };
  submit: { status: SubmitStatus; result: SubmitOutput | null; error: string | null };
  message: { status: MessageStatus; error: string | null };
  announcement: string;
}

function initialSnapshot(): ViewSnapshot {
  return {
    phase: "disconnected",
    connectError: null,
    attempt: 0,
    theme: "light",
    locale: null,
    canMessage: false,
    initialInput: null,
    query: normalizeQuery(),
    queue: null,
    queueSource: null,
    queueLoading: false,
    queueError: null,
    ignoredLateResults: 0,
    launchCancelled: null,
    selection: { id: null, generation: 0, detail: null, loading: false, error: null },
    draft: { decision: null, reason: "" },
    preparation: { status: "idle", prepared: null, error: null },
    submit: { status: "idle", result: null, error: null },
    message: { status: "idle", error: null },
    announcement: "",
  };
}

export function resultError(result: CallToolResult): string {
  const parsed = ErrorOutputSchema.safeParse(result.structuredContent);
  if (parsed.success) return `${parsed.data.code}: ${parsed.data.message}`;
  const text = result.content.find((c) => c.type === "text");
  return text && "text" in text ? String(text.text) : "The tool reported an error.";
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export type ViewSession = ReturnType<typeof createViewSession>;

export function createViewSession(connector: Connector, options: { initTimeoutMs?: number } = {}) {
  let snapshot = initialSnapshot();
  const listeners = new Set<() => void>();
  let app: ViewApp | null = null;
  // Incremented per connection attempt; handlers of an abandoned App become inert.
  let connection = 0;
  // Local query sequence: a result applies only if it belongs to the newest query.
  let querySeq = 0;
  let closed = false;

  function set(patch: Partial<ViewSnapshot>): void {
    snapshot = { ...snapshot, ...patch };
    for (const listener of listeners) listener();
  }

  function announce(text: string): Partial<ViewSnapshot> {
    return { announcement: text };
  }

  function resetDecision(): Partial<ViewSnapshot> {
    return {
      draft: { decision: null, reason: "" },
      preparation: { status: "idle", prepared: null, error: null },
      submit: { status: "idle", result: null, error: null },
      message: { status: "idle", error: null },
    };
  }

  function applyHostContext(ctx: Record<string, unknown> | undefined): void {
    if (!ctx) return;
    const patch: Partial<ViewSnapshot> = {};
    if (ctx.theme === "light" || ctx.theme === "dark") patch.theme = ctx.theme;
    if (typeof ctx.locale === "string") patch.locale = ctx.locale;
    // Query, selection and drafts are deliberately untouched by context changes.
    if (Object.keys(patch).length > 0) set(patch);
  }

  function makeApp(attempt: number): ViewApp {
    const next = connector.createApp();
    const live = () => attempt === connection && !closed;
    next.ontoolinput = (params) => {
      if (!live()) return;
      const parsed = QueryInputSchema.safeParse(params.arguments ?? {});
      set({ initialInput: parsed.success ? parsed.data : null });
    };
    next.ontoolresult = (result) => {
      if (!live()) return;
      // A launch result never overwrites a newer local query (late launch notification).
      if (querySeq > 0) {
        set({ ignoredLateResults: snapshot.ignoredLateResults + 1 });
        return;
      }
      if (result.isError) {
        set({ queueError: resultError(result), queueSource: "launch" });
        return;
      }
      const parsed = QueueOutputSchema.safeParse(result.structuredContent);
      if (!parsed.success) {
        set({ queueError: "The launch result did not match the approval-queue schema." });
        return;
      }
      set({
        queue: parsed.data,
        query: parsed.data.query,
        queueSource: "launch",
        queueError: null,
        ...announce(`Loaded ${parsed.data.total} matching requests.`),
      });
    };
    next.ontoolcancelled = (params) => {
      if (!live()) return;
      set({ launchCancelled: params.reason ?? "The host cancelled the launch tool call." });
    };
    next.onhostcontextchanged = (params) => {
      if (!live()) return;
      applyHostContext(params);
    };
    next.onteardown = () => {
      // Host-initiated teardown: stop applying late results; the host removes the frame.
      if (attempt === connection) {
        closed = true;
        set({ phase: "closed", ...announce("The desk was closed by the host.") });
      }
      return {};
    };
    return next;
  }

  async function connect(): Promise<void> {
    if (closed || snapshot.phase === "initializing" || snapshot.phase === "ready") return;
    connection += 1;
    const attempt = connection;
    const previous = app;
    app = null;
    if (previous) void previous.close().catch(() => undefined);
    const current = makeApp(attempt);
    app = current;
    set({ phase: "initializing", connectError: null, attempt });
    try {
      await withTimeout(
        current.connect(connector.createTransport()),
        options.initTimeoutMs ?? INIT_TIMEOUT_MS,
        "The host did not finish initialization within 5 seconds.",
      );
      if (attempt !== connection || closed) return;
      const caps = current.getHostCapabilities() ?? {};
      set({ phase: "ready", canMessage: Boolean(caps.message), ...announce("Connected to the host.") });
      applyHostContext(current.getHostContext());
    } catch (error) {
      if (attempt !== connection || closed) return;
      // One attempt at a time and no automatic retry loop: the person chooses Retry.
      connection += 1;
      app = null;
      void current.close().catch(() => undefined);
      set({ phase: "error", connectError: errorText(error), ...announce("Connection failed.") });
    }
  }

  function readyApp(): ViewApp | null {
    return snapshot.phase === "ready" && !closed ? app : null;
  }

  async function runQuery(partial: QueryInput): Promise<void> {
    const current = readyApp();
    if (!current) return;
    const merged: QueryInput = {
      status: partial.status ?? snapshot.query.status,
      category: "category" in partial ? partial.category : snapshot.query.category ?? undefined,
      risk: "risk" in partial ? partial.risk : snapshot.query.risk ?? undefined,
      requesterId: "requesterId" in partial ? partial.requesterId : snapshot.query.requesterId ?? undefined,
      sort: partial.sort ?? snapshot.query.sort,
      pageSize: partial.pageSize ?? snapshot.query.pageSize,
      offset: partial.offset ?? 0,
    };
    const seq = ++querySeq;
    const wanted = querySignature(normalizeQuery(merged));
    set({ queueLoading: true, queueError: null, preparation: { status: "idle", prepared: null, error: null } });
    try {
      const result = await current.callServerTool({ name: "list_approvals", arguments: merged }, { timeout: READ_TIMEOUT_MS });
      if (seq !== querySeq || closed) {
        set({ ignoredLateResults: snapshot.ignoredLateResults + 1 });
        return;
      }
      if (result.isError) {
        set({ queueLoading: false, queueError: resultError(result) });
        return;
      }
      const parsed = QueueOutputSchema.safeParse(result.structuredContent);
      if (!parsed.success || querySignature(parsed.data.query) !== wanted) {
        set({ queueLoading: false, queueError: "The queue result did not match the requested query." });
        return;
      }
      const keepSelection = snapshot.selection.id !== null && parsed.data.rows.some((r) => r.id === snapshot.selection.id);
      set({
        queue: parsed.data,
        query: parsed.data.query,
        queueSource: "query",
        queueLoading: false,
        ...(keepSelection
          ? {}
          : {
              selection: { id: null, generation: snapshot.selection.generation + 1, detail: null, loading: false, error: null },
              ...resetDecision(),
            }),
        ...announce(`Showing ${parsed.data.rows.length} of ${parsed.data.total} matching requests.`),
      });
    } catch (error) {
      if (seq !== querySeq || closed) return;
      set({ queueLoading: false, queueError: errorText(error) });
    }
  }

  async function loadDetail(id: string, generation: number): Promise<void> {
    const current = readyApp();
    if (!current) return;
    try {
      const result = await current.callServerTool({ name: "get_approval", arguments: { id } }, { timeout: READ_TIMEOUT_MS });
      if (generation !== snapshot.selection.generation || closed) return;
      if (result.isError) {
        set({ selection: { ...snapshot.selection, loading: false, error: resultError(result) } });
        return;
      }
      const parsed = DetailOutputSchema.safeParse(result.structuredContent);
      if (!parsed.success || parsed.data.request.id !== id) {
        set({ selection: { ...snapshot.selection, loading: false, error: "The detail result did not match the selection." } });
        return;
      }
      set({ selection: { ...snapshot.selection, detail: parsed.data.request, loading: false, error: null } });
    } catch (error) {
      if (generation !== snapshot.selection.generation || closed) return;
      set({ selection: { ...snapshot.selection, loading: false, error: errorText(error) } });
    }
  }

  function select(id: string | null): void {
    const generation = snapshot.selection.generation + 1;
    set({
      selection: { id, generation, detail: null, loading: id !== null, error: null },
      ...resetDecision(),
    });
    if (id !== null) void loadDetail(id, generation);
  }

  function setDecision(decision: Decision): void {
    // Changing the decision discards any preparation.
    set({
      draft: { ...snapshot.draft, decision },
      preparation: { status: "idle", prepared: null, error: null },
      submit: { status: "idle", result: null, error: null },
    });
  }

  function setReason(reason: string): void {
    set({
      draft: { ...snapshot.draft, reason },
      preparation: { status: "idle", prepared: null, error: null },
      submit: { status: "idle", result: null, error: null },
    });
  }

  async function prepare(): Promise<void> {
    const current = readyApp();
    const { id, generation, detail } = snapshot.selection;
    const { decision, reason } = snapshot.draft;
    if (!current || !id || !detail || !decision || snapshot.preparation.status === "preparing") return;
    set({ preparation: { status: "preparing", prepared: null, error: null } });
    try {
      const result = await current.callServerTool(
        { name: "prepare_decision", arguments: { id, decision, reason } },
        { timeout: READ_TIMEOUT_MS },
      );
      if (generation !== snapshot.selection.generation || closed) return;
      // A draft edit during the call made this preparation stale.
      if (snapshot.draft.decision !== decision || snapshot.draft.reason !== reason) return;
      if (result.isError) {
        set({ preparation: { status: "failed", prepared: null, error: resultError(result) } });
        return;
      }
      const parsed = PrepareOutputSchema.safeParse(result.structuredContent);
      if (
        !parsed.success ||
        parsed.data.id !== id ||
        parsed.data.decision !== decision ||
        !parsed.data.statement.startsWith(`${decisionVerb(decision)} ${id} | `) ||
        !parsed.data.statement.includes(` | version=${parsed.data.requestVersion} | `)
      ) {
        set({ preparation: { status: "failed", prepared: null, error: "The prepared statement did not match this request." } });
        return;
      }
      set({ preparation: { status: "ready", prepared: parsed.data, error: null }, ...announce("Review the exact statement.") });
    } catch (error) {
      if (generation !== snapshot.selection.generation || closed) return;
      set({ preparation: { status: "failed", prepared: null, error: errorText(error) } });
    }
  }

  function cancelConfirm(): void {
    if (snapshot.submit.status === "submitting") return;
    set({ preparation: { status: "idle", prepared: null, error: null }, ...announce("Confirmation cancelled. Nothing was recorded.") });
  }

  async function refreshAfterUncertainOutcome(id: string, generation: number): Promise<void> {
    // Read only. Never re-prepare or retry automatically.
    set({ selection: { ...snapshot.selection, loading: true } });
    await loadDetail(id, generation);
  }

  async function confirm(): Promise<void> {
    const current = readyApp();
    const prepared = snapshot.preparation.prepared;
    const { generation } = snapshot.selection;
    if (!current || !prepared || snapshot.submit.status === "submitting") return;
    set({ submit: { status: "submitting", result: null, error: null } });
    let result: CallToolResult;
    try {
      result = await current.callServerTool(
        {
          name: "submit_decision",
          arguments: { id: prepared.id, decision: prepared.decision, nonce: prepared.nonce, statement: prepared.statement },
        },
        { timeout: SUBMIT_TIMEOUT_MS },
      );
    } catch (error) {
      // Timeout or transport failure after the request left: the decision may or may not be
      // recorded. Show that, refresh the detail and let the person inspect version/history.
      if (closed) return;
      set({
        preparation: { status: "idle", prepared: null, error: null },
        submit: { status: "unknown", result: null, error: errorText(error) },
        ...announce("Outcome unknown. Refreshing the request."),
      });
      if (generation === snapshot.selection.generation) await refreshAfterUncertainOutcome(prepared.id, generation);
      return;
    }
    // A committed decision stays committed even if the view was torn down meanwhile.
    if (closed) return;
    if (result.isError) {
      set({
        preparation: { status: "idle", prepared: null, error: null },
        submit: { status: "failed", result: null, error: resultError(result) },
        ...announce("The decision was not recorded."),
      });
      return;
    }
    const parsed = SubmitOutputSchema.safeParse(result.structuredContent);
    if (!parsed.success) {
      set({
        preparation: { status: "idle", prepared: null, error: null },
        submit: { status: "unknown", result: null, error: "The submit result did not match the schema." },
      });
      if (generation === snapshot.selection.generation) await refreshAfterUncertainOutcome(prepared.id, generation);
      return;
    }
    set({
      preparation: { status: "idle", prepared: null, error: null },
      submit: { status: "recorded", result: parsed.data, error: null },
      message: { status: "idle", error: null },
      ...announce(`Decision recorded: ${parsed.data.id} ${parsed.data.decision}.`),
    });
    if (generation === snapshot.selection.generation) void loadDetail(prepared.id, generation);
    void runQuery({ offset: snapshot.query.offset });
  }

  async function tellAssistant(): Promise<void> {
    const current = readyApp();
    const recorded = snapshot.submit.result;
    if (!current || !recorded || !snapshot.canMessage || snapshot.message.status !== "idle") return;
    set({ message: { status: "sending", error: null } });
    try {
      const response = await current.sendMessage({
        role: "user",
        content: [{ type: "text", text: decisionMessage(recorded.id, recorded.decision) }],
      });
      if (closed) return;
      const failed = typeof response === "object" && response !== null && (response as { isError?: boolean }).isError === true;
      set({
        message: failed ? { status: "failed", error: "The host declined the message." } : { status: "sent", error: null },
        ...announce(failed ? "The host declined the message." : "The host accepted the message."),
      });
    } catch (error) {
      if (closed) return;
      // A failed message never rolls back the recorded decision.
      set({ message: { status: "failed", error: errorText(error) } });
    }
  }

  async function teardown(): Promise<void> {
    if (closed) return;
    closed = true;
    connection += 1;
    const current = app;
    app = null;
    listeners.clear();
    snapshot = { ...snapshot, phase: "closed" };
    if (current) await current.close().catch(() => undefined);
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    listenerCount: () => listeners.size,
    connect,
    retry: connect,
    query: runQuery,
    select,
    setDecision,
    setReason,
    prepare,
    cancelConfirm,
    confirm,
    tellAssistant,
    teardown,
  };
}
