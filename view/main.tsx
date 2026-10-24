// View entry, bundled as one classic IIFE and inlined into the resource HTML.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { sdkConnector } from "./bridge.ts";
import { createViewSession } from "./sessionStore.ts";
import { ViewApp } from "./ViewApp.tsx";
import "./styles.css";

// 1. Session store and handlers exist before connect and before React renders.
const session = createViewSession(sdkConnector());
// 2. Start the handshake immediately; results arriving before React commits are retained.
void session.connect();
// 3. Render a subscriber.
const container = document.getElementById("root");
if (container) {
  createRoot(container).render(
    <StrictMode>
      <ViewApp session={session} />
    </StrictMode>,
  );
}
// Final teardown is separate from React's lifecycle.
window.addEventListener("pagehide", () => void session.teardown(), { once: true });
