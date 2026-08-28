import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";

import type { MemberSnapshot } from "@/domain/member-snapshot";
import EmploymentPage from "./page";

const pageState = vi.hoisted(() => ({
  snapshot: undefined as MemberSnapshot | undefined,
}));

vi.mock("@/server/auth/session", () => ({
  getCachedCurrentRun: vi.fn(async () => ({ demoRun: { id: "session-run" } })),
}));

vi.mock("@/server/repositories/member-repository", () => ({
  getCachedMemberSnapshot: vi.fn(async () => pageState.snapshot),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

test("shows Mark exit when a new member has an open employment record without a claim finding", async () => {
  pageState.snapshot = {
    persona: "NEW_MEMBER",
    profile: {
      displayName: "Rohan Mehta",
      uanMasked: "XXXX XXXX 4321",
      aadhaarName: "Rohan Mehta",
      bankName: "Rohan Mehta",
      panName: "Rohan Mehta",
      dateOfBirth: "1998-03-14",
      mobileMasked: "+91 ******2104",
      onboardingComplete: true,
    },
    kyc: [],
    employments: [{
      employmentKey: "employment:current",
      memberIdMasked: "******************4321",
      establishmentName: "Sahyadri Demo Components Pvt Ltd",
      joinedAt: "2026-07-01",
      exitedAt: null,
      epfMember: true,
      epsMember: true,
    }],
    contributions: [],
    activeClaim: null,
    claimEvents: [],
    scenarioRuns: [],
    simulations: [],
    findings: [],
    nextAction: { label: "Review contributions", href: "/passbook" },
  };

  render(await EmploymentPage());

  expect(screen.getByRole("heading", { name: "Mark exit yourself" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Mark exit" })).toHaveAttribute(
    "href",
    "/employment/mark-exit",
  );
  expect(screen.queryByText("Employment record complete")).not.toBeInTheDocument();
});
