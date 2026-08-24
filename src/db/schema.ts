import { relations } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

export const demoUsers = sqliteTable(
  "demo_users",
  {
    id: text("id").primaryKey(),
    username: text("username").notNull(),
    passwordHash: text("password_hash").notNull(),
    persona: text("persona", {
      enum: ["NEW_MEMBER", "EXISTING_MEMBER"],
    }).notNull(),
    displayName: text("display_name").notNull(),
  },
  (table) => [uniqueIndex("demo_users_username_idx").on(table.username)],
);

export const demoRuns = sqliteTable(
  "demo_runs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => demoUsers.id, { onDelete: "restrict" }),
    persona: text("persona", {
      enum: ["NEW_MEMBER", "EXISTING_MEMBER"],
    }).notNull(),
    status: text("status", { enum: ["ACTIVE", "DISPOSED"] }).notNull(),
    createdAt: text("created_at").notNull(),
    expiresAt: text("expires_at").notNull(),
  },
  (table) => [
    index("demo_runs_user_id_idx").on(table.userId),
    index("demo_runs_created_at_idx").on(table.createdAt),
  ],
);

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => demoUsers.id, { onDelete: "restrict" }),
    demoRunId: text("demo_run_id")
      .notNull()
      .references(() => demoRuns.id, { onDelete: "cascade" }),
    expiresAt: text("expires_at").notNull(),
  },
  (table) => [
    index("sessions_user_id_idx").on(table.userId),
    index("sessions_demo_run_id_idx").on(table.demoRunId),
  ],
);

export const memberProfiles = sqliteTable("member_profiles", {
  demoRunId: text("demo_run_id")
    .primaryKey()
    .references(() => demoRuns.id, { onDelete: "cascade" }),
  uan: text("uan").notNull(),
  aadhaarName: text("aadhaar_name").notNull(),
  bankName: text("bank_name").notNull(),
  panName: text("pan_name").notNull(),
  dateOfBirth: text("date_of_birth").notNull(),
  mobileMasked: text("mobile_masked").notNull(),
  onboardingComplete: integer("onboarding_complete", {
    mode: "boolean",
  }).notNull(),
});

export const onboardingDrafts = sqliteTable("onboarding_drafts", {
  demoRunId: text("demo_run_id")
    .primaryKey()
    .references(() => demoRuns.id, { onDelete: "cascade" }),
  currentStep: integer("current_step").notNull(),
  disclosureAccepted: integer("disclosure_accepted", { mode: "boolean" }).notNull(),
  valuesJson: text("values_json").notNull(),
  uanMasked: text("uan_masked"),
  mobileMasked: text("mobile_masked"),
  memberIdMasked: text("member_id_masked"),
  panMasked: text("pan_masked"),
  bankAccountMasked: text("bank_account_masked"),
  updatedAt: text("updated_at").notNull(),
});

export const simulationEvents = sqliteTable(
  "simulation_events",
  {
    id: text("id").primaryKey(),
    demoRunId: text("demo_run_id")
      .notNull()
      .references(() => demoRuns.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["TIME_ADVANCE"] }).notNull(),
    intervalStart: text("interval_start").notNull(),
    intervalEnd: text("interval_end").notNull(),
    intervalLabel: text("interval_label").notNull(),
    months: integer("months").notNull(),
    recordedAt: text("recorded_at").notNull(),
  },
  (table) => [index("simulation_events_demo_run_id_idx").on(table.demoRunId)],
);

export const kycRecords = sqliteTable(
  "kyc_records",
  {
    id: text("id").primaryKey(),
    demoRunId: text("demo_run_id")
      .notNull()
      .references(() => demoRuns.id, { onDelete: "cascade" }),
    type: text("type", {
      enum: ["AADHAAR", "PAN", "BANK"],
    }).notNull(),
    valueMasked: text("value_masked").notNull(),
    status: text("status", {
      enum: ["NOT_STARTED", "PENDING", "VERIFIED", "MISMATCH"],
    }).notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("kyc_records_demo_run_id_idx").on(table.demoRunId)],
);

export const employments = sqliteTable(
  "employments",
  {
    id: text("id").primaryKey(),
    demoRunId: text("demo_run_id")
      .notNull()
      .references(() => demoRuns.id, { onDelete: "cascade" }),
    memberId: text("member_id").notNull(),
    establishmentName: text("establishment_name").notNull(),
    joinedAt: text("joined_at").notNull(),
    exitedAt: text("exited_at"),
    epfMember: integer("epf_member", { mode: "boolean" }).notNull(),
    epsMember: integer("eps_member", { mode: "boolean" }).notNull(),
  },
  (table) => [index("employments_demo_run_id_idx").on(table.demoRunId)],
);

export const contributions = sqliteTable(
  "contributions",
  {
    id: text("id").primaryKey(),
    employmentId: text("employment_id")
      .notNull()
      .references(() => employments.id, { onDelete: "cascade" }),
    wageMonth: text("wage_month").notNull(),
    employeeEpf: integer("employee_epf").notNull(),
    employerEpf: integer("employer_epf").notNull(),
    employerEps: integer("employer_eps").notNull(),
    postingStatus: text("posting_status", {
      enum: ["POSTED", "MISSING", "DELAYED"],
    }).notNull(),
  },
  (table) => [index("contributions_employment_id_idx").on(table.employmentId)],
);

