// Bounded, evidence-grade trace for harness runs.
//
// Limits: 2000 events, 16 KiB captured per event, 2 MiB total. Exceeding any limit FAILS the
// run instead of silently dropping evidence. Recording happens inside transport and event
// callbacks where a thrown error would be swallowed, so overflow is a sticky flag: recording
// stops, `overflow()` reports it, the runner fails, and `finish()` marks the trace failed. Payloads are allowlisted:
// nonces become digest aliases, and untrusted free text (reasons, statements, titles,
// descriptions, tool text content) is replaced by { redacted, length } so traces never copy it.
// Focused formatting tests inspect those strings in memory instead.
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { sha256Hex } from "../server/domain/crypto.ts";

export const MAX_EVENTS = 2000;
export const MAX_EVENT_BYTES = 16 * 1024;
export const MAX_TOTAL_BYTES = 2 * 1024 * 1024;

const REDACTED_TEXT_KEYS = new Set(["reason", "statement", "title", "description", "text"]);

export class TraceOverflowError extends Error {}

export interface TraceIdentity {
  scenarioId: string;
  mode: "realHandlers" | "injectedFault";
  datasetSha256: string;
  rawHtmlSha256: string | null;
  envelopeSha256: string | null;
  runtime: string;
  sdkVersion: string;
  extAppsVersion: string;
  specVersion: string;
}

export interface TraceEvent {
  index: number;
  /** Monotonic order only; not wall time, never used as a performance measurement. */
  monotonic: number;
  channel: "client↔server" | "host↔view" | "action" | "fault";
  direction: "→" | "←" | "·";
  method: string | null;
  /** The actual JSON-RPC request id when present; never invented for notifications. */
  jsonrpcId: string | number | null;
  payloadKind: string;
  payload: unknown;
  originalBytes: number;
  action: string | null;
  disposition: string | null;
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

export function createRecorder(identity: TraceIdentity) {
  const events: TraceEvent[] = [];
  let totalBytes = 0;
  let counter = 0;
  const nonceAliases = new Map<string, string>();
  const pendingDigests: Promise<void>[] = [];

  function nonceAlias(raw: string): string {
    let alias = nonceAliases.get(raw);
    if (!alias) {
      alias = `nonce#${nonceAliases.size + 1}`;
      nonceAliases.set(raw, alias);
      // Digest recorded for cross-checking against repo-side hashes; the raw value is not kept.
      const index = nonceAliases.size;
      pendingDigests.push(
        sha256Hex(raw).then((digest) => {
          nonceDigests.set(`nonce#${index}`, digest);
        }),
      );
    }
    return alias;
  }
  const nonceDigests = new Map<string, string>();

  function sanitize(value: unknown, key: string | null): unknown {
    if (typeof value === "string") {
      if (key === "nonce") return nonceAlias(value);
      if (key !== null && REDACTED_TEXT_KEYS.has(key)) return { redacted: true, length: value.length };
      // Remaining strings are enums, ids, methods and timestamps; cap defensively.
      return value.length > 200 ? { redacted: true, length: value.length } : value;
    }
    if (Array.isArray(value)) return value.map((v) => sanitize(v, key));
    if (value && typeof value === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) out[k] = sanitize(v, k);
      return out;
    }
    return value;
  }

  let overflowReason: string | null = null;

  function push(event: Omit<TraceEvent, "index" | "monotonic">): void {
    if (overflowReason) return;
    const bytes = byteLength(JSON.stringify(event.payload ?? null));
    if (events.length >= MAX_EVENTS) overflowReason = `trace overflow: more than ${MAX_EVENTS} events`;
    else if (bytes > MAX_EVENT_BYTES) {
      overflowReason = `trace overflow: event ${events.length + 1} captured ${bytes} bytes (limit ${MAX_EVENT_BYTES})`;
    } else if (totalBytes + bytes > MAX_TOTAL_BYTES) overflowReason = `trace overflow: more than ${MAX_TOTAL_BYTES} bytes`;
    if (overflowReason) return;
    totalBytes += bytes;
    counter += 1;
    events.push({ ...event, index: events.length + 1, monotonic: counter });
  }

  function message(channel: "client↔server" | "host↔view", direction: "→" | "←", msg: JSONRPCMessage): void {
    const m = msg as { id?: string | number; method?: string; params?: unknown; result?: unknown; error?: unknown };
    const kind =
      m.method !== undefined && m.id !== undefined
        ? "request"
        : m.method !== undefined
          ? "notification"
          : m.error !== undefined
            ? "error"
            : "response";
    const body = m.params ?? m.result ?? m.error ?? null;
    push({
      channel,
      direction,
      method: m.method ?? null,
      jsonrpcId: m.id ?? null,
      payloadKind: kind,
      payload: sanitize(body, null),
      originalBytes: byteLength(JSON.stringify(msg)),
      action: null,
      disposition: null,
    });
  }

  function action(name: string, detail: Record<string, unknown> = {}, disposition: string | null = null): void {
    push({
      channel: "action",
      direction: "·",
      method: null,
      jsonrpcId: null,
      payloadKind: "action",
      payload: sanitize(detail, null),
      originalBytes: 0,
      action: name,
      disposition,
    });
  }

  function fault(name: string, detail: Record<string, unknown> = {}): void {
    push({
      channel: "fault",
      direction: "·",
      method: null,
      jsonrpcId: null,
      payloadKind: "injected-fault",
      payload: sanitize(detail, null),
      originalBytes: 0,
      action: name,
      disposition: "injected",
    });
  }

  /** Wrap a transport so both directions are recorded. `outgoing` labels this side's sends. */
  function wrap(inner: Transport, channel: "client↔server" | "host↔view", outgoing: "→" | "←"): Transport {
    const incoming = outgoing === "→" ? "←" : "→";
    const wrapper: Transport = {
      async start() {
        inner.onmessage = (msg, extra) => {
          message(channel, incoming, msg);
          wrapper.onmessage?.(msg, extra);
        };
        inner.onerror = (error) => wrapper.onerror?.(error);
        inner.onclose = () => wrapper.onclose?.();
        await inner.start();
      },
      async send(msg, options) {
        message(channel, outgoing, msg);
        await inner.send(msg, options);
      },
      async close() {
        await inner.close();
      },
    };
    return wrapper;
  }

  async function finish(terminal: string) {
    await Promise.all(pendingDigests);
    return {
      identity,
      // An overflowed trace is never reported as completed, whatever the caller passed.
      terminal: overflowReason && !terminal.startsWith("failed") ? `failed: ${overflowReason}` : terminal,
      overflow: overflowReason,
      limits: { maxEvents: MAX_EVENTS, maxEventBytes: MAX_EVENT_BYTES, maxTotalBytes: MAX_TOTAL_BYTES },
      totalBytes,
      nonceDigests: Object.fromEntries(nonceDigests),
      events: events.slice(),
    };
  }

  /** Throws if the trace overflowed: for callers outside runScenario that want a hard failure. */
  function assertComplete(): void {
    if (overflowReason) throw new TraceOverflowError(overflowReason);
  }

  return { message, action, fault, wrap, finish, overflow: () => overflowReason, assertComplete, events: () => events.slice() };
}

export type Recorder = ReturnType<typeof createRecorder>;
export type Trace = Awaited<ReturnType<Recorder["finish"]>>;
