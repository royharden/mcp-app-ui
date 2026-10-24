// Runtime contracts shared by the server handlers, the view and the harness.
// Pure module: no Node or DOM imports, so the browser bundles can use it.
import { z } from "zod";

export const SCHEMA_VERSION = 1 as const;
export const DATASET_VERSION = "approvals-v1" as const;

export const STATUSES = ["pending", "approved", "rejected"] as const;
export const DECISIONS = ["approve", "reject"] as const;
export const CATEGORIES = ["equipment", "software", "travel"] as const;
export const RISKS = ["low", "medium", "high"] as const;
export const REQUESTERS = ["R01", "R02", "R03", "R04", "R05"] as const;
export const SORTS = ["submittedAsc", "riskDesc", "amountDesc", "idAsc"] as const;

export const MAX_OFFSET = 1000;
export const MAX_PAGE_SIZE = 25;
export const DEFAULT_PAGE_SIZE = 10;

export const StatusSchema = z.enum(STATUSES);
export const DecisionSchema = z.enum(DECISIONS);
export const CategorySchema = z.enum(CATEGORIES);
export const RiskSchema = z.enum(RISKS);
export const RequesterSchema = z.enum(REQUESTERS);
export const SortSchema = z.enum(SORTS);
export const RequestIdSchema = z.string().regex(/^REQ-\d{3}$/, "Expected a canonical id such as REQ-104.");

export type Status = z.infer<typeof StatusSchema>;
export type Decision = z.infer<typeof DecisionSchema>;
export type Category = z.infer<typeof CategorySchema>;
export type Risk = z.infer<typeof RiskSchema>;
export type Sort = z.infer<typeof SortSchema>;

// "all" is the one addition to the plan's enum: without it decided rows are unreachable by filter.
export const StatusFilterSchema = z.enum(["pending", "approved", "rejected", "all"]);
export type StatusFilter = z.infer<typeof StatusFilterSchema>;

export const DecisionRecordSchema = z
  .object({
    decision: DecisionSchema,
    reason: z.string(),
    decidedAt: z.string(),
    fromVersion: z.number().int(),
    toVersion: z.number().int(),
  })
  .strict();
export type DecisionRecord = z.infer<typeof DecisionRecordSchema>;

export const ApprovalRequestSchema = z
  .object({
    id: RequestIdSchema,
    title: z.string(),
    description: z.string(),
    requesterId: RequesterSchema,
    category: CategorySchema,
    risk: RiskSchema,
    amountCents: z.number().int().nonnegative(),
    currency: z.literal("USD"),
    submittedAt: z.string(),
    status: StatusSchema,
    version: z.number().int().positive(),
    decisionHistory: z.array(DecisionRecordSchema),
  })
  .strict();
export type ApprovalRequest = z.infer<typeof ApprovalRequestSchema>;

export const FixtureSchema = z
  .object({
    schemaVersion: z.literal(1),
    datasetVersion: z.literal(DATASET_VERSION),
    note: z.string(),
    requests: z.array(ApprovalRequestSchema),
  })
  .strict();
export type Fixture = z.infer<typeof FixtureSchema>;

// ---- Tool inputs. Unknown properties are rejected (strict objects). ----

export const QueryInputSchema = z
  .object({
    status: StatusFilterSchema.optional(),
    category: CategorySchema.optional(),
    risk: RiskSchema.optional(),
    requesterId: RequesterSchema.optional(),
    sort: SortSchema.optional(),
    offset: z.number().int().min(0).max(MAX_OFFSET).optional(),
    pageSize: z.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
    datasetVersion: z.literal(DATASET_VERSION).optional(),
  })
  .strict();
export type QueryInput = z.infer<typeof QueryInputSchema>;

export interface NormalizedQuery {
  status: StatusFilter;
  category: Category | null;
  risk: Risk | null;
  requesterId: (typeof REQUESTERS)[number] | null;
  sort: Sort;
  offset: number;
  pageSize: number;
  datasetVersion: typeof DATASET_VERSION;
}

export const GetApprovalInputSchema = z.object({ id: RequestIdSchema }).strict();
export type GetApprovalInput = z.infer<typeof GetApprovalInputSchema>;

