import { useEffect, useState } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import type { DecisionAction, Risk } from "../domain/types.ts";
import {
  createApproval,
  listMine,
  postDecision,
  signIn,
  signOut,
  signUp,
  type LiveApproval,
} from "../lib/liveQueue.ts";
import { createBrowserClient, type PublicConfig } from "../lib/supabase.ts";

const RISKS: Risk[] = ["low", "medium", "high"];

export function LiveDesk({ config }: { config: PublicConfig }) {
  const [client] = useState<SupabaseClient>(() => createBrowserClient(config));
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [items, setItems] = useState<LiveApproval[]>([]);
  const [message, setMessage] = useState("Checking for an existing session.");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({ title: "", requester: "", summary: "", proposedChange: "", risk: "low" as Risk });
  const [pending, setPending] = useState<{ item: LiveApproval; action: DecisionAction; statement: string; token: string } | null>(null);
  const [note, setNote] = useState("");
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let active = true;
    void client.auth.getSession().then(({ data, error }) => {
      if (!active) {
        return;
      }
      if (error) {
        setMessage(error.message);
        return;
      }
      setSession(data.session);
      setMessage(data.session ? "Signed in." : "Sign in to use Bolt Database. Writes stay disabled until then.");
    });
    return () => {
      active = false;
    };
  }, [client]);

  useEffect(() => {
    if (!session) {
      setItems([]);
      return;
    }
    let active = true;
    void refresh(client, (next, text) => {
      if (!active) {
        return;
      }
      setItems(next);
      setMessage(text);
    });
    return () => {
      active = false;
    };
  }, [client, session]);

  async function onAuth(kind: "in" | "up") {
    if (!email.trim() || !password) {
      setMessage("Email and password are required.");
      return;
    }
    setBusy(true);
    const result = kind === "in" ? await signIn(client, email.trim(), password) : await signUp(client, email.trim(), password);
    setBusy(false);
    if (!result.ok) {
      setMessage(result.message);
      return;
    }
    if (result.needsConfirmation) {
      setMessage("Account created. Confirm the email, then sign in. No approval was written.");
      return;
    }
    const { data } = await client.auth.getSession();
    setSession(data.session);
    setPassword("");
  }

  async function onCreate() {
    if (!session) {
      setMessage("Sign in is required before an approval can be added.");
      return;
    }
    if (!draft.title.trim() || !draft.requester.trim() || !draft.summary.trim() || !draft.proposedChange.trim()) {
      setMessage("Title, requester, summary, and proposed change are required.");
      return;
    }
    setBusy(true);
    const created = await createApproval(client, session.user.id, {
      title: draft.title.trim(),
      requester: draft.requester.trim(),
      summary: draft.summary.trim(),
      proposedChange: draft.proposedChange.trim(),
      risk: draft.risk,
    });
    if (!created.ok) {
      setBusy(false);
      setMessage(created.message);
      return;
    }
    await refresh(client, (next, text) => {
      setItems(next);
      setMessage(text);
    });
    setDraft({ title: "", requester: "", summary: "", proposedChange: "", risk: "low" });
    setBusy(false);
  }

  async function onRequest(item: LiveApproval, action: DecisionAction) {
    if (!session) {
      setMessage("Sign in is required before a decision can be requested.");
      return;
    }
    setBusy(true);
    setPending(null);
    setChecked(false);
    const result = await postDecision(config, session.access_token, {
      step: "request",
      approvalId: item.id,
      action,
    });
    setBusy(false);
    if (!result.ok || !result.statement || !result.token) {
      setMessage(result.ok ? "The decision function did not return a confirmation statement." : result.message);
      return;
    }
    setPending({ item, action, statement: result.statement, token: result.token });
    setMessage("Read the statement from the server, then confirm it.");
  }

  async function onCommit() {
    if (!session || !pending) {
      setMessage("There is no confirmation to commit.");
      return;
    }
    if (!checked) {
      setMessage("Check the box to confirm this exact statement. Nothing was written.");
      return;
    }
    setBusy(true);
    const result = await postDecision(config, session.access_token, {
      step: "commit",
      approvalId: pending.item.id,
      action: pending.action,
      token: pending.token,
      statement: pending.statement,
      note: note.trim(),
    });
    setBusy(false);
    if (!result.ok) {
      setMessage(result.message);
      return;
    }
    setPending(null);
    setNote("");
    setChecked(false);
    await refresh(client, (next, text) => {
      setItems(next);
      setMessage(result.text || text);
    });
  }

  return (
    <section className="panel">
      <h2>Bolt Database</h2>
      <p className="notice">{message}</p>
      {session ? (
        <div className="stack">
          <p>
            Signed in as {session.user.email ?? session.user.id}.{" "}
            <button
              type="button"
              onClick={() => {
                void signOut(client).then((result) => {
                  if (!result.ok) {
                    setMessage(result.message);
                    return;
                  }
                  setSession(null);
                  setPending(null);
                  setMessage("Signed out. Commits stay disabled.");
                });
              }}
            >
              Sign out
            </button>
          </p>
          <form
            className="form"
            onSubmit={(event) => {
              event.preventDefault();
              void onCreate();
            }}
          >
            <label>
              Title
              <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
            </label>
            <label>
              Requester
              <input value={draft.requester} onChange={(event) => setDraft({ ...draft, requester: event.target.value })} />
            </label>
            <label>
              Summary
              <textarea value={draft.summary} onChange={(event) => setDraft({ ...draft, summary: event.target.value })} />
            </label>
            <label>
              Proposed change
              <textarea
                value={draft.proposedChange}
                onChange={(event) => setDraft({ ...draft, proposedChange: event.target.value })}
              />
            </label>
            <label>
              Risk
              <select
                value={draft.risk}
                onChange={(event) => setDraft({ ...draft, risk: event.target.value as Risk })}
              >
                {RISKS.map((risk) => (
                  <option key={risk} value={risk}>
                    {risk}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" disabled={busy}>
              Add pending approval
            </button>
          </form>
          {items.length === 0 ? <p>No approvals yet.</p> : null}
          <ul className="cards">
            {items.map((item) => (
              <li key={item.id} className="card">
                <div className="card-top">
                  <strong>{item.title}</strong>
                  <span className={`risk risk-${item.risk}`}>{item.risk}</span>
                </div>
                <p>{item.summary}</p>
                <p className="change">{item.proposedChange}</p>
                <p>Status: {item.status}</p>
                {item.status === "pending" ? (
                  <div className="row-actions">
                    <button type="button" disabled={busy} onClick={() => void onRequest(item, "approve")}>
                      Approve
                    </button>
                    <button type="button" className="danger" disabled={busy} onClick={() => void onRequest(item, "deny")}>
                      Deny
                    </button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
          {pending ? (
            <div className="confirm">
              <h3>Confirm this exact change</h3>
              <pre>{pending.statement}</pre>
              <label>
                Note
                <input value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} />
              </label>
              <label className="check">
                <input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} />
                I confirm this exact statement.
              </label>
              <button type="button" disabled={busy} onClick={() => void onCommit()}>
                Commit decision
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <form
          className="form"
          onSubmit={(event) => {
            event.preventDefault();
            void onAuth("in");
          }}
        >
          <label>
            Email
            <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label>
            Password
            <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          <div className="row-actions">
            <button type="submit" disabled={busy}>
              Sign in
            </button>
            <button type="button" disabled={busy} onClick={() => void onAuth("up")}>
              Create account
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

async function refresh(
  client: SupabaseClient,
  apply: (items: LiveApproval[], message: string) => void,
): Promise<void> {
  const listed = await listMine(client);
  if (!listed.ok) {
    apply([], listed.message);
    return;
  }
  apply(listed.items, listed.items.length === 0 ? "No approvals yet." : "Queue loaded.");
}
