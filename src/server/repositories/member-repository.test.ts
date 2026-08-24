import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { createDemoRun } from "@/db/demo-runs";
import {
  claimEvents,
  claims,
  contributions,
  demoUsers,
  employments,
  kycRecords,
  memberProfiles,
  scenarioRuns,
  serviceRequests,
} from "@/db/schema";
import { seedAllDemoUsers } from "@/db/seed-data";
import { validDemoOnboardingData } from "@/domain/demo-onboarding-data";
import { saveOnboarding } from "@/server/services/onboarding-service";
import { advanceOnboardingTime } from "@/server/services/scenario-service";
import {
  createIsolatedTestDatabase,
  type IsolatedTestDatabase,
} from "@/test/factories";
import { getMemberSnapshot } from "./member-repository";

function collectKeys(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(collectKeys);
  }
  if (value === null || typeof value !== "object") {
    return [];
  }

  return Object.entries(value).flatMap(([key, nested]) => [key, ...collectKeys(nested)]);
}

describe("getMemberSnapshot", () => {
  let testDatabase: IsolatedTestDatabase;

  beforeEach(async () => {
    testDatabase = await createIsolatedTestDatabase();
    await seedAllDemoUsers();
  });

  afterEach(async () => {
    await testDatabase.cleanup();
  });

  test("scopes every record to the supplied run and returns only masked identifiers", async () => {
    const db = getDb();
    const [user] = await db
      .select()
      .from(demoUsers)
      .where(eq(demoUsers.username, "existing.member@demo.epfsahayak.in"));
    const otherRunId = await createDemoRun(user.id);
    const currentRunId = await createDemoRun(user.id);

    await db
      .update(memberProfiles)
      .set({
        uan: "FOREIGN-RAW-UAN-9999",
        aadhaarName: "FOREIGN PROFILE",
        bankName: "FOREIGN BANK NAME",
      })
      .where(eq(memberProfiles.demoRunId, otherRunId));
    await db
      .update(kycRecords)
      .set({ valueMasked: "FOREIGN-RAW-KYC-9999", status: "MISMATCH" })
      .where(eq(kycRecords.demoRunId, otherRunId));
    await db
      .update(employments)
      .set({
        establishmentName: "FOREIGN EMPLOYER",
        memberId: "FOREIGN-RAW-MEMBER-ID",
      })
      .where(eq(employments.demoRunId, otherRunId));
    const [otherEmployment] = await db
      .select({ id: employments.id })
      .from(employments)
      .where(eq(employments.demoRunId, otherRunId));
    await db
      .update(contributions)
      .set({ wageMonth: "2099-12", employeeEpf: 99_999_999 })
      .where(eq(contributions.employmentId, otherEmployment.id));
    const [otherClaim] = await db
      .select({ id: claims.id })
      .from(claims)
      .where(eq(claims.demoRunId, otherRunId));
    await db
      .update(claims)
      .set({ amount: 99_999_999, status: "PAYMENT_RETURNED" })
      .where(eq(claims.id, otherClaim.id));
    await db
      .update(claimEvents)
      .set({ explanation: "FOREIGN CLAIM EVENT" })
      .where(eq(claimEvents.claimId, otherClaim.id));
    await db
      .update(scenarioRuns)
      .set({ scenarioKey: "CRYPTIC_CLAIM_STATUS" })
      .where(eq(scenarioRuns.demoRunId, otherRunId));
    await db
      .update(serviceRequests)
      .set({ type: "BANK_CHANGE", status: "OPEN" })
      .where(eq(serviceRequests.demoRunId, otherRunId));

    const snapshot = await getMemberSnapshot(currentRunId);
    const serialized = JSON.stringify(snapshot);

    expect(snapshot.employments[0]?.establishmentName).toBe(
      "Sahyadri Mobility Components Pvt Ltd",
    );
    expect(snapshot.nextAction).toEqual({
      label: "Resolve missing exit date",
      href: "/employment",
    });
    expect(snapshot.findings).toContainEqual(
      expect.objectContaining({ code: "MISSING_EXIT_DATE", owner: "EMPLOYER" }),
    );
    for (const foreignMarker of [
      "FOREIGN PROFILE",
      "FOREIGN BANK NAME",
      "FOREIGN-RAW-KYC-9999",
      "FOREIGN EMPLOYER",
      "FOREIGN-RAW-MEMBER-ID",
      "2099-12",
      "99999999",
      "PAYMENT_RETURNED",
      "FOREIGN CLAIM EVENT",
      "CRYPTIC_CLAIM_STATUS",
      "PENDING_BANK_CHANGE",
    ]) {
      expect(serialized).not.toContain(foreignMarker);
    }
    expect(serialized).not.toContain(otherRunId);
    expect(serialized).not.toContain(currentRunId);
    expect(serialized).not.toContain("1012 3456 7890");
    expect(serialized).not.toContain("PYBOM00424890000012345");
    expect(snapshot.profile.uanMasked).toBe("XXXX XXXX 7890");
    expect(snapshot.employments[0]?.memberIdMasked).toBe("******************2345");
    expect(snapshot.kyc).toHaveLength(3);
    for (const record of snapshot.kyc) {
      expect(record.valueMasked).toMatch(/[X*]/);
    }
    const prohibitedKeys = [
      "id",
      "demoRunId",
      "userId",
      "sessionId",
      "passwordHash",
      "uan",
      "memberId",
      "claimId",
      "employmentId",
      "serviceRequestId",
    ] as const;
    const returnedKeys = collectKeys(snapshot);

    for (const prohibitedKey of prohibitedKeys) {
      expect(returnedKeys).not.toContain(prohibitedKey);
    }
  });

  test("gives a new member a useful KYC action despite otherwise empty account data", async () => {
    const db = getDb();
    const [user] = await db
      .select()
      .from(demoUsers)
      .where(eq(demoUsers.username, "new.member@demo.epfsahayak.in"));
    const runId = await createDemoRun(user.id);

    const snapshot = await getMemberSnapshot(runId);

    expect(snapshot.employments).toEqual([]);
    expect(snapshot.contributions).toEqual([]);
    expect(snapshot.activeClaim).toBeNull();
    expect(snapshot.nextAction).toEqual({
      label: "Complete new-member setup",
      href: "/onboarding",
    });
  });

  test("evaluates the two-month exit wait before a completed new member creates a first claim", async () => {
    const db = getDb();
    const [user] = await db
      .select()
      .from(demoUsers)
      .where(eq(demoUsers.username, "new.member@demo.epfsahayak.in"));
    const runId = await createDemoRun(user.id);

    await saveOnboarding(runId, validDemoOnboardingData);
    await advanceOnboardingTime(runId);
    await db
      .update(employments)
      .set({ exitedAt: "2027-01-31" })
      .where(eq(employments.demoRunId, runId));

    const snapshot = await getMemberSnapshot(runId);

    expect(snapshot.activeClaim).toBeNull();
    expect(snapshot.findings).toContainEqual(
      expect.objectContaining({ code: "TWO_MONTH_UNEMPLOYMENT_NOT_MET" }),
    );
  });

  test("uses passbook as the contribution-history destination after higher priorities clear", async () => {
    const db = getDb();
    const [user] = await db
      .select()
      .from(demoUsers)
      .where(eq(demoUsers.username, "existing.member@demo.epfsahayak.in"));
    const runId = await createDemoRun(user.id);

    await db
      .update(memberProfiles)
      .set({ bankName: "Ananya Sharma" })
      .where(eq(memberProfiles.demoRunId, runId));
    await db
      .update(kycRecords)
      .set({ status: "VERIFIED" })
      .where(eq(kycRecords.demoRunId, runId));
    await db
      .update(employments)
      .set({ exitedAt: "2026-06-01" })
      .where(eq(employments.demoRunId, runId));
    const [employment] = await db
      .select({ id: employments.id })
      .from(employments)
      .where(eq(employments.demoRunId, runId));
    await db
      .update(contributions)
      .set({ postingStatus: "POSTED" })
      .where(eq(contributions.employmentId, employment.id));
    await db
      .update(claims)
      .set({ status: "SETTLED" })
      .where(eq(claims.demoRunId, runId));
    await db
      .update(serviceRequests)
      .set({ status: "RESOLVED" })
      .where(eq(serviceRequests.demoRunId, runId));

    const snapshot = await getMemberSnapshot(runId);

    expect(snapshot.nextAction).toEqual({
      label: "Review contribution history",
      href: "/passbook",
    });
  });
});
