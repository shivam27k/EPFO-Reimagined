import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";

import type { MemberSnapshot } from "@/domain/member-snapshot";
import { PortalUtilities } from "./portal-utilities";

vi.mock("next/navigation", () => ({ usePathname: () => "/overview" }));
vi.mock("@/components/assistant/assistant-panel", () => ({
  AssistantPanel: ({ onVoiceActiveChange }: { onVoiceActiveChange?(active: boolean): void }) => (
    <button onClick={() => onVoiceActiveChange?.(true)} type="button">Activate mock voice</button>
  ),
}));
vi.mock("@/components/demo/scenario-drawer", () => ({ ScenarioDrawer: () => null }));

function snapshot(overrides: Partial<MemberSnapshot> = {}): MemberSnapshot {
  return {
    persona: "NEW_MEMBER",
    profile: {
      displayName: "Rohan Mehta",
      uanMasked: "XXXX XXXX 4321",
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
    latestClaim: null,
    claimEvents: [],
    scenarioRuns: [],
    simulations: [],
    findings: [],
    nextAction: { label: "Complete new-member setup", href: "/onboarding" },
    ...overrides,
  };
}

describe("PortalUtilities", () => {
  test("marks the utility rail while voice mode is active", () => {
    render(<PortalUtilities snapshot={snapshot()} />);

    const utilities = screen.getByRole("button", { name: "Activate mock voice" }).closest(".portal-utilities");
    expect(utilities).toHaveAttribute("data-voice-active", "false");

    fireEvent.click(screen.getByRole("button", { name: "Activate mock voice" }));

    expect(utilities).toHaveAttribute("data-voice-active", "true");
  });

  test("loads the latest member snapshot when the journey drawer opens", async () => {
    const latest = snapshot({
      profile: { ...snapshot().profile, onboardingComplete: true },
      nextAction: { label: "Review contribution history", href: "/passbook" },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => latest,
    }));

    render(<PortalUtilities snapshot={snapshot()} />);
    fireEvent.click(screen.getByRole("button", { name: "Your EPF journey" }));

    expect(await screen.findByRole("link", { name: "Review contribution history" })).toHaveAttribute(
      "href",
      "/passbook",
    );
    expect(fetch).toHaveBeenCalledWith("/api/member/snapshot", { cache: "no-store" });
  });

  test("closes the journey drawer when its next action is selected", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => snapshot(),
    }));

    render(<PortalUtilities snapshot={snapshot()} />);
    fireEvent.click(screen.getByRole("button", { name: "Your EPF journey" }));

    const drawer = screen.getByRole("dialog", { name: "Your EPF journey" });
    fireEvent.click(await screen.findByRole("link", { name: "Complete new-member setup" }));

    expect(drawer).toHaveAttribute("aria-hidden", "true");
  });
});
