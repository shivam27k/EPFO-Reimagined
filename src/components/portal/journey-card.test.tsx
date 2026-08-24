import { render, screen, within } from "@testing-library/react";

import type { MemberSnapshot } from "@/domain/member-snapshot";
import { JourneyCard } from "./journey-card";

function newMemberSnapshot(): MemberSnapshot {
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
    kyc: [
      {
        type: "AADHAAR",
        valueMasked: "XXXX-XXXX-4321",
        status: "NOT_STARTED",
        updatedAt: "2026-08-01T09:00:00.000Z",
      },
      {
        type: "PAN",
        valueMasked: "ABCDE****F",
        status: "NOT_STARTED",
        updatedAt: "2026-08-01T09:00:00.000Z",
      },
      {
        type: "BANK",
        valueMasked: "HDFC ****1188",
        status: "NOT_STARTED",
        updatedAt: "2026-08-01T09:00:00.000Z",
      },
    ],
    employments: [],
    contributions: [],
    activeClaim: null,
    claimEvents: [],
    scenarioRuns: [],
    simulations: [],
    findings: [],
    nextAction: { label: "Complete bank verification", href: "/profile" },
  };
}

function existingMemberSnapshot(): MemberSnapshot {
  return {
    ...newMemberSnapshot(),
    persona: "EXISTING_MEMBER",
    profile: {
      ...newMemberSnapshot().profile,
      displayName: "Ananya Sharma",
      uanMasked: "XXXX XXXX 7890",
      onboardingComplete: true,
    },
    kyc: [
      {
        type: "AADHAAR",
        valueMasked: "XXXX-XXXX-9087",
        status: "VERIFIED",
        updatedAt: "2026-07-01T10:00:00.000Z",
      },
      {
        type: "PAN",
        valueMasked: "ANAPS****K",
        status: "VERIFIED",
        updatedAt: "2026-07-01T10:00:00.000Z",
      },
      {
        type: "BANK",
        valueMasked: "ICICI ****2442",
        status: "MISMATCH",
        updatedAt: "2026-07-01T10:00:00.000Z",
      },
    ],
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
      {
        establishmentName: "Sahyadri Mobility Components Pvt Ltd",
        wageMonth: "2026-04",
        employeeEpf: 216_000,
        employerEpf: 66_600,
        employerEps: 149_400,
        postingStatus: "POSTED",
      },
    ],
    activeClaim: {
      type: "FINAL_SETTLEMENT",
      amount: 12_845_000,
      status: "DRAFT",
      submittedAt: null,
    },
    findings: [
      {
        code: "BANK_NAME_MISMATCH",
        severity: "BLOCKER",
        owner: "BANK",
        title: "Bank name does not match Aadhaar",
        explanation: "The bank account holder name must match the member identity.",
        allowedActions: ["UPDATE_BANK_DETAILS", "VERIFY_BANK_KYC"],
      },
      {
        code: "CONTRIBUTION_GAP_2026_05",
        severity: "WARNING",
        owner: "EMPLOYER",
        title: "Contribution missing for 2026-05",
        explanation: "The employer has not posted the contribution for this wage month.",
        allowedActions: ["ASK_EMPLOYER_TO_FILE_CONTRIBUTION"],
      },
      {
        code: "MISSING_EXIT_DATE",
        severity: "BLOCKER",
        owner: "EMPLOYER",
        title: "Exit date missing",
        explanation: "The employer must record the member exit date before final settlement.",
        allowedActions: ["REQUEST_EMPLOYER_EXIT_DATE"],
      },
    ],
    nextAction: { label: "Resolve missing exit date", href: "/employment" },
  };
}

describe("JourneyCard", () => {
  test("guides a new member through KYC without assistant interaction", () => {
    render(<JourneyCard snapshot={newMemberSnapshot()} />);

    const rail = screen.getByRole("list", { name: /epf journey/i });
    expect(within(rail).getByText("Completed")).toBeInTheDocument();
    expect(within(rail).getByText("Current")).toBeInTheDocument();
    expect(within(rail).getAllByText("Upcoming").length).toBeGreaterThan(0);
    expect(screen.getByText(/onboarding progress/i).closest("p")).toHaveTextContent(
      "1 of 5 complete",
    );
    expect(screen.getByRole("link", { name: "Complete bank verification" })).toHaveAttribute(
      "href",
      "/profile",
    );
  });

  test("names the previous employer as owner when an exit date blocks a claim", () => {
    render(<JourneyCard snapshot={existingMemberSnapshot()} />);

    const blockedMilestone = screen.getByRole("heading", {
      name: "Record employment exit",
    }).closest("li");
    expect(blockedMilestone).not.toBeNull();
    expect(
      within(blockedMilestone as HTMLLIElement).getByText("Previous employer", {
        selector: "strong",
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Resolve missing exit date" })).toHaveAttribute(
      "href",
      "/employment",
    );
  });

  test("derives KYC and contribution attention from actual records and findings", () => {
    render(<JourneyCard snapshot={existingMemberSnapshot()} />);

    const kycMilestone = screen.getByRole("heading", {
      name: "Verify identity and bank",
    }).closest("li");
    const contributionMilestone = screen.getByRole("heading", {
      name: "Build contribution history",
    }).closest("li");

    expect(kycMilestone).toHaveAttribute("data-status", "blocked");
    expect(within(kycMilestone as HTMLLIElement).getByText("Blocked")).toBeInTheDocument();
    expect(contributionMilestone).toHaveAttribute("data-status", "current");
    expect(
      within(contributionMilestone as HTMLLIElement).getByText("Current"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Resolve missing exit date" })).toHaveAttribute(
      "href",
      "/employment",
    );
  });
});
