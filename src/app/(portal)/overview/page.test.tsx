import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import type { MemberSnapshot } from "@/domain/member-snapshot";
import OverviewPage from "./page";

const pageState = vi.hoisted(() => ({
  snapshot: undefined as MemberSnapshot | undefined,
}));

vi.mock("@/server/auth/session", () => ({
  requireCurrentRun: vi.fn(async () => ({ demoRun: { id: "session-run" } })),
}));

vi.mock("@/server/repositories/member-repository", () => ({
  getCachedMemberSnapshot: vi.fn(async () => pageState.snapshot),
}));

function snapshot(overrides: Partial<MemberSnapshot> = {}): MemberSnapshot {
  return {
    persona: "NEW_MEMBER",
    profile: {
      displayName: "Rohan Mehta",
      uanMasked: "XXXX XXXX 0000",
      aadhaarName: "Rohan Mehta",
      bankName: "Rohan Mehta",
      panName: "Rohan Mehta",
      dateOfBirth: "1998-03-14",
      mobileMasked: "+91 ******2104",
      onboardingComplete: false,
    },
    kyc: [],
    employments: [],
    contributions: [],
    activeClaim: null,
    claimEvents: [],
    scenarioRuns: [],
    simulations: [],
    findings: [],
    nextAction: { label: "Complete bank verification", href: "/profile" },
    ...overrides,
  };
}

describe("OverviewPage", () => {
  beforeEach(() => {
    pageState.snapshot = snapshot();
  });

  test("defers claim readiness until a new member finishes profile verification", async () => {
    render(await OverviewPage());

    const section = screen.getByText("Claim readiness").closest("section");
    expect(section).not.toBeNull();
    expect(
      within(section as HTMLElement).getByText("Not assessed until profile verification"),
    ).toBeInTheDocument();
    expect(within(section as HTMLElement).queryByText("No blockers detected")).not.toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: "Complete bank verification" })[0],
    ).toHaveClass("portal-action-link");
  });

  test("labels missing-exit employment as previous and routes ledger actions to passbook", async () => {
    pageState.snapshot = snapshot({
      persona: "EXISTING_MEMBER",
      profile: { ...snapshot().profile, onboardingComplete: true },
      employments: [
        {
          employmentKey: "employment:current",
          memberIdMasked: "******************2345",
          establishmentName: "Sahyadri Mobility Components Pvt Ltd",
          joinedAt: "2021-04-12",
          exitedAt: null,
          epfMember: true,
          epsMember: true,
        },
      ],
      contributions: [
        {
          establishmentName: "Sahyadri Mobility Components Pvt Ltd",
          wageMonth: "2026-05",
          employeeEpf: 216_000,
          employerEpf: 66_600,
          employerEps: 149_400,
          postingStatus: "MISSING",
        },
      ],
      findings: [
        {
          code: "MISSING_EXIT_DATE",
          severity: "BLOCKER",
          owner: "EMPLOYER",
          title: "Exit date missing",
          explanation: "The previous employer must record the exit date.",
          allowedActions: ["REQUEST_EMPLOYER_EXIT_DATE"],
        },
        {
          code: "CONTRIBUTION_GAP_2026_05",
          severity: "WARNING",
          owner: "EMPLOYER",
          title: "Contribution missing for 2026-05",
          explanation: "The employer has not posted the contribution.",
          allowedActions: ["ASK_EMPLOYER_TO_FILE_CONTRIBUTION"],
        },
      ],
      nextAction: { label: "Resolve missing exit date", href: "/employment" },
    });

    render(await OverviewPage());

    const employment = screen.getByRole("heading", { name: "Employment record" }).closest("section");
    expect(employment).not.toBeNull();
    expect(
      within(employment as HTMLElement).getByText("Previous employment — exit update pending"),
    ).toBeInTheDocument();
    expect(within(employment as HTMLElement).getByText("Previous employer")).toBeInTheDocument();
    expect(
      within(employment as HTMLElement).getByRole("link", {
        name: "Review employment record",
      }),
    ).toHaveAttribute("href", "/employment");
    expect(
      within(employment as HTMLElement).getByRole("link", {
        name: "Review employment record",
      }),
    ).toHaveClass("portal-action-link");
    for (const link of screen.getAllByRole("link", { name: "Review contribution ledger" })) {
      expect(link).toHaveAttribute("href", "/passbook");
      expect(link).toHaveClass("portal-action-link");
    }
  });
});
