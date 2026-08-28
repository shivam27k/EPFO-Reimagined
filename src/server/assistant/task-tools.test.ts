import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { createDemoRun } from "@/db/demo-runs";
import { claimEvents, claims, contributions, employments, kycRecords, memberProfiles, simulationEvents, serviceRequests } from "@/db/schema";
import { DEMO_CREDENTIALS, seedAllDemoUsers } from "@/db/seed-data";
import { assistantToolDefinitions, parseAssistantToolCall, toolResultSchema, type AssistantToolCall, type ExecutionContext } from "@/domain/assistant-tools";
import { createIsolatedTestDatabase, type IsolatedTestDatabase } from "@/test/factories";
import { executeReadTool } from "./task-tools";

function keys(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(keys);
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) => [key, ...keys(child)]);
}

describe("grounded read tools with isolated records", () => {
  let database: IsolatedTestDatabase;
  let context: ExecutionContext;
  let otherRun: string;
  const read = (name: string, args: unknown = {}) => executeReadTool(parseAssistantToolCall(name, args), context);

  beforeEach(async () => {
    database = await createIsolatedTestDatabase();
    await seedAllDemoUsers();
    const demoRunId = await createDemoRun(DEMO_CREDENTIALS.existingMember.id);
    otherRun = await createDemoRun(DEMO_CREDENTIALS.existingMember.id);
    context = { demoRunId, callId: "call-1", turnId: "turn-1", route: "/claims" };
    const db = getDb();
    const employmentId = `${demoRunId}:employment:current`;
    await db.delete(contributions).where(eq(contributions.employmentId, employmentId));
    await db.insert(contributions).values([
      { id: `${demoRunId}:jan`, employmentId, wageMonth: "2026-01", employeeEpf: 216000, employerEpf: 66600, employerEps: 149400, postingStatus: "POSTED" },
      { id: `${demoRunId}:feb`, employmentId, wageMonth: "2026-02", employeeEpf: 216000, employerEpf: 66600, employerEps: 149400, postingStatus: "MISSING" },
      { id: `${demoRunId}:mar`, employmentId, wageMonth: "2026-03", employeeEpf: 216000, employerEpf: 66600, employerEps: 149400, postingStatus: "DELAYED" },
      { id: `${demoRunId}:apr`, employmentId, wageMonth: "2026-04", employeeEpf: 10000, employerEpf: 5000, employerEps: 100000, postingStatus: "POSTED" },
    ]);
    await db.update(claims).set({ amount: 12_345_600 }).where(eq(claims.demoRunId, demoRunId));
    await db.update(memberProfiles).set({ aadhaarName: "FOREIGN PROFILE", uan: "9999 9999 9999" }).where(eq(memberProfiles.demoRunId, otherRun));
    await db.update(employments).set({ establishmentName: "FOREIGN EMPLOYER" }).where(eq(employments.demoRunId, otherRun));
    await db.update(claims).set({ status: "PAYMENT_RETURNED", amount: 99_999_900 }).where(eq(claims.demoRunId, otherRun));
    await db.update(claimEvents).set({ explanation: "FOREIGN CLAIM EVENT" }).where(eq(claimEvents.claimId, `${otherRun}:claim:final-settlement`));
    // Real runtime simulation rows contain id/demoRunId absent from the presentation type.
    await db.insert(simulationEvents).values({
      id: `${demoRunId}:simulation:private`, demoRunId, kind: "TIME_ADVANCE",
      intervalStart: "2026-06", intervalEnd: "2026-08", intervalLabel: "June to August",
      months: 2, recordedAt: "2026-08-22T09:00:00.000Z",
    });
  });

  afterEach(async () => { await database.cleanup(); });

  test.each(["get_member_summary", "get_claim_history"])("%s never exposes foreign data or structural identifiers", async (name) => {
    const result = await read(name);
    expect(result.status).toBe("completed");
    expect(result.callId).toBe("call-1");
    expect(result.contextVersion).toMatch(/^[a-f0-9]{64}$/);
    const serialized = JSON.stringify(result);
    for (const secret of [context.demoRunId, otherRun, "FOREIGN", "1012 3456 7890", "PYBOM00424890000012345", "Ananya Sharma", "1991-11-23", "PAYMENT_RETURNED", "99,99,999"]) {
      expect(serialized).not.toContain(secret);
    }
    for (const key of ["id", "demoRunId", "userId", "sessionId", "uan", "memberId", "employmentKey", "claimId", "employmentId", "idempotencyKey", "amount", "employeeEpf", "passwordHash"]) {
      expect(keys(result.data)).not.toContain(key);
    }
  });

  test("summary and history display recorded paise as rupees without treating a draft as a payout", async () => {
    const summary = await read("get_member_summary");
    expect(summary.data).toMatchObject({
      profile: { uanMasked: "XXXX XXXX 7890", onboardingComplete: true },
      contributionSummary: { currency: "INR", postedEpfBalanceDisplayed: "₹2,976" },
      activeClaim: { status: "DRAFT", amountDisplayed: "₹1,23,456", currency: "INR" },
      nextAction: { href: "/employment" },
    });
    const history = await read("get_claim_history");
    expect(history.data).toMatchObject({
      activeClaim: { status: "DRAFT", amountDisplayed: "₹1,23,456" },
      latestClaim: { status: "DRAFT", amountDisplayed: "₹1,23,456" },
      events: [{ status: "DRAFT", actor: "MEMBER", occurredAt: "2026-08-01T09:30:00.000Z" }],
    });
    expect(history.message).toMatch(/recorded|demo/i);
  });

  test("filters inclusively, preserves missing/delayed rows, and sums only posted EPF excluding EPS", async () => {
    const result = await read("inspect_contributions", { fromMonth: "2026-01", toMonth: "2026-03" });
    expect(result.data).toMatchObject({
      currency: "INR", displayUnit: "whole rupees", postedEpfBalanceDisplayed: "₹2,826",
      counts: { posted: 1, missing: 1, delayed: 1 },
      contributions: [
        { wageMonth: "2026-03", postingStatus: "DELAYED", employeeEpfDisplayed: "₹2,160", employerEpfDisplayed: "₹666", employerEpsDisplayed: "₹1,494" },
        { wageMonth: "2026-02", postingStatus: "MISSING" },
        { wageMonth: "2026-01", postingStatus: "POSTED" },
      ],
    });
    const empty = await read("inspect_contributions", { fromMonth: "2099-01", toMonth: null });
    expect(empty.data).toMatchObject({ contributions: [], postedEpfBalanceDisplayed: "₹0", counts: { posted: 0, missing: 0, delayed: 0 } });
    const all = await read("inspect_contributions", { fromMonth: null, toMonth: null });
    expect(all.data).toMatchObject({ postedEpfBalanceDisplayed: "₹2,976" });
  });

  test("uses current findings and changes blocker/version when an exit record changes", async () => {
    const before = await read("check_workflow_readiness", { workflow: "final_settlement" });
    expect(before.data).toMatchObject({ readiness: "blocked", missingRequirements: expect.arrayContaining([expect.objectContaining({ code: "MISSING_EXIT_DATE", owner: "EMPLOYER" })]) });
    const explanation = await read("explain_blocker", { code: "MISSING_EXIT_DATE" });
    expect(explanation.data).toMatchObject({ finding: { code: "MISSING_EXIT_DATE", owner: "EMPLOYER" }, nextAction: { href: "/employment" } });
    await getDb().update(employments).set({ exitedAt: "2026-07-31" }).where(eq(employments.demoRunId, context.demoRunId));
    const after = await read("check_workflow_readiness", { workflow: "final_settlement" });
    expect(after.contextVersion).not.toBe(before.contextVersion);
    expect(JSON.stringify(after.data)).not.toContain("MISSING_EXIT_DATE");
    expect(after.data).toMatchObject({ readiness: "blocked", missingRequirements: expect.arrayContaining([expect.objectContaining({ code: "TWO_MONTH_UNEMPLOYMENT_NOT_MET" })]) });
    const stale = await read("explain_blocker", { code: "MISSING_EXIT_DATE" });
    expect(stale.status).toBe("unavailable");
    expect(stale.error?.code).toBe("FINDING_NOT_CURRENT");
    expect(stale.data).toBeUndefined();
  });

  test.each(["mark_exit", "advance_claim", "pension_withdrawal", "monthly_pension", "transfer_claim", "profile_correction", "contact_update", "nomination_guidance"])("returns unknown for %s without an existing readiness evaluator", async (workflow) => {
    const result = await read("check_workflow_readiness", { workflow });
    expect(result.status).toBe("completed");
    expect(result.data).toMatchObject({ workflow, readiness: "unknown", missingRequirements: [], reason: "NO_READINESS_EVALUATOR" });
    expect(result.data?.nextAction).toHaveProperty("href");
  });

  test("a draft needing continuation is not blanket submission-ready or a new-claim invitation", async () => {
    const db = getDb();
    await db.update(memberProfiles).set({ bankName: "Ananya Sharma" }).where(eq(memberProfiles.demoRunId, context.demoRunId));
    await db.update(kycRecords).set({ status: "VERIFIED" }).where(eq(kycRecords.demoRunId, context.demoRunId));
    await db.update(employments).set({ exitedAt: "2026-05-31" }).where(eq(employments.demoRunId, context.demoRunId));
    const draft = await read("check_workflow_readiness", { workflow: "final_settlement" });
    expect(draft.data).toMatchObject({ readiness: "blocked", existingClaim: { status: "DRAFT" }, nextAction: { href: "/claims" } });
    expect(draft.message).toMatch(/draft/i);
    expect(draft.message).toMatch(/review|continue/i);
    await db.update(claims).set({ status: "SETTLED" }).where(eq(claims.demoRunId, context.demoRunId));
    const clear = await read("check_workflow_readiness", { workflow: "final_settlement" });
    expect(clear.data).toMatchObject({ readiness: "ready", missingRequirements: [], existingClaim: null });
    expect(clear.message).toMatch(/recorded|demo/i);
  });

  test("an unfinished new member never becomes ready because claim findings were not evaluated", async () => {
    const demoRunId = await createDemoRun(DEMO_CREDENTIALS.newMember.id);
    context = { ...context, demoRunId };
    expect((await read("get_claim_history")).data).toEqual({ activeClaim: null, latestClaim: null, events: [] });
    expect((await read("check_workflow_readiness", { workflow: "final_settlement" })).data).toMatchObject({ readiness: "unknown" });
    expect((await read("check_workflow_readiness", { workflow: "new_member_setup" })).data).toMatchObject({ readiness: "unknown" });
  });

  test("comparison uses the same recorded final-claim findings and unknown for unsupported options", async () => {
    const result = await read("compare_claim_options", { workflows: ["final_settlement", "advance_claim", "pension_withdrawal"] });
    expect(result.data).toMatchObject({ options: [
      { workflow: "final_settlement", readiness: "blocked", missingRequirements: expect.arrayContaining([expect.objectContaining({ code: "MISSING_EXIT_DATE" })]) },
      { workflow: "advance_claim", readiness: "unknown", nextAction: { href: "/claims/advance" } },
      { workflow: "pension_withdrawal", readiness: "unknown", nextAction: { href: "/claims/pension-withdrawal" } },
    ] });
  });

  test("onboarding name findings are reused without claiming a complete setup evaluator", async () => {
    const result = await read("check_workflow_readiness", { workflow: "new_member_setup" });
    expect(result.data).toMatchObject({ readiness: "blocked", missingRequirements: [expect.objectContaining({ code: "BANK_NAME_MISMATCH" })] });
    expect(JSON.stringify(result.data)).not.toContain("MISSING_EXIT_DATE");
    await getDb().update(memberProfiles).set({ bankName: "Ananya Sharma" }).where(eq(memberProfiles.demoRunId, context.demoRunId));
    expect((await read("check_workflow_readiness", { workflow: "new_member_setup" })).data).toMatchObject({ readiness: "unknown", reason: "PARTIAL_READINESS_EVALUATOR" });
  });

  test("free-text record fields cannot smuggle raw member identifiers into results", async () => {
    const privateText = `1012 3456 7890 PYBOM00424890000012345 ANAPS1234K 9876543210 ${context.demoRunId}:claim:final-settlement`;
    await getDb().update(claimEvents).set({ explanation: privateText }).where(eq(claimEvents.claimId, `${context.demoRunId}:claim:final-settlement`));
    await getDb().update(kycRecords).set({ valueMasked: "123456789012" }).where(eq(kycRecords.demoRunId, context.demoRunId));
    for (const name of ["get_claim_history", "get_member_summary"]) {
      const serialized = JSON.stringify(await read(name));
      for (const secret of ["1012 3456 7890", "PYBOM00424890000012345", "ANAPS1234K", "9876543210", context.demoRunId, "123456789012"]) expect(serialized).not.toContain(secret);
    }
  });

  test("versions are stable across calls/routes and foreign changes, but refresh for relevant records", async () => {
    const before = await read("get_member_summary");
    context = { ...context, callId: "call-2", turnId: "turn-2", route: "/passbook" };
    await getDb().update(claims).set({ amount: 400 }).where(eq(claims.demoRunId, otherRun));
    expect((await read("get_claim_history")).contextVersion).toBe(before.contextVersion);
    await getDb().update(claims).set({ amount: 500 }).where(eq(claims.demoRunId, context.demoRunId));
    const changed = await read("get_claim_history");
    expect(changed.contextVersion).not.toBe(before.contextVersion);
    expect(changed.data).toMatchObject({ activeClaim: { amountDisplayed: "₹5" } });
    await getDb().update(serviceRequests).set({ type: "BANK_CHANGE" }).where(eq(serviceRequests.demoRunId, context.demoRunId));
    expect((await read("get_member_summary")).contextVersion).not.toBe(changed.contextVersion);
  });

  test("revalidates callers, refuses later tools and masks unavailable-run errors", async () => {
    const invalid = { name: "get_member_summary", arguments: { demoRunId: otherRun } } as unknown as AssistantToolCall;
    expect(await executeReadTool(invalid, context)).toMatchObject({ status: "failed", error: { code: "INVALID_ARGUMENTS", retryable: false } });
    expect(await read("get_pending_action")).toMatchObject({ status: "unavailable", error: { code: "READ_TOOL_NOT_IMPLEMENTED", retryable: false } });
    context = { ...context, demoRunId: "missing-private-run" };
    const missing = await read("get_member_summary");
    expect(missing.status).toBe("unavailable");
    expect(JSON.stringify(missing)).not.toContain("missing-private-run");
  });

  test("versions change when an underlying identifier changes behind an identical mask", async () => {
    const before = await read("get_member_summary");
    await getDb().update(memberProfiles).set({ uan: "9090 9090 7890" }).where(eq(memberProfiles.demoRunId, context.demoRunId));
    const after = await read("get_member_summary");
    expect(after.data?.profile).toEqual(before.data?.profile);
    expect(after.contextVersion).not.toBe(before.contextVersion);
    expect(JSON.stringify(after)).not.toContain("9090 9090 7890");
  });

  test("every advertised read executes with a validated envelope and no database writes", async () => {
    const db = getDb();
    const snapshot = async () => Promise.all([db.select().from(claims), db.select().from(claimEvents), db.select().from(employments), db.select().from(contributions), db.select().from(serviceRequests)]);
    const before = await snapshot();
    const args: Record<string, unknown> = {
      get_member_summary: {}, get_claim_history: {},
      check_workflow_readiness: { workflow: "final_settlement" },
      inspect_contributions: { fromMonth: null, toMonth: null },
      explain_blocker: { code: "MISSING_EXIT_DATE" },
      compare_claim_options: { workflows: ["final_settlement", "advance_claim"] },
    };
    for (const definition of assistantToolDefinitions) {
      const result = await read(definition.name, args[definition.name]);
      expect(result.status).toBe("completed");
      expect(toolResultSchema.safeParse(result).success).toBe(true);
      expect(JSON.stringify(result)).not.toContain(context.demoRunId);
      expect(JSON.stringify(result)).not.toContain(otherRun);
    }
    expect(await snapshot()).toEqual(before);
  });
});