export const claims = sqliteTable(
  "claims",
  {
    id: text("id").primaryKey(),
    demoRunId: text("demo_run_id")
      .notNull()
      .references(() => demoRuns.id, { onDelete: "cascade" }),
    type: text("type", { enum: ["FINAL_SETTLEMENT"] }).notNull(),
    amount: integer("amount").notNull(),
    status: text("status", {
      enum: [
        "DRAFT",
        "SUBMITTED",
        "UNDER_REVIEW",
        "APPROVED",
        "PAYMENT_SENT",
        "SETTLED",
        "REJECTED",
        "PAYMENT_RETURNED",
      ],
    }).notNull(),
    submittedAt: text("submitted_at"),
    idempotencyKey: text("idempotency_key"),
  },
  (table) => [
    index("claims_demo_run_id_idx").on(table.demoRunId),
    uniqueIndex("claims_idempotency_key_idx").on(table.idempotencyKey),
  ],
);

export const claimEvents = sqliteTable(
  "claim_events",
  {
    id: text("id").primaryKey(),
    claimId: text("claim_id")
      .notNull()
      .references(() => claims.id, { onDelete: "cascade" }),
    status: text("status", {
      enum: [
        "DRAFT",
        "SUBMITTED",
        "UNDER_REVIEW",
        "APPROVED",
        "PAYMENT_SENT",
        "SETTLED",
        "REJECTED",
        "PAYMENT_RETURNED",
      ],
    }).notNull(),
    actor: text("actor", {
      enum: ["MEMBER", "EMPLOYER", "EPFO", "BANK", "AADHAAR"],
    }).notNull(),
    explanation: text("explanation").notNull(),
    occurredAt: text("occurred_at").notNull(),
  },
  (table) => [index("claim_events_claim_id_idx").on(table.claimId)],
);

export const serviceRequests = sqliteTable(
  "service_requests",
  {
    id: text("id").primaryKey(),
    demoRunId: text("demo_run_id")
      .notNull()
      .references(() => demoRuns.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    owner: text("owner", {
      enum: ["MEMBER", "EMPLOYER", "EPFO", "BANK", "AADHAAR"],
    }).notNull(),
    status: text("status", {
      enum: ["OPEN", "IN_PROGRESS", "RESOLVED"],
    }).notNull(),
    createdAt: text("created_at").notNull(),
    resolvedAt: text("resolved_at"),
  },
  (table) => [index("service_requests_demo_run_id_idx").on(table.demoRunId)],
);

export const externalAdapterEvents = sqliteTable(
  "external_adapter_events",
  {
    id: text("id").primaryKey(),
    demoRunId: text("demo_run_id")
      .notNull()
      .references(() => demoRuns.id, { onDelete: "cascade" }),
    actor: text("actor", {
      enum: ["EMPLOYER", "EPFO", "BANK", "AADHAAR"],
    }).notNull(),
    eventType: text("event_type").notNull(),
    previousStateJson: text("previous_state_json").notNull(),
    newStateJson: text("new_state_json").notNull(),
    explanation: text("explanation").notNull(),
    simulated: integer("simulated", { mode: "boolean" }).notNull(),
    recordedAt: text("recorded_at").notNull(),
  },
  (table) => [index("external_adapter_events_demo_run_id_idx").on(table.demoRunId)],
);

export const scenarioRuns = sqliteTable(
  "scenario_runs",
  {
    id: text("id").primaryKey(),
    demoRunId: text("demo_run_id")
      .notNull()
      .references(() => demoRuns.id, { onDelete: "cascade" }),
    scenarioKey: text("scenario_key", {
      enum: [
        "ONBOARDING_NAME_MISMATCH",
        "MISSING_CONTRIBUTION",
        "MISSING_EXIT_DATE",
        "CLAIM_BANK_NAME_MISMATCH",
        "CRYPTIC_CLAIM_STATUS",
        "PAYMENT_RETURNED",
      ],
    }).notNull(),
    stage: text("stage", {
      enum: ["START", "ISSUE_LOADED", "ACTION_REQUESTED", "RESOLVED", "COMPLETE"],
    }).notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("scenario_runs_demo_run_id_idx").on(table.demoRunId)],
);

export const conversationMessages = sqliteTable(
  "conversation_messages",
  {
    id: text("id").primaryKey(),
    demoRunId: text("demo_run_id")
      .notNull()
      .references(() => demoRuns.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["member", "assistant", "system"] }).notNull(),
    content: text("content").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("conversation_messages_demo_run_id_idx").on(table.demoRunId),
  ],
);

export const demoUsersRelations = relations(demoUsers, ({ many }) => ({
  runs: many(demoRuns),
  sessions: many(sessions),
}));

export const demoRunsRelations = relations(demoRuns, ({ one, many }) => ({
  user: one(demoUsers, {
    fields: [demoRuns.userId],
    references: [demoUsers.id],
  }),
  sessions: many(sessions),
  profile: one(memberProfiles),
  onboardingDraft: one(onboardingDrafts),
  simulationEvents: many(simulationEvents),
  kycRecords: many(kycRecords),
  employments: many(employments),
  claims: many(claims),
  serviceRequests: many(serviceRequests),
  externalAdapterEvents: many(externalAdapterEvents),
  scenarioRuns: many(scenarioRuns),
  conversationMessages: many(conversationMessages),
}));

export const employmentsRelations = relations(employments, ({ many }) => ({
  contributions: many(contributions),
}));

export const claimsRelations = relations(claims, ({ many }) => ({
  events: many(claimEvents),
}));
