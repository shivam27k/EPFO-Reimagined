import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { createDemoRun } from "@/db/demo-runs";
import {
  contributions,
  demoUsers,
  employments,
  kycRecords,
  memberProfiles,
  onboardingDrafts,
  sessions,
} from "@/db/schema";
import { DEMO_CREDENTIALS, seedAllDemoUsers } from "@/db/seed-data";
import {
  createIsolatedTestDatabase,
  type IsolatedTestDatabase,
} from "@/test/factories";

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

const validDemoInput = {
  demoDisclosureAccepted: true,
  uan: "100000004321",
  aadhaarName: "Priya Sharma",
  dateOfBirth: "1998-03-14",
  mobileNumber: "9876542104",
  establishmentName: "Sahyadri Demo Components Pvt Ltd",
  memberId: "PYBOM00424890000054321",
  joinedAt: "2026-07-01",
  epfMember: true,
  epsMember: true,
  panName: "Priya Sharma",
  panNumber: "DEMOP4321F",
  bankName: "Priya Sharma",
  bankAccountNumber: "000000001188",
  bankIfsc: "DEMO0001188",
} as const;

function onboardingRequest(body: unknown, query = "") {
  return new Request(`http://localhost/api/onboarding${query}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function onboardingPatchRequest(body: unknown) {
  return new Request("http://localhost/api/onboarding", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("/api/onboarding", () => {
  let testDatabase: IsolatedTestDatabase;
  let authenticatedRunId: string;

  beforeEach(async () => {
    testDatabase = await createIsolatedTestDatabase();
    await seedAllDemoUsers();
    const [user] = await getDb()
      .select()
      .from(demoUsers)
      .where(eq(demoUsers.id, DEMO_CREDENTIALS.newMember.id));
    authenticatedRunId = await createDemoRun(user.id);
    const sessionId = "onboarding-test-session";
    await getDb().insert(sessions).values({
      id: sessionId,
      userId: user.id,
      demoRunId: authenticatedRunId,
      expiresAt: "2099-01-01T00:00:00.000Z",
    });
    cookieState.incomingSessionId = sessionId;
  });

  afterEach(async () => {
    cookieState.incomingSessionId = undefined;
    await testDatabase.cleanup();
  });

  test("persists valid synthetic onboarding data and returns a completed masked snapshot", async () => {
    const { POST } = await import("./route");
    const response = await POST(onboardingRequest(validDemoInput));

    expect(response.status).toBe(200);
    const snapshot = await response.json();
    expect(snapshot.profile).toMatchObject({
      displayName: "Priya Sharma",
      uanMasked: "XXXX XXXX 4321",
      mobileMasked: "+91 ******2104",
      onboardingComplete: true,
    });
    expect(snapshot.findings).toEqual([
      expect.objectContaining({
        code: "MISSING_EXIT_DATE",
        owner: "EMPLOYER",
      }),
    ]);
    expect(JSON.stringify(snapshot)).not.toContain(validDemoInput.uan);
    expect(JSON.stringify(snapshot)).not.toContain(validDemoInput.panNumber);
    expect(JSON.stringify(snapshot)).not.toContain(validDemoInput.bankAccountNumber);
    expect(JSON.stringify(snapshot)).not.toContain(validDemoInput.memberId);

    const [profile] = await getDb()
      .select()
      .from(memberProfiles)
      .where(eq(memberProfiles.demoRunId, authenticatedRunId));
    const [employment] = await getDb()
      .select()
      .from(employments)
      .where(eq(employments.demoRunId, authenticatedRunId));
    const storedKyc = await getDb()
      .select()
      .from(kycRecords)
      .where(eq(kycRecords.demoRunId, authenticatedRunId));

    expect(profile.uan).toBe("XXXX XXXX 4321");
    expect(employment.memberId).toBe("******************4321");
    expect(storedKyc.map((record) => record.valueMasked)).toEqual(
      expect.arrayContaining(["XXXX-XXXX-9087", "******4321F", "BANK ****1188 · IFSC DEMO0001188"]),
    );
  });

  test("uses deterministic PAN-name matching and never derives Aadhaar display from UAN", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      onboardingRequest({ ...validDemoInput, panName: "Priya R Sharma" }),
    );

    expect(response.status).toBe(200);
    const snapshot = await response.json();
    expect(snapshot.profile.onboardingComplete).toBe(false);
    expect(snapshot.findings).toContainEqual(
      expect.objectContaining({ code: "PAN_NAME_MISMATCH", owner: "MEMBER" }),
    );
    expect(snapshot.kyc).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "AADHAAR",
          valueMasked: "XXXX-XXXX-9087",
          statusLabel: "Verified by UIDAI — simulated response",
        }),
        expect.objectContaining({ type: "PAN", status: "MISMATCH" }),
      ]),
    );
  });

  test("persists editable bank mismatch input but keeps onboarding incomplete", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      onboardingRequest({ ...validDemoInput, bankName: "Priya R Sharma" }),
    );

    expect(response.status).toBe(200);
    const snapshot = await response.json();
    expect(snapshot.profile).toMatchObject({
      aadhaarName: "Priya Sharma",
      bankName: "Priya R Sharma",
      onboardingComplete: false,
    });
    expect(snapshot.findings).toContainEqual(
      expect.objectContaining({
        code: "BANK_NAME_MISMATCH",
        severity: "BLOCKER",
        owner: "BANK",
      }),
    );

    const [profile] = await getDb()
      .select()
      .from(memberProfiles)
      .where(eq(memberProfiles.demoRunId, authenticatedRunId));
    expect(profile.bankName).toBe("Priya R Sharma");
    expect(profile.onboardingComplete).toBe(false);
  });

  test("derives preflight count and document checklist from the process registry", async () => {
    const { GET } = await import("./route");
    const { processDefinitions } = await import("@/domain/process-definitions");
    const response = await GET();

    expect(response.status).toBe(200);
    const preflight = await response.json();
    expect(preflight.questionCount).toBe(processDefinitions.ONBOARDING.questions.length);
    expect(preflight.questionCount).toBe(14);
    expect(preflight.steps).toHaveLength(4);
    expect(preflight.requiredSources).toEqual([
      "Simulated UMANG return sheet",
      "Synthetic Aadhaar result sheet",
      "Demo mobile number",
      "Synthetic joining letter",
      "Synthetic PAN card",
      "Synthetic bank statement",
    ]);
    expect(preflight.firstEditableStep).toBe("identity");
  });

  test("requires accepted disclosure and ignores a forged client run id", async () => {
    const { POST } = await import("./route");
    const forgedRunId = "judge-run-that-must-not-change";

    const rejected = await POST(
      onboardingRequest({ ...validDemoInput, demoDisclosureAccepted: false }),
    );
    expect(rejected.status).toBe(422);

    const accepted = await POST(
      onboardingRequest(validDemoInput, `?demoRunId=${forgedRunId}`),
    );
    expect(accepted.status).toBe(200);
    const [authenticatedProfile] = await getDb()
      .select()
      .from(memberProfiles)
      .where(eq(memberProfiles.demoRunId, authenticatedRunId));
    expect(authenticatedProfile.aadhaarName).toBe("Priya Sharma");
  });

  test("rejects existing-member onboarding with 403 and makes zero mutations", async () => {
    const { PATCH, POST } = await import("./route");
    const [existingUser] = await getDb()
      .select()
      .from(demoUsers)
      .where(eq(demoUsers.id, DEMO_CREDENTIALS.existingMember.id));
    const existingRunId = await createDemoRun(existingUser.id);
    await getDb().insert(sessions).values({
      id: "existing-onboarding-session",
      userId: existingUser.id,
      demoRunId: existingRunId,
      expiresAt: "2099-01-01T00:00:00.000Z",
    });
    cookieState.incomingSessionId = "existing-onboarding-session";
    const patchResponse = await PATCH(onboardingPatchRequest({
      demoDisclosureAccepted: true,
      currentStep: 1,
      values: { aadhaarName: "Forged Name" },
    }));
    expect(patchResponse.status).toBe(403);
    const [beforeProfile] = await getDb()
      .select()
      .from(memberProfiles)
      .where(eq(memberProfiles.demoRunId, existingRunId));
    const beforeEmployments = await getDb()
      .select()
      .from(employments)
      .where(eq(employments.demoRunId, existingRunId));
    const beforeContributions = await getDb()
      .select()
      .from(contributions)
      .innerJoin(employments, eq(contributions.employmentId, employments.id))
      .where(eq(employments.demoRunId, existingRunId));

    const response = await POST(onboardingRequest(validDemoInput));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "New-member onboarding is not available for this demo persona.",
    });
    expect(
      await getDb().select().from(memberProfiles).where(eq(memberProfiles.demoRunId, existingRunId)),
    ).toEqual([beforeProfile]);
    expect(
      await getDb().select().from(employments).where(eq(employments.demoRunId, existingRunId)),
    ).toEqual(beforeEmployments);
    expect(
      await getDb().select().from(contributions).innerJoin(employments, eq(contributions.employmentId, employments.id)).where(eq(employments.demoRunId, existingRunId)),
    ).toEqual(beforeContributions);
    expect(
      await getDb().select().from(onboardingDrafts).where(eq(onboardingDrafts.demoRunId, existingRunId)),
    ).toHaveLength(0);
  });

  test("persists a run-scoped masked draft and resumes only safe values", async () => {
    const route = await import("./route");
    expect(route).toHaveProperty("PATCH");
    if (!("PATCH" in route) || typeof route.PATCH !== "function") return;

    const response = await route.PATCH(onboardingPatchRequest({
      demoDisclosureAccepted: true,
      currentStep: 2,
      values: validDemoInput,
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      currentStep: 2,
      values: {
        aadhaarName: "Priya Sharma",
        establishmentName: "Sahyadri Demo Components Pvt Ltd",
      },
      maskedValues: {
        uan: "XXXX XXXX 4321",
        mobileNumber: "+91 ******2104",
        memberId: "******************4321",
        panNumber: "******4321F",
        bankAccountNumber: "BANK ****1188",
      },
    });

    const rawRows = await getDb().select().from(onboardingDrafts).where(eq(onboardingDrafts.demoRunId, authenticatedRunId));
    expect(rawRows).toHaveLength(1);
    const stored = JSON.stringify(rawRows[0]);
    for (const sensitive of [
      validDemoInput.uan,
      validDemoInput.mobileNumber,
      validDemoInput.memberId,
      validDemoInput.panNumber,
      validDemoInput.bankAccountNumber,
    ]) {
      expect(stored).not.toContain(sensitive);
    }

    const [newUser] = await getDb().select().from(demoUsers).where(eq(demoUsers.id, DEMO_CREDENTIALS.newMember.id));
    const isolatedRunId = await createDemoRun(newUser.id);
    await getDb().insert(onboardingDrafts).values({
      demoRunId: isolatedRunId,
      currentStep: 3,
      disclosureAccepted: true,
      valuesJson: JSON.stringify({ aadhaarName: "Other Run Name" }),
      updatedAt: "2026-08-21T00:00:00.000Z",
    });

    const getResponse = await route.GET();
    const resumed = await getResponse.json();
    expect(resumed).toMatchObject({
      draft: {
        currentStep: 2,
        values: { aadhaarName: "Priya Sharma" },
        maskedValues: { uan: "XXXX XXXX 4321" },
      },
    });
    expect(JSON.stringify(resumed)).not.toContain("Other Run Name");
  });
});
