import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { eq } from "drizzle-orm";

import { createDemoRun } from "@/db/demo-runs";
import { getDb } from "@/db/client";
import { demoUsers } from "@/db/schema";
import { DEMO_CREDENTIALS, seedAllDemoUsers } from "@/db/seed-data";
import { createIsolatedTestDatabase, type IsolatedTestDatabase } from "@/test/factories";
import { buildAssistantContext } from "./context";
import { respondToMember } from "./respond";

describe("assistant response grounding", () => {
  let testDatabase: IsolatedTestDatabase;
  let demoRunId: string;
  let previousApiKey: string | undefined;

  beforeEach(async () => {
    previousApiKey = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    testDatabase = await createIsolatedTestDatabase();
    await seedAllDemoUsers();
    const [user] = await getDb()
      .select()
      .from(demoUsers)
      .where(eq(demoUsers.id, DEMO_CREDENTIALS.existingMember.id));
    demoRunId = await createDemoRun(user.id);
  });

  afterEach(async () => {
    if (previousApiKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousApiKey;
    await testDatabase.cleanup();
  });

  test("builds masked context only", async () => {
    const context = await buildAssistantContext({ demoRunId, route: "/claims" });
    const serialized = JSON.stringify(context);

    expect(serialized).toContain("XXXX XXXX 7890");
    expect(serialized).not.toContain("1012 3456 7890");
    expect(serialized).not.toContain("PYBOM00424890000012345");
    expect(serialized).not.toContain(demoRunId);
  });

  test("expresses assistant monetary amounts exactly as displayed by the portal", async () => {
    const context = await buildAssistantContext({ demoRunId, route: "/passbook" });
    const modelSnapshot = context.maskedModelSnapshot as {
      contributions: Array<Record<string, unknown>>;
      contributionSummary: Record<string, unknown>;
      activeClaim: Record<string, unknown> | null;
    };

    expect(modelSnapshot.contributions[0]).toMatchObject({
      employeeEpfDisplayed: "₹2,160",
      employerEpfDisplayed: "₹666",
      employerEpsDisplayed: "₹1,494",
    });
    expect(modelSnapshot.contributions[0]).not.toHaveProperty("employeeEpf");
    expect(modelSnapshot.contributions[0]).not.toHaveProperty("employeeEpfInRupees");
    expect(modelSnapshot.contributionSummary).toMatchObject({
      currency: "INR",
      displayUnit: "whole rupees",
      postedEpfBalanceDisplayed: expect.stringMatching(/^₹/),
    });
    expect(modelSnapshot.activeClaim).toEqual(expect.objectContaining({
      amountDisplayed: expect.stringMatching(/^₹/),
    }));
    expect(modelSnapshot.activeClaim).not.toHaveProperty("amount");
    expect(modelSnapshot.activeClaim).not.toHaveProperty("amountInRupees");
  });

  test("fallback explains missing exit date and owner when OpenAI credentials are absent", async () => {
    const reply = await respondToMember({ demoRunId, route: "/claims", message: "Why is my claim blocked?" });

    expect(reply.usedFallback).toBe(true);
    expect(reply.text).toMatch(/employer/i);
    expect(reply.text).toMatch(/exit date/i);
  });

  test("mutation requests produce confirmation-gated proposals without database writes", async () => {
    const before = await buildAssistantContext({ demoRunId, route: "/claims" });
    const reply = await respondToMember({ demoRunId, route: "/claims", message: "Submit my claim now" });
    const after = await buildAssistantContext({ demoRunId, route: "/claims" });

    expect(reply.actions).toContainEqual(expect.objectContaining({
      type: "NAVIGATE",
      requiresConfirmation: true,
    }));
    expect(after.snapshot.activeClaim).toEqual(before.snapshot.activeClaim);
  });

  test("low-confidence intent asks a clarifying question and emits no action", async () => {
    const reply = await respondToMember({ demoRunId, route: "/overview", message: "hmm" });

    expect(reply.intent.confidence).toBeLessThan(0.7);
    expect(reply.actions).toHaveLength(0);
    expect(reply.text).toBe("I’m not sure what you need help with. What would you like to know about this page?");
    expect(reply.text).not.toContain("Bank name does not match Aadhaar");
  });
});
