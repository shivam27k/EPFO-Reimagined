import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";

import { getDb } from "./client";
import {
  claimEvents,
  claims,
  contributions,
  conversationMessages,
  demoRuns,
  demoUsers,
  employments,
  kycRecords,
  memberProfiles,
  onboardingDrafts,
  scenarioRuns,
  serviceRequests,
  sessions,
  simulationEvents,
} from "./schema";
import {
  cleanupAbandonedDemoRuns,
  createDemoRun,
  disposeDemoRun,
  resetDemoRun,
} from "./demo-runs";
import { seedAllDemoUsers } from "./seed-data";
import {
  createIsolatedTestDatabase,
  type IsolatedTestDatabase,
} from "../test/factories";

describe("demo run lifecycle", () => {
  let testDatabase: IsolatedTestDatabase;

  beforeEach(async () => {
    testDatabase = await createIsolatedTestDatabase();
    await seedAllDemoUsers();
  });

  afterEach(async () => {
    await testDatabase.cleanup();
  });

  test("isolates each login for the existing member and resets mutable run data", async () => {
    const db = getDb();
    const [existingUser] = await db
      .select()
      .from(demoUsers)
      .where(eq(demoUsers.username, "existing.member@demo.epfsahayak.in"));

    expect(existingUser).toMatchObject({
      persona: "EXISTING_MEMBER",
      displayName: "Ananya Sharma",
    });
    expect(existingUser.passwordHash).not.toBe("DemoExisting#2026");

    const firstRunId = await createDemoRun(existingUser.id);
    const secondRunId = await createDemoRun(existingUser.id);

    expect(firstRunId).not.toBe(secondRunId);

    await db
      .update(employments)
      .set({ exitedAt: "2026-07-31" })
      .where(eq(employments.demoRunId, firstRunId));
    await db
      .update(memberProfiles)
      .set({ bankName: "Ananya S" })
      .where(eq(memberProfiles.demoRunId, firstRunId));
    await db
      .update(claims)
      .set({ status: "SETTLED", submittedAt: "2026-08-02" })
      .where(eq(claims.demoRunId, firstRunId));
    await db.insert(conversationMessages).values({
      id: "test-message-first-run",
      demoRunId: firstRunId,
      role: "member",
      content: "Why is my final settlement stuck?",
      createdAt: "2026-08-02T10:00:00.000Z",
    });
    const [secondRunEmployment] = await db
      .select({ exitedAt: employments.exitedAt })
      .from(employments)
      .where(eq(employments.demoRunId, secondRunId));
    const [secondRunClaim] = await db
      .select({ status: claims.status })
      .from(claims)
      .where(eq(claims.demoRunId, secondRunId));
    const [secondRunProfile] = await db
      .select({ bankName: memberProfiles.bankName })
      .from(memberProfiles)
      .where(eq(memberProfiles.demoRunId, secondRunId));

    expect(secondRunEmployment.exitedAt).toBeNull();
    expect(secondRunClaim.status).toBe("DRAFT");
    expect(secondRunProfile.bankName).toBe("Ananya Sharmaa");

    await resetDemoRun(firstRunId);

    const [resetEmployment] = await db
      .select({ exitedAt: employments.exitedAt })
      .from(employments)
      .where(eq(employments.demoRunId, firstRunId));
    const [resetClaim] = await db
      .select({ status: claims.status, submittedAt: claims.submittedAt })
      .from(claims)
      .where(eq(claims.demoRunId, firstRunId));
    const [resetProfile] = await db
      .select({ bankName: memberProfiles.bankName })
      .from(memberProfiles)
      .where(eq(memberProfiles.demoRunId, firstRunId));
    const resetMessages = await db
      .select()
      .from(conversationMessages)
      .where(eq(conversationMessages.demoRunId, firstRunId));

    expect(resetClaim).toEqual({ status: "DRAFT", submittedAt: null });
    expect(resetEmployment.exitedAt).toBeNull();
    expect(resetProfile.bankName).toBe("Ananya Sharmaa");
    expect(resetMessages).toHaveLength(0);

    await disposeDemoRun(firstRunId);
    await disposeDemoRun(secondRunId);

    const usersAfterDispose = await db.select().from(demoUsers);
    expect(usersAfterDispose.map((user) => user.username).sort()).toEqual([
      "existing.member@demo.epfsahayak.in",
      "new.member@demo.epfsahayak.in",
    ]);
  });

  test("cleans abandoned demo runs older than twenty four hours without deleting identities", async () => {
    const db = getDb();
    const [newUser] = await db
      .select()
      .from(demoUsers)
      .where(eq(demoUsers.username, "new.member@demo.epfsahayak.in"));
    const abandonedRunId = await createDemoRun(newUser.id);
    const activeRunId = await createDemoRun(newUser.id);

    await db
      .update(demoRuns)
      .set({
        createdAt: "2026-08-20T11:59:00.000Z",
        expiresAt: "2026-08-20T12:59:00.000Z",
      })
      .where(eq(demoRuns.id, abandonedRunId));
    await db.insert(sessions).values({
      id: "test-session-for-abandoned-run",
      userId: newUser.id,
      demoRunId: abandonedRunId,
      expiresAt: "2026-08-20T12:59:00.000Z",
    });

    const deletedCount = await cleanupAbandonedDemoRuns(
      "2026-08-21T12:00:00.000Z",
    );

    const abandonedRuns = await db
      .select()
      .from(demoRuns)
      .where(eq(demoRuns.id, abandonedRunId));
    const activeRuns = await db
      .select()
      .from(demoRuns)
      .where(eq(demoRuns.id, activeRunId));
    const abandonedProfiles = await db
      .select()
      .from(memberProfiles)
      .where(eq(memberProfiles.demoRunId, abandonedRunId));
    const abandonedSessions = await db
      .select()
      .from(sessions)
      .where(eq(sessions.demoRunId, abandonedRunId));
    const usersAfterCleanup = await db.select().from(demoUsers);

    expect(deletedCount).toBe(1);
    expect(abandonedRuns).toHaveLength(0);
    expect(abandonedProfiles).toHaveLength(0);
    expect(abandonedSessions).toHaveLength(0);
    expect(activeRuns).toHaveLength(1);
    expect(usersAfterCleanup).toHaveLength(2);
  });

  test("cascades a raw demo run delete through sessions and run-owned rows", async () => {
    const db = getDb();
    const [existingUser] = await db
      .select()
      .from(demoUsers)
      .where(eq(demoUsers.username, "existing.member@demo.epfsahayak.in"));
    const runId = await createDemoRun(existingUser.id);

    await db.insert(sessions).values({
      id: "test-session-for-raw-delete",
      userId: existingUser.id,
      demoRunId: runId,
      expiresAt: "2026-08-21T20:00:00.000Z",
    });
    await db.insert(conversationMessages).values({
      id: "test-message-for-raw-delete",
      demoRunId: runId,
      role: "member",
      content: "Please check every cascade path.",
      createdAt: "2026-08-21T12:00:00.000Z",
    });
    await db.insert(onboardingDrafts).values({
      demoRunId: runId,
      currentStep: 1,
      disclosureAccepted: true,
      valuesJson: "{}",
      updatedAt: "2026-08-21T12:00:00.000Z",
    });
    await db.insert(simulationEvents).values({
      id: `${runId}:cascade-time-event`,
      demoRunId: runId,
      kind: "TIME_ADVANCE",
      intervalStart: "2026-08",
      intervalEnd: "2027-01",
      intervalLabel: "August 2026 to January 2027",
      months: 6,
      recordedAt: "2027-02-01T09:00:00.000Z",
    });

    await db.transaction(async (tx) => {
      await tx.delete(demoRuns).where(eq(demoRuns.id, runId));
    });

    const remainingRunRows = await db
      .select()
      .from(demoRuns)
      .where(eq(demoRuns.id, runId));
    const remainingSessionRows = await db
      .select()
      .from(sessions)
      .where(eq(sessions.demoRunId, runId));
    const remainingProfileRows = await db
      .select()
      .from(memberProfiles)
      .where(eq(memberProfiles.demoRunId, runId));
    const remainingKycRows = await db
      .select()
      .from(kycRecords)
      .where(eq(kycRecords.demoRunId, runId));
    const remainingEmploymentRows = await db
      .select()
      .from(employments)
      .where(eq(employments.demoRunId, runId));
    const remainingContributionRows = await db
      .select()
      .from(contributions);
    const remainingClaimRows = await db
      .select()
      .from(claims)
      .where(eq(claims.demoRunId, runId));
    const remainingClaimEventRows = await db.select().from(claimEvents);
    const remainingServiceRequestRows = await db
      .select()
      .from(serviceRequests)
      .where(eq(serviceRequests.demoRunId, runId));
    const remainingScenarioRows = await db
      .select()
      .from(scenarioRuns)
      .where(eq(scenarioRuns.demoRunId, runId));
    const remainingConversationRows = await db
      .select()
      .from(conversationMessages)
      .where(eq(conversationMessages.demoRunId, runId));
    const remainingDraftRows = await db.select().from(onboardingDrafts).where(eq(onboardingDrafts.demoRunId, runId));
    const remainingSimulationRows = await db.select().from(simulationEvents).where(eq(simulationEvents.demoRunId, runId));
    const remainingUserRows = await db
      .select()
      .from(demoUsers)
      .where(eq(demoUsers.id, existingUser.id));

    expect(remainingRunRows).toHaveLength(0);
    expect(remainingSessionRows).toHaveLength(0);
    expect(remainingProfileRows).toHaveLength(0);
    expect(remainingKycRows).toHaveLength(0);
    expect(remainingEmploymentRows).toHaveLength(0);
    expect(remainingContributionRows).toHaveLength(0);
    expect(remainingClaimRows).toHaveLength(0);
    expect(remainingClaimEventRows).toHaveLength(0);
    expect(remainingServiceRequestRows).toHaveLength(0);
    expect(remainingScenarioRows).toHaveLength(0);
    expect(remainingConversationRows).toHaveLength(0);
    expect(remainingDraftRows).toHaveLength(0);
    expect(remainingSimulationRows).toHaveLength(0);
    expect(remainingUserRows).toHaveLength(1);
  });
});
