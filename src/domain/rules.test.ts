import { describe, expect, test } from "vitest";

import { evaluateClaimReadiness } from "./claim-rules";
import { evaluateContributions } from "./contribution-rules";
import { evaluateOnboarding } from "./onboarding-rules";
import type { ClaimStatus, MemberSnapshot } from "./types";

type SnapshotInput = MemberSnapshot & {
  identity: {
    activated: boolean;
  };
  bank: {
    verificationStatus: "PENDING" | "VERIFIED";
    changeRequestPending: boolean;
  };
  employment: {
    exitDate: string | null;
    unemploymentAsOf: string;
  };
  contributions: Array<{
    wageMonth: string;
    status: "POSTED" | "MISSING";
  }>;
  claims: Array<{
    type: "FINAL_SETTLEMENT";
    status: ClaimStatus;
  }>;
};

function snapshot(overrides: Partial<SnapshotInput> = {}): SnapshotInput {
  return {
    demoRunId: "demo-run-1",
    persona: "EXISTING_MEMBER",
    profile: {
      uan: "100200300400",
      aadhaarName: "Priya Sharma",
      bankName: "Priya Sharma",
      panName: "Priya Sharma",
      dateOfBirth: "1991-04-12",
      mobileMasked: "******1234",
      onboardingComplete: true,
    },
    identity: {
      activated: true,
    },
    bank: {
      verificationStatus: "VERIFIED",
      changeRequestPending: false,
    },
    employment: {
      exitDate: "2026-06-15",
      unemploymentAsOf: "2026-08-21",
    },
    contributions: [
      { wageMonth: "2026-05", status: "POSTED" },
      { wageMonth: "2026-06", status: "POSTED" },
    ],
    claims: [],
    findings: [],
    ...overrides,
  };
}

function snapshotWithBankName(bankName: string): SnapshotInput {
  return snapshot({
    profile: {
      ...snapshot().profile,
      bankName,
    },
  });
}

function snapshotWithoutExitDate(): SnapshotInput {
  return snapshot({
    employment: {
      exitDate: null,
      unemploymentAsOf: "2026-08-21",
    },
  });
}

function snapshotMissingJuneContribution(): SnapshotInput {
  return snapshot({
    contributions: [
      { wageMonth: "2026-05", status: "POSTED" },
      { wageMonth: "2026-06", status: "MISSING" },
    ],
  });
}

