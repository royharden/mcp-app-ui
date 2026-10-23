import { confirmationStatement } from "./confirm.ts";
import { ToolName } from "./constants.ts";
import { rejectModelWrite, visibleTo } from "./securityPolicy.ts";
import { DEMO_OWNER, HIGH_RISK_TITLE, SEED_IDS, seedItems } from "./seed.ts";
import { ApprovalStore } from "./store.ts";
import { decisionText, failureText, listText, uiVisibleText } from "./textFallback.ts";

export type TaskId = "name-high-risk" | "approve-low-risk" | "deny-with-note";

export interface Trace {
  taskId: TaskId;
  mode: "ui" | "text";
  success: boolean;
  turns: number;
  characters: number;
  steps: string[];
}

export interface SideScore {
  success: boolean;
  turns: number;
  tokensEstimate: number;
  steps: string[];
}

export interface Comparison {
  taskId: TaskId;
  fairComparison: boolean;
  note: string;
  ui: SideScore;
  text: SideScore;
}

export interface MeasurementReport {
  comparisons: Comparison[];
  limits: string[];
}

export const LIMITS = [
  "These traces are scripted. They are not live model calls.",
  "Token counts are Math.ceil(characters / 4), not tokenizer output.",
  "The set has three tasks. That is not a statistical result.",
  "Write tasks fail on the text path because request_decision and commit_decision are app-only. That is an authorization result.",
  "Only name-high-risk is a fair efficiency comparison.",
  "No wall-clock time is measured.",
] as const;

const SCRIPT_NOW = "2026-10-23T15:00:00.000Z";

const DENY_NOTE = "Needs a narrower folder.";

export function tokensEstimate(characters: number): number {
  if (characters <= 0) {
    return 0;
  }
  return Math.ceil(characters / 4);
}

export function compareTraces(
  ui: Trace,
  text: Trace,
  fairComparison: boolean,
  note: string,
): Comparison {
  if (ui.taskId !== text.taskId) {
    throw new Error("Cannot compare traces from different tasks.");
  }
  if (ui.mode !== "ui" || text.mode !== "text") {
    throw new Error("Trace modes are reversed.");
  }
  return {
    taskId: ui.taskId,
    fairComparison,
    note,
    ui: score(ui),
    text: score(text),
  };
}

export function buildScriptedReport(now: string = SCRIPT_NOW): MeasurementReport {
  return {
    comparisons: [compareName(now), compareApprove(now), compareDeny(now)],
    limits: [...LIMITS],
  };
}

function score(trace: Trace): SideScore {
  return {
    success: trace.success,
    turns: trace.turns,
    tokensEstimate: tokensEstimate(trace.characters),
    steps: trace.steps,
  };
}

function compareName(now: string): Comparison {
  const store = new ApprovalStore(seedItems(), () => "unused-name");
  const listed = store.list(DEMO_OWNER);
  if (!listed.ok) {
    throw new Error(listed.message);
  }
  const textBody = listText(listed.value);
  const visible = uiVisibleText(listed.value);
  void now;
  const text: Trace = {
    taskId: "name-high-risk",
    mode: "text",
    success: textBody.includes(HIGH_RISK_TITLE) && textBody.includes("| high |"),
    turns: 1,
    characters: textBody.length,
    steps: [ToolName.listApprovals],
  };
  const ui: Trace = {
    taskId: "name-high-risk",
    mode: "ui",
    success: visible.includes(HIGH_RISK_TITLE),
    turns: 1,
    characters: visible.length,
    steps: ["render-list"],
  };
  return compareTraces(
    ui,
    text,
    true,
    "Both sides can name the high-risk item from one list. The UI count is the card labels only.",
  );
}

