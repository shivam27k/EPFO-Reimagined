import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { createDemoRun } from "@/db/demo-runs";
import {
  contributions,
  conversationMessages,
  demoUsers,
  memberProfiles,
  onboardingDrafts,
  scenarioRuns,
  sessions,
} from "@/db/schema";
import { DEMO_CREDENTIALS, seedAllDemoUsers } from "@/db/seed-data";
import {
  createIsolatedTestDatabase,
  type IsolatedTestDatabase,
} from "@/test/factories";
import { getMemberSnapshot } from "@/server/repositories/member-repository";

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

function commandRequest(path: string, command: string, query = "") {
  return new Request(`http://localhost${path}${query}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ command }),
  });
}

describe("authenticated onboarding scenarios", () => {
  let testDatabase: IsolatedTestDatabase;
  let authenticatedRunId: string;
  let otherRunId: string;

  beforeEach(async () => {
    testDatabase = await createIsolatedTestDatabase();
    await seedAllDemoUsers();
    const [user] = await getDb()
      .select()
      .from(demoUsers)
      .where(eq(demoUsers.id, DEMO_CREDENTIALS.newMember.id));
    authenticatedRunId = await createDemoRun(user.id);
    otherRunId = await createDemoRun(user.id);
    await getDb().insert(sessions).values({
      id: "scenario-test-session",
      userId: user.id,
      demoRunId: authenticatedRunId,
      expiresAt: "2099-01-01T00:00:00.000Z",
    });
    cookieState.incomingSessionId = "scenario-test-session";
  });

  afterEach(async () => {
    cookieState.incomingSessionId = undefined;
    await testDatabase.cleanup();
  });

  test("loads and resolves the bank mismatch through transactional scenario stages", async () => {
    const { POST } = await import("./load/route");

    const loaded = await POST(
      commandRequest(
        "/api/scenarios/load",
        "LOAD_ISSUE",
        `?demoRunId=${otherRunId}`,
      ),
    );
    expect(loaded.status).toBe(200);
    expect(await loaded.json()).toMatchObject({
      profile: { bankName: "Rohan K Mehta", onboardingComplete: false },
      findings: [expect.objectContaining({ code: "BANK_NAME_MISMATCH" })],
      scenarioRuns: [
        expect.objectContaining({
          scenarioKey: "ONBOARDING_NAME_MISMATCH",
          stage: "ISSUE_LOADED",
        }),
      ],
    });

    const requested = await POST(
      commandRequest("/api/scenarios/load", "REQUEST_ACTION"),
    );
    expect(requested.status).toBe(200);
    expect((await requested.json()).scenarioRuns).toContainEqual(
      expect.objectContaining({ stage: "ACTION_REQUESTED" }),
    );

    const resolved = await POST(commandRequest("/api/scenarios/load", "RESOLVE"));
    expect(resolved.status).toBe(200);
    expect(await resolved.json()).toMatchObject({
      profile: { bankName: "Rohan Mehta", onboardingComplete: true },
      scenarioRuns: [expect.objectContaining({ stage: "RESOLVED" })],
    });

    const [otherProfile] = await getDb()
      .select()
      .from(memberProfiles)
      .where(eq(memberProfiles.demoRunId, otherRunId));
    expect(otherProfile.bankName).toBe("Rohan Mehta");
  });

  test("reloading an already loaded bank mismatch is idempotent", async () => {
    const { POST } = await import("./load/route");

    const first = await POST(commandRequest("/api/scenarios/load", "LOAD_ISSUE"));
    const second = await POST(commandRequest("/api/scenarios/load", "LOAD_ISSUE"));

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await second.json()).toMatchObject({
      profile: { bankName: "Rohan K Mehta", onboardingComplete: false },
      findings: [expect.objectContaining({ code: "BANK_NAME_MISMATCH" })],
      scenarioRuns: [expect.objectContaining({
        scenarioKey: "ONBOARDING_NAME_MISMATCH",
        stage: "ISSUE_LOADED",
      })],
    });
  });

  test("advances time with exactly six deterministic contributions and is idempotent", async () => {
    const { POST } = await import("./advance/route");
    const first = await POST(commandRequest("/api/scenarios/advance", "ADVANCE_TIME"));
    const second = await POST(commandRequest("/api/scenarios/advance", "ADVANCE_TIME"));

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const snapshot = await second.json();
    expect(snapshot.contributions).toHaveLength(6);
    expect(snapshot.contributions.map((row: { wageMonth: string }) => row.wageMonth)).toEqual([
      "2027-01",
      "2026-12",
      "2026-11",
      "2026-10",
      "2026-09",
      "2026-08",
    ]);

    expect(await getDb().select().from(contributions)).toHaveLength(6);
    const intervalMessages = await getDb()
      .select()
      .from(conversationMessages)
      .where(eq(conversationMessages.demoRunId, authenticatedRunId));
    expect(intervalMessages).toEqual([
      expect.objectContaining({
        role: "system",
        content: "SIMULATED_INTERVAL: 2026-08 through 2027-01 (six fictional wage months).",
      }),
    ]);
    expect(snapshot.simulations).toEqual([
      expect.objectContaining({
        kind: "TIME_ADVANCE",
        intervalLabel: "August 2026 to January 2027",
        months: 6,
      }),
    ]);
    expect((await getMemberSnapshot(authenticatedRunId)).simulations).toEqual(
      snapshot.simulations,
    );
  });

  test("reset affects only the authenticated run and restores scenario conversation state", async () => {
    const { POST: load } = await import("./load/route");
    const { POST: reset } = await import("./reset/route");
    await getDb()
      .update(memberProfiles)
      .set({ bankName: "Other Judge Name" })
      .where(eq(memberProfiles.demoRunId, otherRunId));
    await load(commandRequest("/api/scenarios/load", "LOAD_ISSUE"));

    const response = await reset(
      commandRequest("/api/scenarios/reset", "RESET", `?demoRunId=${otherRunId}`),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      profile: { displayName: "Rohan Mehta", onboardingComplete: false },
      scenarioRuns: [expect.objectContaining({ stage: "START" })],
    });
    const [otherProfile] = await getDb()
      .select()
      .from(memberProfiles)
      .where(eq(memberProfiles.demoRunId, otherRunId));
    expect(otherProfile.bankName).toBe("Other Judge Name");
    expect(
      await getDb()
        .select()
        .from(conversationMessages)
        .where(eq(conversationMessages.demoRunId, authenticatedRunId)),
    ).toHaveLength(0);
  });

  test("rejects commands outside the exact scenario command set", async () => {
    const { POST } = await import("./load/route");
    const response = await POST(commandRequest("/api/scenarios/load", "ARCHIVE"));
    expect(response.status).toBe(422);
    expect(await getDb().select().from(scenarioRuns)).toHaveLength(2);
  });

  test.each([
    ["/api/scenarios/load", "LOAD_VALID_DATA"],
    ["/api/scenarios/load", "LOAD_ISSUE"],
    ["/api/scenarios/load", "REQUEST_ACTION"],
    ["/api/scenarios/load", "RESOLVE"],
    ["/api/scenarios/advance", "ADVANCE_TIME"],
  ])("rejects %s %s for an existing member without mutations", async (path, command) => {
    const [existingUser] = await getDb()
      .select()
      .from(demoUsers)
      .where(eq(demoUsers.id, DEMO_CREDENTIALS.existingMember.id));
    const existingRunId = await createDemoRun(existingUser.id);
    await getDb().insert(sessions).values({
      id: `existing-scenario-${command}`,
      userId: existingUser.id,
      demoRunId: existingRunId,
      expiresAt: "2099-01-01T00:00:00.000Z",
    });
    cookieState.incomingSessionId = `existing-scenario-${command}`;
    const before = await getMemberSnapshot(existingRunId);
    const route = path.endsWith("advance")
      ? await import("./advance/route")
      : await import("./load/route");

    const response = await route.POST(commandRequest(path, command));

    expect(response.status).toBe(403);
    expect(await getMemberSnapshot(existingRunId)).toEqual(before);
  });

  test("RESET remains available to an existing member and clears its own draft only", async () => {
    const [existingUser] = await getDb().select().from(demoUsers).where(eq(demoUsers.id, DEMO_CREDENTIALS.existingMember.id));
    const existingRunId = await createDemoRun(existingUser.id);
    await getDb().insert(sessions).values({
      id: "existing-reset-session",
      userId: existingUser.id,
      demoRunId: existingRunId,
      expiresAt: "2099-01-01T00:00:00.000Z",
    });
    cookieState.incomingSessionId = "existing-reset-session";
    await getDb().insert(onboardingDrafts).values({
      demoRunId: existingRunId,
      currentStep: 1,
      disclosureAccepted: true,
      valuesJson: JSON.stringify({ aadhaarName: "Safe fictional draft" }),
      updatedAt: "2026-08-21T00:00:00.000Z",
    });
    const { POST } = await import("./reset/route");
    const response = await POST(commandRequest("/api/scenarios/reset", "RESET"));
    expect(response.status).toBe(200);
    const drafts = await getDb().select().from(onboardingDrafts).where(eq(onboardingDrafts.demoRunId, existingRunId));
    expect(drafts).toHaveLength(0);
  });
});
