import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, vi } from "vitest";

import type { MemberSnapshot } from "@/domain/member-snapshot";
import { AssistantPanel } from "./assistant-panel";

type VoiceControlProps = {
  active: boolean;
  onExit(): void;
  onReturnToText(): void;
  submitTranscript(transcript: string, signal?: AbortSignal): Promise<{ text: string } | null>;
};

const navigation = vi.hoisted(() => ({ pathname: "/claims" }));
const voiceHarness = vi.hoisted(() => ({ props: null as VoiceControlProps | null }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("./assistant-voice-control", () => ({
  AssistantVoiceControl: (props: VoiceControlProps): ReactNode => {
    voiceHarness.props = props;
    if (!props.active) return null;
    return (
      <section aria-label="EPF Sahayak voice mode">
        <button onClick={props.onReturnToText} type="button">Open text chat</button>
        <button onClick={props.onExit} type="button">End voice mode</button>
      </section>
    );
  },
}));

function snapshot(): MemberSnapshot {
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
  };
}

function assistantResponse(body: Record<string, unknown>) {
  return { ok: true, json: async () => body };
}

function historyResponse(messages: Array<Record<string, unknown>> = []) {
  return assistantResponse({ messages, dismissedPromptKeys: [], formPatchProposal: [] });
}

describe("AssistantPanel voice integration", () => {
  beforeEach(() => {
    navigation.pathname = "/claims";
    voiceHarness.props = null;
  });

  test("shares the screen-aware assistant submission path while keeping voice and text mutually exclusive", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        return assistantResponse({ text: "Your final claim is ready for review.", usedFallback: false, actions: [] });
      }
      return historyResponse();
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AssistantPanel snapshot={snapshot()} />);
    await screen.findByText("Ask about this page, a status, or the safest next action.");

    fireEvent.click(screen.getByRole("button", { name: "Ask EPF Sahayak" }));
    const dialog = screen.getByRole("dialog", { name: "EPF Sahayak conversation" });
    expect(dialog).toHaveAttribute("aria-hidden", "false");

    const composer = dialog.querySelector(".assistant-form");
    expect(composer).not.toBeNull();
    expect(within(composer as HTMLElement).getByRole("button", { name: "Talk to EPF Sahayak" })).toBeInTheDocument();
    expect(dialog.querySelector(".assistant-voice-entry")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Talk to EPF Sahayak" }));
    expect(dialog).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByRole("region", { name: "EPF Sahayak voice mode" })).toBeInTheDocument();

    const signal = new AbortController().signal;
    let result: { text: string } | null | undefined;
    await act(async () => {
      result = await voiceHarness.props?.submitTranscript("Can I make a final claim?", signal);
    });

    const assistantPosts = fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");
    expect(assistantPosts).toHaveLength(1);
    expect(JSON.parse(String(assistantPosts[0]?.[1]?.body))).toEqual({
      message: "Can I make a final claim?",
      route: "/claims",
    });
    expect(assistantPosts[0]?.[1]?.signal).toBe(signal);
    expect(result).toEqual({ text: "Your final claim is ready for review." });
    expect(within(dialog).getAllByText("Your final claim is ready for review.")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Open text chat" }));
    expect(screen.queryByRole("region", { name: "EPF Sahayak voice mode" })).not.toBeInTheDocument();
    expect(dialog).toHaveAttribute("aria-hidden", "false");
    expect(within(dialog).getByText("Your final claim is ready for review.")).toBeInTheDocument();
  });

  test("keeps voice mode open across navigation and uses the newly opened route", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        return assistantResponse({ text: "This is your contribution history.", usedFallback: false, actions: [] });
      }
      return historyResponse();
    });
    vi.stubGlobal("fetch", fetchMock);
    const { rerender } = render(<AssistantPanel snapshot={snapshot()} />);
    await screen.findByText("Ask about this page, a status, or the safest next action.");

    fireEvent.click(screen.getByRole("button", { name: "Ask EPF Sahayak" }));
    fireEvent.click(screen.getByRole("button", { name: "Talk to EPF Sahayak" }));
    expect(screen.getByRole("region", { name: "EPF Sahayak voice mode" })).toBeInTheDocument();

    navigation.pathname = "/passbook";
    rerender(<AssistantPanel snapshot={snapshot()} />);

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });
    expect(screen.getByRole("region", { name: "EPF Sahayak voice mode" })).toBeInTheDocument();

    await act(async () => {
      await voiceHarness.props?.submitTranscript("Explain this page", new AbortController().signal);
    });

    const assistantPost = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(JSON.parse(String(assistantPost?.[1]?.body))).toEqual({
      message: "Explain this page",
      route: "/passbook",
    });
  });

  test("does not append an answer when a voice submission is cancelled", async () => {
    let resolveAssistantBody: ((body: Record<string, unknown>) => void) | undefined;
    const assistantBody = new Promise<Record<string, unknown>>((resolve) => {
      resolveAssistantBody = resolve;
    });
    vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") return { ok: true, json: () => assistantBody };
      return historyResponse();
    }));

    render(<AssistantPanel snapshot={snapshot()} />);
    await screen.findByText("Ask about this page, a status, or the safest next action.");
    fireEvent.click(screen.getByRole("button", { name: "Ask EPF Sahayak" }));
    fireEvent.click(screen.getByRole("button", { name: "Talk to EPF Sahayak" }));

    const controller = new AbortController();
    let submission: Promise<{ text: string } | null> | undefined;
    act(() => {
      submission = voiceHarness.props?.submitTranscript("Is this screen ready?", controller.signal);
    });
    controller.abort();
    resolveAssistantBody?.({ text: "This stale answer must not appear.", usedFallback: false, actions: [] });

    await act(async () => {
      expect(await submission).toBeNull();
    });
    expect(screen.queryByText("This stale answer must not appear.")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
