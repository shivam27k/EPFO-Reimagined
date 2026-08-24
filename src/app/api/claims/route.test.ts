import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { eq } from "drizzle-orm";

import { createDemoRun } from "@/db/demo-runs";
import { getDb } from "@/db/client";
import { claims, demoUsers, employments, kycRecords, memberProfiles, sessions } from "@/db/schema";
import { DEMO_CREDENTIALS, seedAllDemoUsers } from "@/db/seed-data";
import { validDemoOnboardingData } from "@/domain/demo-onboarding-data";
import { saveOnboarding } from "@/server/services/onboarding-service";
import { advanceOnboardingTime } from "@/server/services/scenario-service";
import { createIsolatedTestDatabase, type IsolatedTestDatabase } from "@/test/factories";

const cookieState = vi.hoisted(() => ({
  incomingSessionId: undefined as string | undefined,
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) =>
      name === "epf_sahayak_session" && cookieState.incomingSessionId
        ? { name, value: cookieState.incomingSessionId }
        : undefined,
  })),
}));

function claimRequest(body: Record<string, string>) {
  return new Request("http://localhost/api/claims", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function claimAdvanceRequest(command: string) {
  return new Request("http://localhost/api/claims", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ command }),
  });
}

describe("claim API", () => {
  let testDatabase: IsolatedTestDatabase;
  let demoRunId: string;

  beforeEach(async () => {
    testDatabase = await createIsolatedTestDatabase();
    await seedAllDemoUsers();
    const [user] = await getDb()
      .select()
      .from(demoUsers)
      .where(eq(demoUsers.id, DEMO_CREDENTIALS.existingMember.id));
    demoRunId = await createDemoRun(user.id);
    await getDb().insert(sessions).values({
      id: "claim-test-session",
      userId: user.id,
      demoRunId,
      expiresAt: "2099-01-01T00:00:00.000Z",
    });
    cookieState.incomingSessionId = "claim-test-session";
  });

  afterEach(async () => {
    cookieState.incomingSessionId = undefined;
    await testDatabase.cleanup();
  });

  test("returns blockers when exit date is missing", async () => {
    const { POST } = await import("./route");
    const response = await POST(claimRequest({ idempotencyKey: "claim-key-missing-exit" }));

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      blockers: expect.arrayContaining([expect.objectContaining({ code: "MISSING_EXIT_DATE" })]),
    });
  });

  test("returns blockers when bank name mismatch remains", async () => {
    const [employment] = await getDb().select().from(employments).where(eq(employments.demoRunId, demoRunId));
    await getDb().update(employments).set({ exitedAt: "2026-05-31" }).where(eq(employments.id, employment.id));
    const { POST } = await import("./route");

    const response = await POST(claimRequest({ idempotencyKey: "claim-key-bank-mismatch" }));

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      blockers: expect.arrayContaining([expect.objectContaining({ code: "BANK_NAME_MISMATCH" })]),
    });
  });

  test("submits exactly one final settlement claim for a repeated idempotency key", async () => {
    const [employment] = await getDb().select().from(employments).where(eq(employments.demoRunId, demoRunId));
    await getDb().update(employments).set({ exitedAt: "2026-05-31" }).where(eq(employments.id, employment.id));
    await getDb().update(memberProfiles).set({ bankName: "Ananya Sharma" }).where(eq(memberProfiles.demoRunId, demoRunId));
    await getDb().update(kycRecords).set({ status: "VERIFIED" }).where(eq(kycRecords.demoRunId, demoRunId));
    const { POST } = await import("./route");

    const first = await POST(claimRequest({ idempotencyKey: "claim-key-submit" }));
    const second = await POST(claimRequest({ idempotencyKey: "claim-key-submit" }));

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({ activeClaim: { status: "SUBMITTED" } });
    const claimRows = await getDb().select().from(claims).where(eq(claims.demoRunId, demoRunId));
    expect(claimRows).toHaveLength(1);
    expect(claimRows[0]).toMatchObject({ status: "SUBMITTED", idempotencyKey: "claim-key-submit" });
  });

  test("simulates the two-month wait before a new member creates a first claim", async () => {
    const [newMember] = await getDb()
      .select()
      .from(demoUsers)
      .where(eq(demoUsers.id, DEMO_CREDENTIALS.newMember.id));
    const newMemberRunId = await createDemoRun(newMember.id);
    await getDb()
      .update(sessions)
      .set({ userId: newMember.id, demoRunId: newMemberRunId })
      .where(eq(sessions.id, "claim-test-session"));
    await saveOnboarding(newMemberRunId, validDemoOnboardingData);
    await advanceOnboardingTime(newMemberRunId);
    await getDb()
      .update(employments)
      .set({ exitedAt: "2027-01-31" })
      .where(eq(employments.demoRunId, newMemberRunId));
    const { PATCH } = await import("./route");

    const response = await PATCH(claimAdvanceRequest("SIMULATE_TWO_MONTH_WAIT"));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ findings: [] });
    expect(
      await getDb().select().from(claims).where(eq(claims.demoRunId, newMemberRunId)),
    ).toHaveLength(0);
  });
});
