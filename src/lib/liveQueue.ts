import type { SupabaseClient } from "@supabase/supabase-js";
import type { ApprovalStatus, DecisionAction, Risk } from "../domain/types.ts";
import type { PublicConfig } from "./supabase.ts";

export interface LiveApproval {
  id: string;
  ownerId: string;
  title: string;
  requester: string;
  summary: string;
  proposedChange: string;
  risk: Risk;
  status: ApprovalStatus;
  createdAt: string;
}

export interface NewApproval {
  title: string;
  requester: string;
  summary: string;
  proposedChange: string;
  risk: Risk;
}

export type DecisionBody =
  | { step: "request"; approvalId: string; action: DecisionAction }
  | {
      step: "commit";
      approvalId: string;
      action: DecisionAction;
      token: string;
      statement: string;
      note: string;
    };

export type DecisionPayload =
  | {
      ok: true;
      text: string;
      statement?: string;
      token?: string;
      expiresAt?: string;
      status?: string;
    }
  | { ok: false; error: string; message: string };

export type AuthResult = { ok: true; needsConfirmation: boolean } | { ok: false; message: string };

export async function signIn(client: SupabaseClient, email: string, password: string): Promise<AuthResult> {
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    return { ok: false, message: error.message };
  }
  return { ok: true, needsConfirmation: false };
}

export async function signUp(client: SupabaseClient, email: string, password: string): Promise<AuthResult> {
  const { data, error } = await client.auth.signUp({ email, password });
  if (error) {
    return { ok: false, message: error.message };
  }
  return { ok: true, needsConfirmation: !data.session };
}

export async function signOut(client: SupabaseClient): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error } = await client.auth.signOut();
  if (error) {
    return { ok: false, message: error.message };
  }
  return { ok: true };
}

export async function listMine(
  client: SupabaseClient,
): Promise<{ ok: true; items: LiveApproval[] } | { ok: false; message: string }> {
  const { data, error } = await client
    .from("approvals")
    .select("id, owner_id, title, requester, summary, proposed_change, risk, status, created_at")
    .order("created_at", { ascending: false });
  if (error) {
    return { ok: false, message: error.message };
  }
  const items: LiveApproval[] = [];
  for (const row of data ?? []) {
    const mapped = mapRow(row);
    if (!mapped) {
      return { ok: false, message: "The queue returned a row this page cannot read." };
    }
    items.push(mapped);
  }
  return { ok: true, items };
}

export async function createApproval(
  client: SupabaseClient,
  userId: string,
  input: NewApproval,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const { error } = await client.from("approvals").insert({
    owner_id: userId,
    title: input.title,
    requester: input.requester,
    summary: input.summary,
    proposed_change: input.proposedChange,
    risk: input.risk,
  });
  if (error) {
    return { ok: false, message: error.message };
  }
  return { ok: true };
}

export async function postDecision(
  config: PublicConfig,
  accessToken: string,
  body: DecisionBody,
): Promise<DecisionPayload> {
  if (!accessToken) {
    return {
      ok: false,
      error: "unauthenticated",
      message: "Sign in is required before a decision can be requested.",
    };
  }
  let response: Response;
  try {
    response = await fetch(`${config.url}/functions/v1/approval-decision`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: config.anonKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch {
    return {
      ok: false,
      error: "missing_config",
      message: "The decision function could not be reached. Check the project URL and network.",
    };
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return {
      ok: false,
      error: "invalid_input",
      message: `The decision function returned HTTP ${response.status} without JSON.`,
    };
  }
  if (isSuccessPayload(payload) && response.ok) {
    return payload;
  }
  if (isErrorPayload(payload)) {
    return payload;
  }
  return {
    ok: false,
    error: "invalid_input",
    message: `The decision function returned HTTP ${response.status}.`,
  };
}

function mapRow(row: unknown): LiveApproval | null {
  if (!row || typeof row !== "object") {
    return null;
  }
  const record = row as Record<string, unknown>;
  const risk = record.risk;
  const status = record.status;
  if (!isRisk(risk) || !isStatus(status)) {
    return null;
  }
  if (
    typeof record.id !== "string" ||
    typeof record.owner_id !== "string" ||
    typeof record.title !== "string" ||
    typeof record.requester !== "string" ||
    typeof record.summary !== "string" ||
    typeof record.proposed_change !== "string" ||
    typeof record.created_at !== "string"
  ) {
    return null;
  }
  return {
    id: record.id,
    ownerId: record.owner_id,
    title: record.title,
    requester: record.requester,
    summary: record.summary,
    proposedChange: record.proposed_change,
    risk,
    status,
    createdAt: record.created_at,
  };
}

function isRisk(value: unknown): value is Risk {
  return value === "low" || value === "medium" || value === "high";
}

function isStatus(value: unknown): value is ApprovalStatus {
  return value === "pending" || value === "approved" || value === "denied";
}

function isSuccessPayload(value: unknown): value is Extract<DecisionPayload, { ok: true }> {
  return Boolean(value && typeof value === "object" && "ok" in value && value.ok === true && "text" in value && typeof value.text === "string");
}

function isErrorPayload(value: unknown): value is Extract<DecisionPayload, { ok: false }> {
  return Boolean(
    value &&
      typeof value === "object" &&
      "ok" in value &&
      value.ok === false &&
      "error" in value &&
      typeof value.error === "string" &&
      "message" in value &&
      typeof value.message === "string",
  );
}
