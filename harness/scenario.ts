// Declarative scenarios: allowlisted actions only, no executable script, no destinations.
import { z } from "zod";
import {
  CategorySchema,
  DATASET_VERSION,
  DecisionSchema,
  QueryInputSchema,
  RequestIdSchema,
  RequesterSchema,
  RiskSchema,
  SortSchema,
  StatusSchema,
} from "../server/domain/schemas.ts";
import type { Clock, RandomSource } from "../server/domain/crypto.ts";
import { waitFor } from "./dom.ts";
import { renderInHarness, waitForReady, type RenderedView } from "./host.ts";
import { createRecorder, type Trace, type TraceIdentity } from "./recorder.ts";

const FilterAction = z
  .object({
    do: z.literal("filter"),
    field: z.enum(["Status", "Category", "Risk", "Requester", "Sort"]),
    value: z.union([StatusSchema, z.literal("all"), CategorySchema, RiskSchema, RequesterSchema, SortSchema, z.literal("")]),
  })
  .strict();

export const ActionSchema = z.discriminatedUnion("do", [
  z.object({ do: z.literal("connect") }).strict(),
  FilterAction,
  z.object({ do: z.literal("select"), id: RequestIdSchema }).strict(),
  z.object({ do: z.literal("prepare"), decision: DecisionSchema, reason: z.string().max(300) }).strict(),
  z.object({ do: z.literal("confirm") }).strict(),
  z.object({ do: z.literal("cancel") }).strict(),
  z.object({ do: z.literal("send") }).strict(),
  z.object({ do: z.literal("teardown") }).strict(),
  z.object({ do: z.literal("reset-session") }).strict(),
]);
export type Action = z.infer<typeof ActionSchema>;

export const ScenarioSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    description: z.string(),
    mode: z.enum(["realHandlers", "injectedFault"]),
    datasetVersion: z.literal(DATASET_VERSION),
    hostContext: z.record(z.unknown()),
    initialToolInput: QueryInputSchema,
    faults: z.array(z.enum(["submitTimeoutAfterCommit", "listTransportError"])),
    actions: z.array(ActionSchema).min(1),
    expected: z
      .object({
        statuses: z.record(StatusSchema).optional(),
        historyLengths: z.record(z.number().int()).optional(),
        outcome: z.enum(["recorded", "unknown", "failed", "none"]).optional(),
        statementShown: z.string().optional(),
        acceptedMessages: z.array(z.string()).optional(),
        /** ERR-01: a readable error is visible in the view (role="alert"). */
        visibleError: z.boolean().optional(),
      })
      .strict(),
  })
  .strict()
  .refine((s) => (s.mode === "realHandlers") === (s.faults.length === 0), {
    message: "realHandlers scenarios declare no faults; injectedFault scenarios declare at least one",
  });
export type Scenario = z.infer<typeof ScenarioSchema>;


export interface Observed {
  statuses: Record<string, string>;
  historyLengths: Record<string, number>;
  outcome: string;
  statementShown: string | null;
  acceptedMessages: string[];
  visibleError: boolean;
  /** Why some observations could not be taken (e.g. the frame was already torn down). */
  unavailable: string[];
}

export interface ScenarioRun {
  scenario: Scenario;
  trace: Trace;
  observed: Observed;
}

/**
 * A failed or blocked run. It still carries the finished trace and whatever could be observed,
 * so a blocked exact-bundle layer is recorded, not lost.
 */
export class ScenarioError extends Error {
  readonly run: ScenarioRun;

  constructor(message: string, run: ScenarioRun) {
    super(message);
    this.name = "ScenarioError";
    this.run = run;
  }
}

export interface RunOptions {
  viewHtml: string;
  identity: Omit<TraceIdentity, "scenarioId" | "mode" | "rawHtmlSha256" | "envelopeSha256">;
  clock?: Clock;
  random?: RandomSource;
}