describe("deterministic rule evaluation", () => {
  test("blocks onboarding when bank name differs after normalization", () => {
    expect(evaluateOnboarding(snapshotWithBankName("Priya R Sharma"))).toContainEqual(
      expect.objectContaining({
        code: "BANK_NAME_MISMATCH",
        severity: "BLOCKER",
        owner: "BANK",
      }),
    );
  });

  test("blocks onboarding when PAN name differs from the canonical identity", () => {
    expect(
      evaluateOnboarding(
        snapshot({
          profile: {
            ...snapshot().profile,
            panName: "Priya R Sharma",
          },
        }),
      ),
    ).toContainEqual(
      expect.objectContaining({
        code: "PAN_NAME_MISMATCH",
        severity: "BLOCKER",
        owner: "MEMBER",
      }),
    );
  });

  test("normalizes case, punctuation, and whitespace before comparing names", () => {
    expect(evaluateOnboarding(snapshotWithBankName("  priya.   sharma!  "))).not.toContainEqual(
      expect.objectContaining({ code: "BANK_NAME_MISMATCH" }),
    );
    expect(evaluateOnboarding(snapshotWithBankName("Priy Sharma"))).toContainEqual(
      expect.objectContaining({ code: "BANK_NAME_MISMATCH" }),
    );
  });

  test("normalizes composed and decomposed Unicode names before comparing names", () => {
    expect(
      evaluateOnboarding(
        snapshot({
          profile: {
            ...snapshot().profile,
            aadhaarName: "Priya \u0160arma",
            bankName: "priya S\u030Carma",
          },
        }),
      ),
    ).not.toContainEqual(expect.objectContaining({ code: "BANK_NAME_MISMATCH" }));
  });

  test("blocks claim readiness when employer has not recorded an exit date", () => {
    expect(evaluateClaimReadiness(snapshotWithoutExitDate())).toContainEqual(
      expect.objectContaining({
        code: "MISSING_EXIT_DATE",
        owner: "EMPLOYER",
      }),
    );
  });

  test("blocks claim readiness when the exit date is not a valid ISO calendar date", () => {
    expect(
      evaluateClaimReadiness(
        snapshot({
          employment: {
            exitDate: "2026-02-31",
            unemploymentAsOf: "2026-05-01",
          },
        }),
      ),
    ).toContainEqual(
      expect.objectContaining({
        code: "INVALID_EXIT_DATE",
        severity: "BLOCKER",
        owner: "EMPLOYER",
        allowedActions: ["REQUEST_EMPLOYER_EXIT_DATE"],
      }),
    );
  });

  test("blocks claim readiness when the unemployment reference date is missing or invalid", () => {
    expect(
      evaluateClaimReadiness(
        snapshot({
          employment: {
            exitDate: "2026-06-15",
            unemploymentAsOf: "2026-13-01",
          },
        }),
      ),
    ).toContainEqual(
      expect.objectContaining({
        code: "INVALID_UNEMPLOYMENT_REFERENCE_DATE",
        severity: "BLOCKER",
        owner: "EPFO",
        allowedActions: ["REFRESH_MEMBER_SNAPSHOT"],
      }),
    );

    expect(
      evaluateClaimReadiness(
        snapshot({
          employment: {
            exitDate: "2026-06-15",
          } as SnapshotInput["employment"],
        }),
      ),
    ).toContainEqual(
      expect.objectContaining({
        code: "INVALID_UNEMPLOYMENT_REFERENCE_DATE",
        severity: "BLOCKER",
        owner: "EPFO",
        allowedActions: ["REFRESH_MEMBER_SNAPSHOT"],
      }),
    );
  });

  test("uses the explicit snapshot reference date for two-month unemployment", () => {
    expect(
      evaluateClaimReadiness(
        snapshot({
          employment: {
            exitDate: "2026-07-01",
            unemploymentAsOf: "2026-08-21",
          },
        }),
      ),
    ).toContainEqual(
      expect.objectContaining({
        code: "TWO_MONTH_UNEMPLOYMENT_NOT_MET",
        owner: "MEMBER",
      }),
    );
  });

  test("clamps month-end two-month unemployment threshold to the target month end", () => {
    expect(
      evaluateClaimReadiness(
        snapshot({
          employment: {
            exitDate: "2026-12-31",
            unemploymentAsOf: "2027-02-27",
          },
        }),
      ),
    ).toContainEqual(
      expect.objectContaining({
        code: "TWO_MONTH_UNEMPLOYMENT_NOT_MET",
        owner: "MEMBER",
      }),
    );

    expect(
      evaluateClaimReadiness(
        snapshot({
          employment: {
            exitDate: "2026-12-31",
            unemploymentAsOf: "2027-02-28",
          },
        }),
      ),
    ).not.toContainEqual(
      expect.objectContaining({
        code: "TWO_MONTH_UNEMPLOYMENT_NOT_MET",
      }),
    );
  });

  test("allows claim readiness on the exact two-month threshold day but not one day earlier", () => {
    expect(
      evaluateClaimReadiness(
        snapshot({
          employment: {
            exitDate: "2026-06-15",
            unemploymentAsOf: "2026-08-14",
          },
        }),
      ),
    ).toContainEqual(
      expect.objectContaining({
        code: "TWO_MONTH_UNEMPLOYMENT_NOT_MET",
        owner: "MEMBER",
      }),
    );

    expect(
      evaluateClaimReadiness(
        snapshot({
          employment: {
            exitDate: "2026-06-15",
            unemploymentAsOf: "2026-08-15",
          },
        }),
      ),
    ).not.toContainEqual(
      expect.objectContaining({
        code: "TWO_MONTH_UNEMPLOYMENT_NOT_MET",
      }),
    );
  });

  test("blocks claim readiness for inactive identity, unverified bank, pending bank change, and duplicate final settlement", () => {
    expect(
      evaluateClaimReadiness(
        snapshot({
          identity: {
            activated: false,
          },
          bank: {
            verificationStatus: "PENDING",
            changeRequestPending: true,
          },
          claims: [
            {
              type: "FINAL_SETTLEMENT",
              status: "SUBMITTED",
            },
          ],
        }),
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "IDENTITY_NOT_ACTIVATED", owner: "AADHAAR" }),
        expect.objectContaining({ code: "BANK_NOT_VERIFIED", owner: "BANK" }),
        expect.objectContaining({ code: "PENDING_BANK_CHANGE", owner: "BANK" }),
        expect.objectContaining({ code: "ACTIVE_FINAL_SETTLEMENT_CLAIM_EXISTS", owner: "EPFO" }),
      ]),
    );
  });

  test.each([
    "DRAFT",
    "SUBMITTED",
    "UNDER_REVIEW",
    "APPROVED",
    "PAYMENT_SENT",
    "PAYMENT_RETURNED",
  ] satisfies ClaimStatus[])(
    "blocks duplicate final settlement claims when an existing claim is %s",
    (status) => {
      expect(
        evaluateClaimReadiness(
          snapshot({
            claims: [
              {
                type: "FINAL_SETTLEMENT",
                status,
              },
            ],
          }),
        ),
      ).toContainEqual(
        expect.objectContaining({
          code: "ACTIVE_FINAL_SETTLEMENT_CLAIM_EXISTS",
          owner: "EPFO",
        }),
      );
    },
  );

  test.each(["SETTLED", "REJECTED"] satisfies ClaimStatus[])(
    "does not block duplicate final settlement claims when an existing claim is %s",
    (status) => {
      expect(
        evaluateClaimReadiness(
          snapshot({
            claims: [
              {
                type: "FINAL_SETTLEMENT",
                status,
              },
            ],
          }),
        ),
      ).not.toContainEqual(
        expect.objectContaining({
          code: "ACTIVE_FINAL_SETTLEMENT_CLAIM_EXISTS",
        }),
      );
    },
  );

  test("reports missing contributions with the exact wage month in the finding code", () => {
    expect(evaluateContributions(snapshotMissingJuneContribution())).toContainEqual(
      expect.objectContaining({
        code: "CONTRIBUTION_GAP_2026_06",
        severity: "WARNING",
      }),
    );
  });
});
