import { useCallback, useEffect, useRef, useState } from "react";
import type { QueryInput } from "../../server/domain/schemas.ts";
import { DATASET_SHA256, VIEW_HTML, VIEW_HTML_SHA256 } from "../../server/generated/view-html.ts";
import { BridgeLog } from "./BridgeLog.tsx";
import { buildEnvelope, type Envelope } from "./csp.ts";
import type { HostController, HostState } from "./hostController.ts";
import { startLabSession, type LabSession } from "./labSession.ts";
import { createProtocolLog, type ProtocolLog } from "./protocolLog.ts";
import { Sandbox } from "./Sandbox.tsx";
import { TextPane } from "./TextPane.tsx";

type Boot =
  | { status: "starting" }
  | { status: "ready"; session: LabSession; envelope: Envelope; log: ProtocolLog }
  | { status: "failed"; error: string };

const LAUNCH_ARGS: QueryInput = {};

export function LabHost() {
  const [sessionKey, setSessionKey] = useState(0);
  const [boot, setBoot] = useState<Boot>({ status: "starting" });
  const [, setLogTick] = useState(0);
  const [hostState, setHostState] = useState<HostState | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [messageCapability, setMessageCapability] = useState(true);
  const controllerRef = useRef<HostController | null>(null);

  useEffect(() => {
    let cancelled = false;
    let started: LabSession | null = null;
    setBoot({ status: "starting" });
    setHostState(null);
    const log = createProtocolLog(() => setLogTick((t) => t + 1));
    (async () => {
      try {
        const session = await startLabSession(VIEW_HTML, log);
        started = session;
        const envelope = await buildEnvelope(session.resource.html, session.resource.meta);
        if (cancelled) return;
        setBoot({ status: "ready", session, envelope, log });
      } catch (error) {
        if (!cancelled) setBoot({ status: "failed", error: error instanceof Error ? error.message : String(error) });
      }
    })();
    return () => {
      cancelled = true;
      controllerRef.current = null;
      void started?.close();
    };
  }, [sessionKey]);

  const onReady = useCallback(
    (controller: HostController) => {
      if (boot.status !== "ready") return;
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

  const reset = () => setSessionKey((k) => k + 1);

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

      {boot.status === "ready" ? (
        <div className="lab-grid">
          <section className="panel" aria-labelledby="view-heading">
            <h2 id="view-heading">Rendered resource</h2>
            <dl className="identity">
              <dt>Resource</dt>
              <dd>
                {boot.session.resource.uri} ({boot.session.resource.mimeType})
              </dd>
              <dt>Raw HTML SHA-256</dt>
              <dd>
                <code>{boot.envelope.rawSha256}</code>{" "}
                {boot.envelope.rawSha256 === VIEW_HTML_SHA256 ? "(matches the built view)" : "(DIFFERS from the built view)"}
              </dd>
              <dt>Envelope SHA-256</dt>
              <dd>
                <code>{boot.envelope.envelopeSha256}</code>
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
              <code className="policy">{boot.envelope.policy}</code>
            </details>
            <Sandbox
              key={sessionKey}
              html={boot.envelope.html}
              client={boot.session.client}
              tools={boot.session.tools}
              log={boot.log}
              messageCapability={messageCapability}
              theme={theme}
              onReady={onReady}
              onState={setHostState}
            />
          </section>
          <TextPane key={`text-${sessionKey}`} client={boot.session.client} />
          <BridgeLog
            entries={boot.log.entries()}
            dropped={boot.log.dropped()}
            identity={{
              rawHtmlSha256: boot.envelope.rawSha256,
              envelopeSha256: boot.envelope.envelopeSha256,
              datasetSha256: DATASET_SHA256,
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
