// Real SDK wiring for the view: App over PostMessageTransport to the parent window only.
import { App, PostMessageTransport } from "@modelcontextprotocol/ext-apps";
import type { Connector, ViewApp } from "./sessionStore.ts";

export const VIEW_INFO = { name: "approval-desk-view", version: "0.2.0" } as const;

export function sdkConnector(): Connector {
  return {
    createApp: () => new App(VIEW_INFO, {}, { autoResize: true }) as unknown as ViewApp,
    // Messages are accepted only when event.source is window.parent.
    createTransport: () => new PostMessageTransport(window.parent, window.parent),
  };
}
