import { ToolName, type ToolNameValue } from "./constants.ts";
import { ErrorCodes } from "./errors.ts";
import { failure } from "./confirm.ts";
import type { Audience, Failure } from "./types.ts";

export interface FramePolicy {
  sandboxAttribute: string;
  sandboxOrigin: string;
  hostOrigin: string;
  csp: string;
}

const FORBIDDEN_SANDBOX = [
  "allow-top-navigation",
  "allow-top-navigation-by-user-activation",
  "allow-top-navigation-to-custom-protocols",
  "allow-same-origin",
  "allow-popups",
  "allow-popups-to-escape-sandbox",
  "allow-modals",
  "allow-downloads",
];

const KNOWN_TOOLS = new Set<string>(Object.values(ToolName));

const APP_ONLY = new Set<string>([ToolName.requestDecision, ToolName.commitDecision]);

export const RESOURCE_CSP =
  "default-src 'none'; connect-src 'none'; img-src 'none'; font-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'";

export const OUTER_SANDBOX = "allow-scripts";

export const DEMO_SANDBOX_ORIGIN = "https://sandbox.confirm-queue.invalid";

export const DEMO_HOST_ORIGIN = "https://host.confirm-queue.invalid";

export function recommendedPolicy(): FramePolicy {
  return {
    sandboxAttribute: OUTER_SANDBOX,
    sandboxOrigin: DEMO_SANDBOX_ORIGIN,
    hostOrigin: DEMO_HOST_ORIGIN,
    csp: RESOURCE_CSP,
  };
}

export function checkFramePolicy(policy: FramePolicy): { ok: true } | { ok: false; failures: string[] } {
  const failures: string[] = [];
  const tokens = policy.sandboxAttribute.split(/\s+/).filter((token) => token.length > 0);
  if (!tokens.includes("allow-scripts")) {
    failures.push("Outer sandbox must include allow-scripts.");
  }
  for (const token of tokens) {
    if (FORBIDDEN_SANDBOX.includes(token)) {
      failures.push(`Outer sandbox must not include ${token}.`);
    }
  }
  const sandbox = parseOrigin(policy.sandboxOrigin);
  const host = parseOrigin(policy.hostOrigin);
  if (!sandbox) {
    failures.push("Sandbox origin must be an http or https origin with no path.");
  }
  if (!host) {
    failures.push("Host origin must be an http or https origin with no path.");
  }
  if (sandbox && host && sandbox === host) {
    failures.push("Sandbox origin must differ from the host origin.");
  }
  if (!policy.csp.includes("default-src 'none'")) {
    failures.push("CSP must set default-src 'none'.");
  }
  if (!policy.csp.includes("connect-src 'none'")) {
    failures.push("CSP must set connect-src 'none'.");
  }
  if (policy.csp.includes("*") || /https?:\/\//.test(policy.csp)) {
    failures.push("CSP must not allow a wildcard or an external URL.");
  }
  return failures.length === 0 ? { ok: true } : { ok: false, failures };
}

export function sourceAllowed(sourceOrigin: string, sandboxOrigin: string): boolean {
  return sourceOrigin.length > 0 && sourceOrigin === sandboxOrigin;
}

export function hostMayPush(viewInitialized: boolean): boolean {
  return viewInitialized;
}

export function visibleTo(audience: Audience, toolName: string): boolean {
  if (!KNOWN_TOOLS.has(toolName)) {
    return false;
  }
  if (audience === "app") {
    return true;
  }
  return !APP_ONLY.has(toolName);
}

export function toolNamesFor(audience: Audience): ToolNameValue[] {
  return (Object.values(ToolName) as ToolNameValue[]).filter((name) => visibleTo(audience, name));
}

export function rejectModelWrite(toolName: string): Failure {
  return failure(
    ErrorCodes.appToolForbidden,
    `${toolName} is available only to the Confirm Queue view, not to the model.`,
  );
}

function parseOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.origin !== value) {
      return null;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}
