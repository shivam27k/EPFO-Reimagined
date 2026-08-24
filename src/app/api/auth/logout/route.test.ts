import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { createDemoRun } from "@/db/demo-runs";
import {
  claims,
  demoRuns,
  demoUsers,
  employments,
  memberProfiles,
  scenarioRuns,
  serviceRequests,
  sessions,
} from "@/db/schema";
import { DEMO_CREDENTIALS, seedAllDemoUsers } from "@/db/seed-data";
import {
  createIsolatedTestDatabase,
  type IsolatedTestDatabase,
} from "@/test/factories";
import { POST as login } from "../login/route";
import { POST as logout } from "./route";

const cookieState = vi.hoisted(() => ({
  incomingSessionId: undefined as string | undefined,
  setCalls: [] as {
    name: string;
    value: string;
    options?: Record<string, unknown>;
  }[],
  deleteCalls: [] as string[],
  throwOnSet: false,
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) => {
      if (name !== "epf_sahayak_session" || !cookieState.incomingSessionId) {
        return undefined;
      }

      return { name, value: cookieState.incomingSessionId };
    },
    set: (name: string, value: string, options?: Record<string, unknown>) => {
      if (cookieState.throwOnSet) {
        throw new Error("Cookie boundary failed");
      }

      cookieState.setCalls.push({ name, value, options });
    },
    delete: (name: string) => {
      cookieState.deleteCalls.push(name);
    },
  })),
}));

function loginRequest(username: string, password: string) {
  return new Request("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
}

async function loginExistingMember() {
  const response = await login(
    loginRequest(
      DEMO_CREDENTIALS.existingMember.username,
      DEMO_CREDENTIALS.existingMember.password,
    ),
  );

  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    persona: "EXISTING_MEMBER",
    redirectTo: "/overview",
  });

  const cookie = cookieState.setCalls.at(-1);
  expect(cookie).toMatchObject({
    name: "epf_sahayak_session",
    options: expect.objectContaining({
      httpOnly: true,
      sameSite: "lax",
      path: "/",
    }),
  });
  expect(cookie?.value).toEqual(expect.any(String));

  cookieState.incomingSessionId = cookie?.value;

  const [session] = await getDb()
    .select()
    .from(sessions)
    .where(eq(sessions.id, cookie?.value ?? ""));
  expect(session).toBeDefined();

  return session;
}

