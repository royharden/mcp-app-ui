import { ToolName, UI_MIME, UI_RESOURCE_URI, uiMeta } from "../domain/constants.ts";
import { toolNamesFor } from "../domain/securityPolicy.ts";
import type { Audience } from "../domain/types.ts";

export interface ToolDescriptor {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties: false;
  };
  _meta: { ui: { resourceUri: string } };
}

export interface ResourceDescriptor {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

export function toolDescriptors(audience: Audience): ToolDescriptor[] {
  const allowed = new Set<string>(toolNamesFor(audience));
  return allTools().filter((tool) => allowed.has(tool.name));
}

export function resourceDescriptors(): ResourceDescriptor[] {
  return [
    {
      uri: UI_RESOURCE_URI,
      name: "Confirm Queue",
      description: "Approval form for a proposed write. The view must confirm the exact statement.",
      mimeType: UI_MIME,
    },
  ];
}

function allTools(): ToolDescriptor[] {
  const meta = uiMeta();
  return [
    {
      name: ToolName.listApprovals,
      description: "List approvals for the signed-in actor. Read only.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      _meta: meta,
    },
    {
      name: ToolName.getApproval,
      description: "Read one approval owned by the signed-in actor.",
      inputSchema: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
        additionalProperties: false,
      },
      _meta: meta,
    },
    {
      name: ToolName.requestDecision,
      description: "Mint a one-time confirmation for an approve or deny. App view only. Does not write.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string" },
          action: { type: "string", enum: ["approve", "deny"] },
        },
        required: ["id", "action"],
        additionalProperties: false,
      },
      _meta: meta,
    },
    {
      name: ToolName.commitDecision,
      description: "Commit a decision when the confirmation token and statement match. App view only.",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string" },
          action: { type: "string", enum: ["approve", "deny"] },
          token: { type: "string" },
          statement: { type: "string" },
          note: { type: "string" },
        },
        required: ["id", "action", "token", "statement"],
        additionalProperties: false,
      },
      _meta: meta,
    },
  ];
}
