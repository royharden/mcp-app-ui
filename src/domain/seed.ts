import type { ApprovalItem } from "./types.ts";

export const DEMO_OWNER = "owner-demo";

export const SEED_IDS = {
  high: "apr-high",
  medium: "apr-med",
  low: "apr-low",
} as const;

export const HIGH_RISK_TITLE = "Grant production database read";

export const LOW_RISK_TITLE = "Rename the sandbox label";

export function seedItems(): ApprovalItem[] {
  return [
    {
      id: SEED_IDS.high,
      ownerId: DEMO_OWNER,
      title: HIGH_RISK_TITLE,
      requester: "Ops bot",
      summary: "A contractor asked for read access to the production database for a weekend audit.",
      proposedChange: "Add a read-only role expiring Monday 09:00 America/New_York.",
      risk: "high",
      status: "pending",
      createdAt: "2026-10-23T14:00:00.000Z",
    },
    {
      id: SEED_IDS.medium,
      ownerId: DEMO_OWNER,
      title: "Export support tickets",
      requester: "Support lead",
      summary: "Export last quarter's support tickets to a shared folder.",
      proposedChange: "Write a CSV of ticket ids, subjects, and statuses to the audit folder.",
      risk: "medium",
      status: "pending",
      createdAt: "2026-10-23T14:05:00.000Z",
    },
    {
      id: SEED_IDS.low,
      ownerId: DEMO_OWNER,
      title: LOW_RISK_TITLE,
      requester: "Platform",
      summary: "The sandbox project label is still the placeholder.",
      proposedChange: "Rename the sandbox project label from Demo to Sandbox.",
      risk: "low",
      status: "pending",
      createdAt: "2026-10-23T14:10:00.000Z",
    },
  ];
}
