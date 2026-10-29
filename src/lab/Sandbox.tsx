import { useEffect, useRef } from "react";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { createHostController, type HostController, type HostState, type ViewFrame } from "./hostController.ts";
import type { ProtocolLog } from "./protocolLog.ts";

interface SandboxProps {
  html: string;
  client: Client;
  tools: Tool[];
  log: ProtocolLog;
  messageCapability: boolean;
  theme: "light" | "dark";
  onReady: (controller: HostController) => void;
  onState: (state: HostState) => void;
}

/**
 * Creates the iframe imperatively so the bridge transport is attached to its window before the
 * document is assigned. sandbox="allow-scripts" only: no allow-same-origin, so the view runs in
 * an opaque origin and cannot read the Lab's DOM or storage.
 */
export function Sandbox({ html, client, tools, log, messageCapability, theme, onReady, onState }: SandboxProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // Mount-time inputs only: a new html/client means a new Sandbox (keyed by the session).
  const initial = useRef({ html, client, tools, log, messageCapability, theme, onReady, onState });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const props = initial.current;
    const iframe = document.createElement("iframe");
    iframe.setAttribute("sandbox", "allow-scripts");
    iframe.setAttribute("title", "Approval Desk view (sandboxed)");
    iframe.setAttribute("referrerpolicy", "no-referrer");
    iframe.className = "view-frame";
    container.appendChild(iframe);
    const win = iframe.contentWindow;
    if (!win) {
      props.log.event("host↔view", "iframe window unavailable; view not started");
      return;
    }
    const frame: ViewFrame = {
      window: win,
      load: (doc) => {
        iframe.srcdoc = doc;
      },
      remove: () => iframe.remove(),
    };
    const controller = createHostController({
      client: props.client,
      tools: props.tools,
      log: props.log,
      frame,
      messageCapability: props.messageCapability,
      hostContext: {
        theme: props.theme,
        locale: navigator.language,
        platform: "web",
        displayMode: "inline",
        availableDisplayModes: ["inline"],
        containerDimensions: { maxHeight: 900 },
      },
      onState: props.onState,
    });
    let disposed = false;
    controller
      .start(props.html)
      .then(() => {
        if (!disposed) props.onReady(controller);
      })
      .catch((error: unknown) => props.log.event("host↔view", `bridge start failed: ${String(error)}`));
    return () => {
      disposed = true;
      void controller.teardown();
    };
  }, []);

  return <div ref={containerRef} className="frame-container" />;
}
