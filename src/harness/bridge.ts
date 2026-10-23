import { ErrorCodes } from "../domain/errors.ts";
import { hostMayPush, sourceAllowed } from "../domain/securityPolicy.ts";
import type { HostSimulation } from "./fixtures.ts";

export interface ViewMessage {
  method: string;
  params?: Record<string, unknown>;
}

export interface BridgeLogEntry {
  direction: "view-to-host" | "host-to-view" | "dropped";
  method: string;
  ok: boolean;
  detail: string;
}

export type BridgeReply =
  | { ok: true; result: unknown }
  | { ok: false; code: string; message: string };

export class HostBridge {
  private viewInitialized = false;

  readonly log: BridgeLogEntry[] = [];

  constructor(
    private readonly sandboxOrigin: string,
    readonly hostOrigin: string,
    private readonly context: HostSimulation,
  ) {}

  get initialized(): boolean {
    return this.viewInitialized;
  }

  receiveFromView(sourceOrigin: string, message: ViewMessage): BridgeReply {
    if (!sourceAllowed(sourceOrigin, this.sandboxOrigin)) {
      this.log.push({ direction: "dropped", method: message.method, ok: false, detail: ErrorCodes.badSource });
      return {
        ok: false,
        code: ErrorCodes.badSource,
        message: "Ignored a message whose source is not the sandbox origin.",
      };
    }
    if (message.method === "ui/initialize") {
      this.log.push({ direction: "host-to-view", method: "ui/initialize", ok: true, detail: "initialize response" });
      return {
        ok: true,
        result: {
          protocolVersion: "2026-01-26",
          hostInfo: { name: "confirm-queue-harness", version: "0.1.0" },
          hostContext: {
            theme: this.context.theme,
            displayMode: this.context.displayMode,
            locale: this.context.locale,
          },
        },
      };
    }
    if (message.method === "ui/notifications/initialized") {
      this.viewInitialized = true;
      this.log.push({
        direction: "view-to-host",
        method: message.method,
        ok: true,
        detail: "view ready",
      });
      return { ok: true, result: {} };
    }
    if (!this.viewInitialized) {
      this.log.push({ direction: "dropped", method: message.method, ok: false, detail: ErrorCodes.notInitialized });
      return {
        ok: false,
        code: ErrorCodes.notInitialized,
        message: "The view must send ui/notifications/initialized before other calls.",
      };
    }
    if (message.method === "ui/message" || message.method === "tools/call") {
      this.log.push({ direction: "view-to-host", method: message.method, ok: true, detail: "accepted" });
      return { ok: true, result: { forwarded: message.method, params: message.params ?? {} } };
    }
    this.log.push({ direction: "dropped", method: message.method, ok: false, detail: "unsupported" });
    return { ok: false, code: ErrorCodes.invalidInput, message: `Unsupported view method: ${message.method}.` };
  }

  pushToView(method: string, detail: string): { delivered: boolean; reason?: string } {
    if (!hostMayPush(this.viewInitialized)) {
      this.log.push({ direction: "dropped", method, ok: false, detail: ErrorCodes.notInitialized });
      return { delivered: false, reason: ErrorCodes.notInitialized };
    }
    this.log.push({ direction: "host-to-view", method, ok: true, detail });
    return { delivered: true };
  }
}
