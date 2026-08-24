import { afterEach, beforeEach, expect, test } from "vitest";
import { eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { createDemoRun } from "@/db/demo-runs";
import { demoUsers } from "@/db/schema";
import { DEMO_CREDENTIALS, seedAllDemoUsers } from "@/db/seed-data";
import { validDemoOnboardingData } from "@/domain/demo-onboarding-data";
import { createIsolatedTestDatabase, type IsolatedTestDatabase } from "@/test/factories";
import { saveOnboarding } from "./onboarding-service";
import { advanceOnboardingTime } from "./scenario-service";
import { markEmploymentExit } from "./mark-exit-service";

let testDatabase: IsolatedTestDatabase;

beforeEach(async () => {
  testDatabase = await createIsolatedTestDatabase();
  await seedAllDemoUsers();
});

afterEach(async () => {
  await testDatabase.cleanup();
});

test("accepts valid demo exit details using the advanced demo timeline", async () => {
  const [user] = await getDb()
    .select()
    .from(demoUsers)
    .where(eq(demoUsers.id, DEMO_CREDENTIALS.newMember.id));
  const runId = await createDemoRun(user.id);
  await saveOnboarding(runId, validDemoOnboardingData);
  await advanceOnboardingTime(runId);

  await expect(markEmploymentExit({
    demoRunId: runId,
    employmentKey: "employment:onboarding",
    exitDate: "2027-01-31",
    reason: "CESSATION_SHORT_SERVICE",
  })).resolves.toMatchObject({
    exitDate: "2027-01-31",
    latestContributionMonth: "2027-01",
  });
});