export async function runScenario(input: unknown, options: RunOptions): Promise<ScenarioRun> {
  const scenario = ScenarioSchema.parse(input);
  const identity: TraceIdentity = {
    ...options.identity,
    scenarioId: scenario.id,
    mode: scenario.mode,
    rawHtmlSha256: null,
    envelopeSha256: null,
  };
  const recorder = createRecorder(identity);
  let rendered: RenderedView | null = null;
  let tornDown = false;
  let statementShown: string | null = null;
  let failure: string | null = null;

  const render = async () => {
    rendered = await renderInHarness({
      viewHtml: options.viewHtml,
      recorder,
      initialToolInput: scenario.initialToolInput,
      hostContext: scenario.hostContext,
      faults: scenario.faults,
      clock: options.clock,
      random: options.random,
    });
    tornDown = false;
    identity.rawHtmlSha256 = rendered.envelope.rawSha256;
    identity.envelopeSha256 = rendered.envelope.envelopeSha256;
    await waitForReady(rendered);
  };
  const current = (): RenderedView => {
    if (!rendered) throw new Error("Scenario action before connect.");
    if (tornDown) throw new Error("Scenario action after teardown.");
    return rendered;
  };
  // React may commit after the triggering event; wait for the control to be enabled first.
  const clickWhenEnabled = async (selector: string) => {
    const view = current().view;
    await waitFor(() => {
      const el = view.query<HTMLButtonElement>(selector);
      return el !== null && !el.disabled;
    }, `${selector} to be enabled`);
    view.click(selector);
  };

  try {
    for (const action of scenario.actions) {
      recorder.action(action.do, action.do === "prepare" ? { decision: action.decision } : { ...action });
      switch (action.do) {
        case "connect":
          await render();
          break;
        case "reset-session":
          if (rendered && !tornDown) await (rendered as RenderedView).close();
          rendered = null;
          await render();
          break;
        case "filter": {
          const view = current().view;
          const before = view.text(".count");
          const started = Date.now();
          view.setSelect(action.field, action.value);
          // Settled when the filters are enabled again and the count changed, an error is shown,
          // or 300 ms passed for a filter that leaves the count unchanged.
          await waitFor(
            () =>
              !view.query("form.filters select[disabled]") &&
              (view.text(".count") !== before || view.query('.queue [role="alert"]') !== null || Date.now() - started > 300),
            "the queue to settle",
          );
          break;
        }
        case "select": {
          const view = current().view;
          await clickWhenEnabled(`button[data-action="select"][data-id="${action.id}"]`);
          await waitFor(() => view.text("#detail-heading")?.trim() === action.id && view.query(".fields"), `detail for ${action.id}`);
          break;
        }
        case "prepare": {
          const view = current().view;
          view.chooseDecision(action.decision);
          view.setInput('input[name="reason"]', action.reason);
          await clickWhenEnabled('button[data-action="prepare"]');
          await waitFor(
            () => view.query('[role="dialog"] [data-field="statement"]') ?? view.query('.decide [role="alert"]'),
            "the confirmation dialog or a prepare error",
          );
          statementShown = view.text('[data-field="statement"]');
          break;
        }
        case "confirm": {
          const view = current().view;
          await clickWhenEnabled('button[data-action="confirm"]');
          await waitFor(() => view.query("[data-outcome]"), "a decision outcome", 15000);
          break;
        }
        case "cancel": {
          const view = current().view;
          await clickWhenEnabled('button[data-action="cancel"]');
          await waitFor(() => !view.query('[role="dialog"]'), "the dialog to close");
          break;
        }
        case "send": {
          const view = current().view;
          await clickWhenEnabled('button[data-action="tell-assistant"]');
          await waitFor(
            () => current().controller.getState().acceptedMessages.length > 0 || view.query(".outcome .error"),
            "the host to answer ui/message",
          );
          break;
        }
        case "teardown":
          await current().controller.teardown();
          tornDown = true;
          break;
      }
      if (recorder.overflow()) break;
    }
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
  }

  // Observe what can still be observed; never let an observation error replace the run's error.
  const r = rendered as RenderedView | null;
  const observed: Observed = {
    statuses: {},
    historyLengths: {},
    outcome: "none",
    statementShown,
    acceptedMessages: [],
    visibleError: false,
    unavailable: [],
  };
  if (r) {
    for (const row of r.repo.list()) {
      observed.statuses[row.id] = row.status;
      observed.historyLengths[row.id] = row.decisionHistory.length;
    }
    observed.acceptedMessages = [...r.controller.getState().acceptedMessages];
    if (tornDown) {
      observed.unavailable.push("view DOM (torn down by the scenario)");
    } else {
      try {
        observed.outcome = r.view.query("[data-outcome]")?.getAttribute("data-outcome") ?? "none";
        observed.visibleError = r.view.query('[role="alert"]') !== null;
      } catch (error) {
        observed.unavailable.push(`view DOM: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    try {
      await r.close();
    } catch (error) {
      observed.unavailable.push(`close: ${error instanceof Error ? error.message : String(error)}`);
    }
  } else {
    observed.unavailable.push("no rendered view");
  }

  const overflow = recorder.overflow();
  const terminal = overflow ? `failed: ${overflow}` : failure ? `failed: ${failure}` : "completed";
  const run: ScenarioRun = { scenario, trace: await recorder.finish(terminal), observed };
  if (terminal !== "completed") throw new ScenarioError(terminal, run);
  return run;
}