function compareApprove(now: string): Comparison {
  const textStore = new ApprovalStore(seedItems(), () => "unused-text-approve");
  const textList = textStore.list(DEMO_OWNER);
  if (!textList.ok) {
    throw new Error(textList.message);
  }
  const blocked = modelWriteAttempt(ToolName.commitDecision);
  const textBody = `${listText(textList.value)}\n${blocked}`;
  const text: Trace = {
    taskId: "approve-low-risk",
    mode: "text",
    success: false,
    turns: 2,
    characters: textBody.length,
    steps: [ToolName.listApprovals, `${ToolName.commitDecision}-blocked`],
  };

  const uiStore = new ApprovalStore(seedItems(), () => "token-ui-approve");
  const uiList = uiStore.list(DEMO_OWNER);
  if (!uiList.ok) {
    throw new Error(uiList.message);
  }
  const requested = uiStore.requestDecision(DEMO_OWNER, SEED_IDS.low, "approve", now);
  if (!requested.ok) {
    throw new Error(requested.message);
  }
  const committed = uiStore.commit({
    actorId: DEMO_OWNER,
    approvalId: SEED_IDS.low,
    action: "approve",
    token: requested.value.token,
    statement: requested.value.statement,
    note: "",
    now,
  });
  const uiBody = `${uiVisibleText(uiList.value)}\n${requested.value.statement}\n${
    committed.ok ? decisionText(committed.value) : failureText(committed)
  }`;
  const ui: Trace = {
    taskId: "approve-low-risk",
    mode: "ui",
    success: committed.ok,
    turns: 3,
    characters: uiBody.length,
    steps: ["render-list", ToolName.requestDecision, ToolName.commitDecision],
  };
  return compareTraces(
    ui,
    text,
    false,
    "The text path cannot call commit_decision. Failure there is the authorization boundary.",
  );
}

function compareDeny(now: string): Comparison {
  const textStore = new ApprovalStore(seedItems(), () => "unused-text-deny");
  const textList = textStore.list(DEMO_OWNER);
  if (!textList.ok) {
    throw new Error(textList.message);
  }
  const blocked = modelWriteAttempt(ToolName.requestDecision);
  const textBody = `${listText(textList.value)}\n${blocked}`;
  const text: Trace = {
    taskId: "deny-with-note",
    mode: "text",
    success: false,
    turns: 2,
    characters: textBody.length,
    steps: [ToolName.listApprovals, `${ToolName.requestDecision}-blocked`],
  };

  const uiStore = new ApprovalStore(seedItems(), () => "token-ui-deny");
  const requested = uiStore.requestDecision(DEMO_OWNER, SEED_IDS.medium, "deny", now);
  if (!requested.ok) {
    throw new Error(requested.message);
  }
  const committed = uiStore.commit({
    actorId: DEMO_OWNER,
    approvalId: SEED_IDS.medium,
    action: "deny",
    token: requested.value.token,
    statement: requested.value.statement,
    note: DENY_NOTE,
    now,
  });
  const expected = confirmationStatement(
    { title: "Export support tickets", proposedChange: "Write a CSV of ticket ids, subjects, and statuses to the audit folder." },
    "deny",
  );
  const deniedCleanly =
    committed.ok && committed.value.note === DENY_NOTE && committed.value.statement === expected;
  const ui: Trace = {
    taskId: "deny-with-note",
    mode: "ui",
    success: deniedCleanly,
    turns: 3,
    characters: `${requested.value.statement}\n${DENY_NOTE}`.length,
    steps: ["render-list", ToolName.requestDecision, ToolName.commitDecision],
  };
  return compareTraces(
    ui,
    text,
    false,
    "The text path cannot start a denial. The UI path records the note only after the token matches.",
  );
}

function modelWriteAttempt(toolName: string): string {
  if (visibleTo("model", toolName)) {
    throw new Error(`${toolName} should be hidden from the model.`);
  }
  const rejected = rejectModelWrite(toolName);
  if (rejected.ok) {
    throw new Error("Model write rejection returned success.");
  }
  return failureText(rejected);
}