export const PrepareDecisionInputSchema = z
  .object({
    id: RequestIdSchema,
    decision: DecisionSchema,
    // Length and character rules are applied by normalizeReason so the error code is stable.
    reason: z.string().max(2000),
  })
  .strict();
export type PrepareDecisionInput = z.infer<typeof PrepareDecisionInputSchema>;

export const SubmitDecisionInputSchema = z
  .object({
    id: RequestIdSchema,
    decision: DecisionSchema,
    nonce: z.string().min(1).max(128),
    statement: z.string().min(1).max(4000),
  })
  .strict();
export type SubmitDecisionInput = z.infer<typeof SubmitDecisionInputSchema>;

// ---- Tool outputs (structuredContent). Versioned, tagged by `kind`. ----

const RowSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    titleTruncated: z.boolean(),
    requesterId: z.string(),
    category: CategorySchema,
    risk: RiskSchema,
    amountCents: z.number().int(),
    amountText: z.string(),
    currency: z.literal("USD"),
    submittedAt: z.string(),
    status: StatusSchema,
    version: z.number().int(),
  })
  .strict();
export type QueueRow = z.infer<typeof RowSchema>;

const CategoryCountsSchema = z
  .object({ equipment: z.number().int(), software: z.number().int(), travel: z.number().int() })
  .strict();
const RiskCountsSchema = z.object({ low: z.number().int(), medium: z.number().int(), high: z.number().int() }).strict();

export const QueueOutputShape = {
  kind: z.literal("approval-queue"),
  schemaVersion: z.literal(SCHEMA_VERSION),
  datasetVersion: z.literal(DATASET_VERSION),
  query: z
    .object({
      status: StatusFilterSchema,
      category: CategorySchema.nullable(),
      risk: RiskSchema.nullable(),
      requesterId: RequesterSchema.nullable(),
      sort: SortSchema,
      offset: z.number().int(),
      pageSize: z.number().int(),
      datasetVersion: z.literal(DATASET_VERSION),
    })
    .strict(),
  total: z.number().int(),
  nextOffset: z.number().int().nullable(),
  rows: z.array(RowSchema),
  facets: z
    .object({
      category: CategoryCountsSchema,
      risk: RiskCountsSchema,
    })
    .strict(),
};
export const QueueOutputSchema = z.object(QueueOutputShape).strict();
export type QueueOutput = z.infer<typeof QueueOutputSchema>;

export const DetailShape = {
  kind: z.literal("approval-detail"),
  schemaVersion: z.literal(SCHEMA_VERSION),
  datasetVersion: z.literal(DATASET_VERSION),
  request: RowSchema.extend({
    description: z.string(),
    descriptionTruncated: z.boolean(),
    decisionHistory: z.array(DecisionRecordSchema),
  }).strict(),
};
export const DetailOutputSchema = z.object(DetailShape).strict();
export type DetailOutput = z.infer<typeof DetailOutputSchema>;

export const PrepareOutputShape = {
  kind: z.literal("decision-prepared"),
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: z.string(),
  decision: DecisionSchema,
  requestVersion: z.number().int(),
  reason: z.string(),
  statement: z.string(),
  nonce: z.string(),
  expiresAt: z.string(),
};
export const PrepareOutputSchema = z.object(PrepareOutputShape).strict();
export type PrepareOutput = z.infer<typeof PrepareOutputSchema>;

export const SubmitOutputShape = {
  kind: z.literal("decision-recorded"),
  schemaVersion: z.literal(SCHEMA_VERSION),
  id: z.string(),
  decision: DecisionSchema,
  status: StatusSchema,
  version: z.number().int(),
  record: DecisionRecordSchema,
};
export const SubmitOutputSchema = z.object(SubmitOutputShape).strict();
export type SubmitOutput = z.infer<typeof SubmitOutputSchema>;

export const ErrorOutputSchema = z
  .object({
    kind: z.literal("error"),
    schemaVersion: z.literal(SCHEMA_VERSION),
    code: z.string(),
    message: z.string(),
  })
  .strict();
export type ErrorOutput = z.infer<typeof ErrorOutputSchema>;
