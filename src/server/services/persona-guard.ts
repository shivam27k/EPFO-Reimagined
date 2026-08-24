import { eq } from "drizzle-orm";

import { getDb } from "@/db/client";
import { demoRuns } from "@/db/schema";

type GuardDatabase = Pick<ReturnType<typeof getDb>, "select">;

export class PersonaForbiddenError extends Error {
  constructor() {
    super("New-member onboarding is not available for this demo persona.");
    this.name = "PersonaForbiddenError";
  }
}

export async function assertNewMemberRun(db: GuardDatabase, demoRunId: string) {
  const [run] = await db
    .select({ persona: demoRuns.persona })
    .from(demoRuns)
    .where(eq(demoRuns.id, demoRunId));

  if (!run || run.persona !== "NEW_MEMBER") {
    throw new PersonaForbiddenError();
  }
}

