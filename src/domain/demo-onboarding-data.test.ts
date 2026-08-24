import { describe, expect, test } from "vitest";

import { DEMO_CREDENTIALS } from "@/db/seed-data";
import { validDemoOnboardingData } from "./demo-onboarding-data";

describe("new-member demo onboarding data", () => {
  test("preserves the seeded member identity across autofilled KYC names", () => {
    const seededName = DEMO_CREDENTIALS.newMember.displayName;

    expect(validDemoOnboardingData.aadhaarName).toBe(seededName);
    expect(validDemoOnboardingData.panName).toBe(seededName);
    expect(validDemoOnboardingData.bankName).toBe(seededName);
  });
});
