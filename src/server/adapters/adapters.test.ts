import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";

import { createDemoRun } from "@/db/demo-runs";
import { getDb } from "@/db/client";
import {
  demoUsers,
  employments,
  externalAdapterEvents,
  serviceRequests,
} from "@/db/schema";
import { DEMO_CREDENTIALS, seedAllDemoUsers } from "@/db/seed-data";
import {
  createIsolatedTestDatabase,
  type IsolatedTestDatabase,
} from "@/test/factories";
import { bankAdapter } from "./bank-adapter";
import { employerAdapter } from "./employer-adapter";

describe("mock external adapters", () => {
  let testDatabase: IsolatedTestDatabase;
  let demoRunId: string;
  let employmentId: string;

  beforeEach(async () => {
    testDatabase = await createIsolatedTestDatabase();
    await seedAllDemoUsers();
    const [user] = await getDb()
      .select()
      .from(demoUsers)
      .where(eq(demoUsers.id, DEMO_CREDENTIALS.existingMember.id));
    demoRunId = await createDemoRun(user.id);
    const [employment] = await getDb()
      .select({ id: employments.id })
      .from(employments)
      .where(eq(employments.demoRunId, demoRunId));
    employmentId = employment.id;
  });

  afterEach(async () => {
    await testDatabase.cleanup();
  });

  test("employer exit-date correction updates only the target employment and records a simulated event", async () => {
    const otherRunId = await createDemoRun(DEMO_CREDENTIALS.existingMember.id);
    const [otherEmployment] = await getDb()
      .select({ id: employments.id })
      .from(employments)
      .where(eq(employments.demoRunId, otherRunId));

    const result = await employerAdapter.execute({
      type: "UPDATE_EXIT_DATE",
      demoRunId,
      employmentId,
      exitDate: "2026-07-31",
    });

    expect(result).toMatchObject({
      actor: "EMPLOYER",
      eventType: "UPDATE_EXIT_DATE",
      simulated: true,
      explanation: expect.stringMatching(/simulated employer/i),
      previousState: { exitedAt: null },
      newState: { exitedAt: "2026-07-31" },
    });
    const [employment] = await getDb()
      .select({ exitedAt: employments.exitedAt })
      .from(employments)
      .where(eq(employments.id, employmentId));
    const [otherEmploymentAfter] = await getDb()
      .select({ exitedAt: employments.exitedAt })
      .from(employments)
      .where(eq(employments.id, otherEmployment.id));
    const [request] = await getDb()
      .select({ status: serviceRequests.status, resolvedAt: serviceRequests.resolvedAt })
      .from(serviceRequests)
      .where(eq(serviceRequests.demoRunId, demoRunId));
    const events = await getDb()
      .select()
      .from(externalAdapterEvents)
      .where(eq(externalAdapterEvents.demoRunId, demoRunId));

    expect(employment.exitedAt).toBe("2026-07-31");
    expect(otherEmploymentAfter.exitedAt).toBeNull();
    expect(request.status).toBe("RESOLVED");
    expect(request.resolvedAt).toBeTruthy();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      actor: "EMPLOYER",
      eventType: "UPDATE_EXIT_DATE",
      simulated: true,
    });
  });

  test("bank verification cannot resolve an employer-owned missing exit date", async () => {
    const result = await bankAdapter.execute({
      type: "VERIFY_BANK_ACCOUNT",
      demoRunId,
    });

    const [employment] = await getDb()
      .select({ exitedAt: employments.exitedAt })
      .from(employments)
      .where(eq(employments.id, employmentId));
    const [request] = await getDb()
      .select({ owner: serviceRequests.owner, status: serviceRequests.status })
      .from(serviceRequests)
      .where(eq(serviceRequests.demoRunId, demoRunId));

    expect(result).toMatchObject({
      actor: "BANK",
      eventType: "VERIFY_BANK_ACCOUNT",
      simulated: true,
    });
    expect(employment.exitedAt).toBeNull();
    expect(request).toEqual({ owner: "EMPLOYER", status: "OPEN" });
  });
});
