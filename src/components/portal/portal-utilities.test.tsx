import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";

import type { MemberSnapshot } from "@/domain/member-snapshot";
import { PortalUtilities } from "./portal-utilities";

let pathname = "/overview";

vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
vi.mock("@/components/assistant/assistant-panel", () => ({
  AssistantPanel: ({
    contextStale,
    onViewChange,
    onVoiceActiveChange,
    modal,
    snapshot,
    view,
  }: {
    contextStale?: boolean;
    onViewChange?(view: "collapsed" | "docked" | "fullscreen"): void;
    onVoiceActiveChange?(active: boolean): void;
    modal?: boolean;
    snapshot?: MemberSnapshot;
    view?: string;
  }) => (
    <div className="assistant-area" data-context-name={snapshot?.profile.displayName} data-context-stale={contextStale} data-modal={modal} data-view={view}>
      <button onClick={() => onViewChange?.("docked")} type="button">Ask EPF Sahayak</button>
      <button onClick={() => onViewChange?.("fullscreen")} type="button">Maximize assistant</button>
      <button onClick={() => onViewChange?.("collapsed")} type="button">Collapse assistant</button>
      <button onClick={() => onVoiceActiveChange?.(true)} type="button">Activate mock voice</button>
      <input aria-label="Mock conversation draft" defaultValue="" />
    </div>
  ),
}));
vi.mock("@/components/demo/scenario-drawer", () => ({
  ScenarioDrawer: ({ open }: { open: boolean }) => <div className="utility-drawer scenario-drawer" data-scenario-open={open} />,
}));

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
  beforeEach(() => {
    pathname = "/overview";
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("keeps the assistant docked across route changes while closing modal drawers", async () => {
    const { rerender } = render(<PortalUtilities snapshot={snapshot()} />);
    const utilities = screen.getByRole("button", { name: "Ask EPF Sahayak" }).closest(".portal-utilities");

    fireEvent.click(screen.getByRole("button", { name: "Ask EPF Sahayak" }));
    expect(utilities).toHaveAttribute("data-assistant-view", "docked");

    fireEvent.click(screen.getByRole("button", { name: "Your EPF journey" }));
    expect(screen.getByRole("dialog", { name: "Your EPF journey" })).toHaveAttribute("aria-hidden", "false");

    pathname = "/passbook";
    rerender(<PortalUtilities snapshot={snapshot()} />);

    await waitFor(() => {
      expect(document.querySelector("#journey-utility-panel")).toHaveAttribute("aria-hidden", "true");
    });
    expect(utilities).toHaveAttribute("data-assistant-view", "docked");

    fireEvent.click(screen.getByRole("button", { name: "Demo scenarios" }));
    expect(document.querySelector("[data-scenario-open]")).toHaveAttribute("data-scenario-open", "true");

    pathname = "/claims";
    rerender(<PortalUtilities snapshot={snapshot()} />);

    await waitFor(() => {
      expect(document.querySelector("[data-scenario-open]")).toHaveAttribute("data-scenario-open", "false");
    });
  });

  test("keeps assistant-local state mounted across route changes", () => {
    const { rerender } = render(<PortalUtilities snapshot={snapshot()} />);
    const draft = screen.getByRole("textbox", { name: "Mock conversation draft" });
    fireEvent.change(draft, { target: { value: "Keep this question" } });

    pathname = "/profile";
    rerender(<PortalUtilities snapshot={snapshot()} />);

    expect(screen.getByRole("textbox", { name: "Mock conversation draft" })).toBe(draft);
    expect(draft).toHaveValue("Keep this question");
  });

  test("maximizes and collapses the assistant workspace", () => {
    render(<PortalUtilities snapshot={snapshot()} />);
    const utilities = screen.getByRole("button", { name: "Ask EPF Sahayak" }).closest(".portal-utilities");

    fireEvent.click(screen.getByRole("button", { name: "Ask EPF Sahayak" }));
    fireEvent.click(screen.getByRole("button", { name: "Maximize assistant" }));
    expect(utilities).toHaveAttribute("data-assistant-view", "fullscreen");

    fireEvent.click(screen.getByRole("button", { name: "Collapse assistant" }));
    expect(utilities).toHaveAttribute("data-assistant-view", "collapsed");
  });

  test("makes the portal background inert only while the assistant is full screen", () => {
    render(<><aside className="portal-sidebar" /><main className="portal-stage" /><nav className="mobile-navigation" /><PortalUtilities snapshot={snapshot()} /></>);

    fireEvent.click(screen.getByRole("button", { name: "Maximize assistant" }));
    expect(document.querySelector<HTMLElement>(".portal-sidebar")?.inert).toBe(true);
    expect(document.querySelector<HTMLElement>(".portal-stage")?.inert).toBe(true);
    expect(document.querySelector<HTMLElement>(".mobile-navigation")?.inert).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Collapse assistant" }));
    expect(document.querySelector<HTMLElement>(".portal-sidebar")?.inert).toBe(false);
    expect(document.querySelector<HTMLElement>(".portal-stage")?.inert).toBe(false);
    expect(document.querySelector<HTMLElement>(".mobile-navigation")?.inert).toBe(false);
  });

  test("makes responsive docked mode modal and keeps the portal background unreachable", async () => {
    vi.stubGlobal("matchMedia", vi.fn(() => ({
      matches: true,
      media: "(max-width: 860px)",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })));
    render(<><aside className="portal-sidebar" /><main className="portal-stage" /><nav className="mobile-navigation" /><PortalUtilities snapshot={snapshot()} /></>);

    fireEvent.click(screen.getByRole("button", { name: "Ask EPF Sahayak" }));
    const assistant = screen.getByRole("button", { name: "Ask EPF Sahayak" }).parentElement;
    await waitFor(() => expect(assistant).toHaveAttribute("data-modal", "true"));
    expect(document.querySelector<HTMLElement>(".portal-sidebar")?.inert).toBe(true);
    expect(document.querySelector<HTMLElement>(".portal-stage")?.inert).toBe(true);
    expect(document.querySelector<HTMLElement>(".mobile-navigation")?.inert).toBe(true);
  });

  test("retains the previous snapshot and marks context stale after a refresh failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    render(<PortalUtilities snapshot={snapshot()} />);
    fireEvent.click(screen.getByRole("button", { name: "Your EPF journey" }));

    expect(screen.getByRole("link", { name: "Complete new-member setup" })).toHaveAttribute("href", "/onboarding");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Ask EPF Sahayak" }).parentElement).toHaveAttribute("data-context-stale", "true");
    });
  });

  test("clears stale context when a route provides a new authoritative snapshot", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const { rerender } = render(<PortalUtilities snapshot={snapshot()} />);
    const assistant = screen.getByRole("button", { name: "Ask EPF Sahayak" }).parentElement;

    fireEvent.click(screen.getByRole("button", { name: "Your EPF journey" }));
    await waitFor(() => {
      expect(assistant).toHaveAttribute("data-context-stale", "true");
    });

    rerender(<PortalUtilities snapshot={snapshot({ nextAction: { label: "Review contributions", href: "/passbook" } })} />);

    await waitFor(() => {
      expect(assistant).toHaveAttribute("data-context-stale", "false");
    });
  });

  test("does not replace a post-navigation snapshot with a delayed old-route refresh", async () => {
    let resolveRefresh!: (response: { ok: boolean; json(): Promise<MemberSnapshot> }) => void;
    const oldSnapshot = snapshot({ nextAction: { label: "Old route action", href: "/overview" } });
    const currentSnapshot = snapshot({ nextAction: { label: "Current route action", href: "/passbook" } });
    let request = 0;
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => {
      request += 1;
      if (request === 1) return new Promise((resolve) => { resolveRefresh = resolve; });
      return Promise.resolve({ ok: true, json: async () => currentSnapshot });
    }));
    const { rerender } = render(<PortalUtilities snapshot={oldSnapshot} />);

    fireEvent.click(screen.getByRole("button", { name: "Your EPF journey" }));
    pathname = "/passbook";
    rerender(<PortalUtilities snapshot={currentSnapshot} />);

    await waitFor(() => {
      expect(document.querySelector("#journey-utility-panel a")).toHaveTextContent("Current route action");
    });

    await act(async () => {
      resolveRefresh({ ok: true, json: async () => oldSnapshot });
      await Promise.resolve();
    });

    expect(document.querySelector("#journey-utility-panel a")).toHaveTextContent("Current route action");
  });

  test("refreshes authoritative assistant context on every pathname change and ignores the stale route response", async () => {
    const pending: Array<(response: { ok: boolean; json(): Promise<MemberSnapshot> }) => void> = [];
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => new Promise((resolve) => pending.push(resolve))));
    const firstRoute = snapshot({ profile: { ...snapshot().profile, displayName: "First route" } });
    const secondRoute = snapshot({ profile: { ...snapshot().profile, displayName: "Second route" } });
    const { rerender } = render(<PortalUtilities snapshot={firstRoute} />);

    pathname = "/profile";
    rerender(<PortalUtilities snapshot={secondRoute} />);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    pathname = "/passbook";
    rerender(<PortalUtilities snapshot={secondRoute} />);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));

    await act(async () => {
      pending[1]?.({ ok: true, json: async () => secondRoute });
      await Promise.resolve();
      pending[0]?.({ ok: true, json: async () => firstRoute });
      await Promise.resolve();
    });

    expect(document.querySelector(".assistant-area")).toHaveAttribute("data-context-name", "Second route");
  });

  test("arbitrates inert utility layers so only the active modal remains interactive", async () => {
    render(<><aside className="portal-sidebar" /><main className="portal-stage" /><nav className="mobile-navigation" /><PortalUtilities snapshot={snapshot()} /></>);

    fireEvent.click(screen.getByRole("button", { name: "Ask EPF Sahayak" }));
    fireEvent.click(screen.getByRole("button", { name: "Your EPF journey" }));
    expect(document.querySelector<HTMLElement>(".assistant-area")?.inert).toBe(true);
    expect(document.querySelector<HTMLElement>(".utility-edge-rail")?.inert).toBe(true);
    expect(document.querySelector<HTMLElement>("#journey-utility-panel")?.inert).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Maximize assistant" }));
    await waitFor(() => {
      expect(document.querySelector<HTMLElement>(".assistant-area")?.inert).toBe(false);
    });
    expect(document.querySelector<HTMLElement>(".utility-edge-rail")?.inert).toBe(true);
    expect(document.querySelector<HTMLElement>("#journey-utility-panel")?.inert).toBe(true);
    expect(document.querySelector<HTMLElement>(".scenario-drawer")?.inert).toBe(true);
  });

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
    expect(fetch).toHaveBeenCalledWith("/api/member/snapshot", expect.objectContaining({
      cache: "no-store",
      signal: expect.any(AbortSignal),
    }));
  });

  test("closes the journey drawer when its next action is selected", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => snapshot(),
    }));

    render(<PortalUtilities snapshot={snapshot()} />);
    fireEvent.click(screen.getByRole("button", { name: "Your EPF journey" }));

    const drawer = screen.getByRole("dialog", { name: "Your EPF journey" });
    const nextAction = await screen.findByRole("link", { name: "Complete new-member setup" });
    nextAction.addEventListener("click", (event) => event.preventDefault());
    fireEvent.click(nextAction);

    expect(drawer).toHaveAttribute("aria-hidden", "true");
  });
});
