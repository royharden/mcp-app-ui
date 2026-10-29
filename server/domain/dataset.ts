// The fixed synthetic dataset. Every Lab session and stdio process seeds a fresh copy.
import fixtureJson from "../../fixtures/approvals.v1.json" with { type: "json" };
import { FixtureSchema, type ApprovalRequest } from "./schemas.ts";

const fixture = FixtureSchema.parse(fixtureJson);

/** Deep copy of the seed rows; callers own the returned objects. */
export function seedRequests(): ApprovalRequest[] {
  return structuredClone(fixture.requests);
}

export const FIXTURE_PATH = "fixtures/approvals.v1.json";