describe("POST /api/auth/logout", () => {
  let testDatabase: IsolatedTestDatabase;

  beforeEach(async () => {
    testDatabase = await createIsolatedTestDatabase();
    await seedAllDemoUsers();
    cookieState.incomingSessionId = undefined;
    cookieState.setCalls = [];
    cookieState.deleteCalls = [];
    cookieState.throwOnSet = false;
  });

  afterEach(async () => {
    await testDatabase.cleanup();
  });

  test("disposes the current run and gives the same persona a freshly seeded run on the next login", async () => {
    const db = getDb();
    const firstSession = await loginExistingMember();
    const firstRunId = firstSession.demoRunId;

    await db
      .update(claims)
      .set({ status: "SETTLED", submittedAt: "2026-08-02T11:00:00.000Z" })
      .where(eq(claims.demoRunId, firstRunId));

    const logoutResponse = await logout();

    expect(logoutResponse.status).toBe(200);
    expect(await logoutResponse.json()).toEqual({
      reset: true,
      redirectTo: "/login",
    });
    expect(cookieState.deleteCalls).toEqual(["epf_sahayak_session"]);

    const disposedRuns = await db
      .select()
      .from(demoRuns)
      .where(eq(demoRuns.id, firstRunId));
    expect(disposedRuns).toHaveLength(0);

    cookieState.incomingSessionId = undefined;
    const secondSession = await loginExistingMember();
    const secondRunId = secondSession.demoRunId;

    expect(secondRunId).not.toBe(firstRunId);

    const [secondClaim] = await db
      .select({ status: claims.status, submittedAt: claims.submittedAt })
      .from(claims)
      .where(eq(claims.demoRunId, secondRunId));
    const [secondEmployment] = await db
      .select({ exitedAt: employments.exitedAt })
      .from(employments)
      .where(eq(employments.demoRunId, secondRunId));

    expect(secondClaim).toEqual({ status: "DRAFT", submittedAt: null });
    expect(secondEmployment.exitedAt).toBeNull();
  });

  test("rejects a session row that points at another user's run", async () => {
    const db = getDb();
    const [newUser] = await db
      .select()
      .from(demoUsers)
      .where(eq(demoUsers.id, DEMO_CREDENTIALS.newMember.id));
    const [existingUser] = await db
      .select()
      .from(demoUsers)
      .where(eq(demoUsers.id, DEMO_CREDENTIALS.existingMember.id));
    const newMemberRunId = await createDemoRun(newUser.id);

    await db.insert(sessions).values({
      id: "malformed-cross-user-session",
      userId: existingUser.id,
      demoRunId: newMemberRunId,
      expiresAt: "2099-01-01T00:00:00.000Z",
    });
    cookieState.incomingSessionId = "malformed-cross-user-session";

    const response = await logout();

    expect(response.status).toBe(401);
    expect(cookieState.deleteCalls).toEqual([]);

    const remainingRuns = await db
      .select()
      .from(demoRuns)
      .where(eq(demoRuns.id, newMemberRunId));
    const remainingSessions = await db
      .select()
      .from(sessions)
      .where(eq(sessions.id, "malformed-cross-user-session"));

    expect(remainingRuns).toHaveLength(1);
    expect(remainingSessions).toHaveLength(0);
  });

  test("cleans up a freshly created run when session cookie creation fails", async () => {
    const db = getDb();
    cookieState.throwOnSet = true;

    const response = await login(
      loginRequest(
        DEMO_CREDENTIALS.existingMember.username,
        DEMO_CREDENTIALS.existingMember.password,
      ),
    );

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: "Could not start a demo session. Please try again.",
    });

    expect(await db.select().from(demoRuns)).toHaveLength(0);
    expect(await db.select().from(sessions)).toHaveLength(0);
    expect(await db.select().from(memberProfiles)).toHaveLength(0);
    expect(await db.select().from(employments)).toHaveLength(0);
    expect(await db.select().from(claims)).toHaveLength(0);
    expect(await db.select().from(serviceRequests)).toHaveLength(0);
    expect(await db.select().from(scenarioRuns)).toHaveLength(0);
  });

  test("keeps same-credential sessions isolated when one run is mutated", async () => {
    const db = getDb();
    const firstSession = await loginExistingMember();

    cookieState.incomingSessionId = undefined;
    const secondSession = await loginExistingMember();

    expect(secondSession.demoRunId).not.toBe(firstSession.demoRunId);
    expect(secondSession.id).not.toBe(firstSession.id);

    await db
      .update(claims)
      .set({ status: "SETTLED", submittedAt: "2026-08-03T09:00:00.000Z" })
      .where(eq(claims.demoRunId, firstSession.demoRunId));
    await db
      .update(employments)
      .set({ exitedAt: "2026-07-31" })
      .where(eq(employments.demoRunId, firstSession.demoRunId));

    const [firstClaim] = await db
      .select({ status: claims.status, submittedAt: claims.submittedAt })
      .from(claims)
      .where(eq(claims.demoRunId, firstSession.demoRunId));
    const [secondClaim] = await db
      .select({ status: claims.status, submittedAt: claims.submittedAt })
      .from(claims)
      .where(eq(claims.demoRunId, secondSession.demoRunId));
    const [secondEmployment] = await db
      .select({ exitedAt: employments.exitedAt })
      .from(employments)
      .where(eq(employments.demoRunId, secondSession.demoRunId));

    expect(firstClaim).toEqual({
      status: "SETTLED",
      submittedAt: "2026-08-03T09:00:00.000Z",
    });
    expect(secondClaim).toEqual({ status: "DRAFT", submittedAt: null });
    expect(secondEmployment.exitedAt).toBeNull();
  });
});
