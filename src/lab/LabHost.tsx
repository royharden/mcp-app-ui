import { useCallback, useEffect, useRef, useState } from "react";
import type { QueryInput } from "../../server/domain/schemas.ts";
import { DATASET_SHA256, VIEW_HTML, VIEW_HTML_SHA256 } from "../../server/generated/view-html.ts";
import { BridgeLog } from "./BridgeLog.tsx";
import { Evidence } from "./Evidence.tsx";
import { Measure } from "./Measure.tsx";
import { buildEnvelope, type Envelope } from "./csp.ts";
import type { HostController, HostState } from "./hostController.ts";
import { startLabSession, type LabSession } from "./labSession.ts";
import { createProtocolLog, type ProtocolLog } from "./protocolLog.ts";
import { Sandbox } from "./Sandbox.tsx";
import { TextPane } from "./TextPane.tsx";

// Every Boot carries the session key it belongs to; views render only for the current key.
type Boot =
  | { status: "starting"; key: number }
  | { status: "ready"; key: number; session: LabSession; envelope: Envelope; log: ProtocolLog }
  | { status: "failed"; key: number; error: string };

const LAUNCH_ARGS: QueryInput = {};

export function LabHost() {
  const [sessionKey, setSessionKey] = useState(0);
  const [boot, setBoot] = useState<Boot>({ status: "starting", key: 0 });
  const [, setLogTick] = useState(0);
  const [hostState, setHostState] = useState<HostState | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [messageCapability, setMessageCapability] = useState(true);
  const controllerRef = useRef<HostController | null>(null);
  // The session whose view may report readiness; anything else is stale.
  const currentSessionRef = useRef<LabSession | null>(null);

  useEffect(() => {
    let cancelled = false;
    let started: LabSession | null = null;
    const key = sessionKey;
    setBoot({ status: "starting", key });
    setHostState(null);
    const log = createProtocolLog(() => setLogTick((t) => t + 1));
    (async () => {
      try {
        const session = await startLabSession(VIEW_HTML, log);
        if (cancelled) {
          // Reset while starting: never leak the finished session.
          await session.close();
          return;
        }
        started = session;
        const envelope = await buildEnvelope(session.resource.html, session.resource.meta);
        if (cancelled) return;
        currentSessionRef.current = session;
        setBoot({ status: "ready", key, session, envelope, log });
      } catch (error) {
        if (!cancelled) setBoot({ status: "failed", key, error: error instanceof Error ? error.message : String(error) });
      }
    })();
    return () => {
      cancelled = true;
      controllerRef.current = null;
      currentSessionRef.current = null;
      void started?.close();
    };
  }, [sessionKey]);

  const onReady = useCallback(
    (controller: HostController) => {
      if (boot.status !== "ready" || currentSessionRef.current !== boot.session) {
        // A view from a session that was reset meanwhile: tear it down, launch nothing.
        void controller.teardown();
        return;
      }
      controllerRef.current = controller;
      const { session, log } = boot;
      // Launch: input and result are buffered by the host until the view is initialized.
      controller.deliverInput({ ...LAUNCH_ARGS });
      session.client
        .callTool({ name: session.launchTool.name, arguments: { ...LAUNCH_ARGS } })
        .then((result) => controller.deliverResult(result as never))
        .catch((error: unknown) => log.event("client↔server", `launch call failed: ${String(error)}`));
    },
    [boot],
  );

  function changeTheme(next: "light" | "dark") {
    setTheme(next);
    void controllerRef.current?.setHostContext({ theme: next });
  }

  const reset = () => {
    // Leave "ready" in the same render that changes the key, so no view mounts on the old session.
    const next = sessionKey + 1;
    controllerRef.current = null;
    currentSessionRef.current = null;
    setHostState(null);
    setBoot({ status: "starting", key: next });
    setSessionKey(next);
  };

  const live = boot.status === "ready" && boot.key === sessionKey ? boot : null;

  return (
    <div className="lab">
      <header className="lab-head">
        <h1>Approval Desk — Bridge Lab</h1>
        <p className="banner" role="note">
          Inspection host — exact resource rendering; browser isolation and real-host support pending. This srcdoc
          frame with a meta CSP is not a conformant separate-origin production sandbox.
        </p>
        <div className="lab-controls">
          <button type="button" onClick={reset}>
            Reset session
          </button>
          <label>
            Theme
            <select value={theme} onChange={(e) => changeTheme(e.target.value as "light" | "dark")}>
              <option value="light">light</option>
              <option value="dark">dark</option>
            </select>
          </label>
          <label title="Applies on the next Reset session">
            <input type="checkbox" checked={messageCapability} onChange={(e) => setMessageCapability(e.target.checked)} />
            Offer ui/message (next reset)
          </label>
        </div>
      </header>

      {boot.status === "starting" ? <p className="muted">Starting a fresh in-page server…</p> : null}
      {boot.status === "failed" ? (
        <p role="alert" className="error">
          Lab could not start: {boot.error}
        </p>
      ) : null}

      {live ? (
        <div className="lab-grid">
          <section className="panel" aria-labelledby="view-heading">
            <h2 id="view-heading">Rendered resource</h2>
            <dl className="identity">
              <dt>Resource</dt>
              <dd>
                {live.session.resource.uri} ({live.session.resource.mimeType})
              </dd>
              <dt>Raw HTML SHA-256</dt>
              <dd>
                <code>{live.envelope.rawSha256}</code>{" "}
                {live.envelope.rawSha256 === VIEW_HTML_SHA256 ? "(matches the built view)" : "(DIFFERS from the built view)"}
              </dd>
              <dt>Envelope SHA-256</dt>
              <dd>
                <code>{live.envelope.envelopeSha256}</code>
              </dd>
              <dt>Dataset SHA-256</dt>
              <dd>
                <code>{DATASET_SHA256}</code>
              </dd>
              <dt>Host</dt>
              <dd>
                {hostState?.phase ?? "idle"}
                {hostState?.error ? ` — ${hostState.error}` : ""}
                {hostState && hostState.refusedLinks > 0 ? ` · ${hostState.refusedLinks} link request(s) refused` : ""}
                {hostState && hostState.acceptedMessages.length > 0
                  ? ` · Lab accepted: ${hostState.acceptedMessages.join("; ")} (not a model)`
                  : ""}
              </dd>
            </dl>
            <details>
              <summary>Applied CSP</summary>
              <code className="policy">{live.envelope.policy}</code>
            </details>
            <Sandbox
              key={sessionKey}
              html={live.envelope.html}
              client={live.session.client}
              tools={live.session.tools}
              log={live.log}
              messageCapability={messageCapability}
              theme={theme}
              onReady={onReady}
              onState={setHostState}
            />
          </section>
          <TextPane key={`text-${sessionKey}`} client={live.session.client} />
          <BridgeLog
            entries={live.log.entries()}
            dropped={live.log.dropped()}
            identity={{
              rawHtmlSha256: live.envelope.rawSha256,
              envelopeSha256: live.envelope.envelopeSha256,
              datasetSha256: DATASET_SHA256,
            }}
          />
          <Evidence />
          <Measure />
        </div>
      ) : null}
    </div>
  );
}
