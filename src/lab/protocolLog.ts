// Bounded protocol log for the Lab, plus a Transport wrapper that records traffic.
// Raw nonces are never stored: they become stable aliases (nonce#1, nonce#2, ...).
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";

export const LOG_LIMIT = 500;
export const ENTRY_PREVIEW_CHARS = 600;

export type Channel = "client↔server" | "host↔view";
export type Direction = "→" | "←";

export interface LogEntry {
  index: number;
  channel: Channel;
  direction: Direction;
  kind: "request" | "response" | "notification" | "error" | "event";
  method: string | null;
  id: string | number | null;
  summary: string;
}

/** Replaces every `nonce` string value with an alias; same raw value -> same alias. */
export function createNonceRedactor() {
  const aliases = new Map<string, string>();
  function alias(raw: string): string {
    let name = aliases.get(raw);
    if (!name) {
      name = `nonce#${aliases.size + 1}`;
      aliases.set(raw, name);
    }
    return name;
  }
  function redact(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(redact);
    if (value && typeof value === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) {
        out[k] = k === "nonce" && typeof v === "string" ? alias(v) : redact(v);
      }
      return out;
    }
    return value;
  }
  /** Raw nonces may also appear inside text, e.g. a JSON-RPC error message. */
  function redactText(text: string): string {
    let out = text;
    for (const [raw, name] of aliases) out = out.split(raw).join(name);
    return out;
  }
  return { redact, redactText };
}

export function describeMessage(message: JSONRPCMessage): Pick<LogEntry, "kind" | "method" | "id"> {
  const m = message as { id?: string | number; method?: string; error?: unknown };
  if (m.method !== undefined && m.id !== undefined) return { kind: "request", method: m.method, id: m.id };
  if (m.method !== undefined) return { kind: "notification", method: m.method, id: null };
  if (m.error !== undefined) return { kind: "error", method: null, id: m.id ?? null };
  return { kind: "response", method: null, id: m.id ?? null };
}

export function createProtocolLog(onChange: () => void) {
  const entries: LogEntry[] = [];
  let index = 0;
  let dropped = 0;
  const redactor = createNonceRedactor();

  function push(entry: Omit<LogEntry, "index">): void {
    index += 1;
    entries.push({ ...entry, index });
    // The Lab log is a view aid, not evidence: it keeps the newest entries and counts the rest.
    // The harness recorder (harness/recorder.ts) fails instead of dropping.
    if (entries.length > LOG_LIMIT) {
      entries.shift();
      dropped += 1;
    }
    onChange();
  }

  function message(channel: Channel, direction: Direction, msg: JSONRPCMessage): void {
    const summary = redactor.redactText(JSON.stringify(redactor.redact(msg)));
    push({
      channel,
      direction,
      ...describeMessage(msg),
      summary: summary.length > ENTRY_PREVIEW_CHARS ? `${summary.slice(0, ENTRY_PREVIEW_CHARS)}… (${summary.length} chars)` : summary,
    });
  }

  function event(channel: Channel, summary: string): void {
    push({ channel, direction: "→", kind: "event", method: null, id: null, summary });
  }

  return {
    message,
    event,
    entries: () => entries.slice(),
    dropped: () => dropped,
    redactor,
  };
}

export type ProtocolLog = ReturnType<typeof createProtocolLog>;

/**
 * Wraps a transport and records every message in both directions. `outgoing` is the label for
 * messages this side sends.
 */
export function loggingTransport(inner: Transport, log: ProtocolLog, channel: Channel, outgoing: Direction): Transport {
  const incoming: Direction = outgoing === "→" ? "←" : "→";
  const wrapper: Transport = {
    async start() {
      inner.onmessage = (msg, extra) => {
        log.message(channel, incoming, msg);
        wrapper.onmessage?.(msg, extra);
      };
      inner.onerror = (error) => wrapper.onerror?.(error);
      inner.onclose = () => wrapper.onclose?.();
      await inner.start();
    },
    async send(msg, options) {
      log.message(channel, outgoing, msg);
      await inner.send(msg, options);
    },
    async close() {
      await inner.close();
    },
  };
  return wrapper;
}
