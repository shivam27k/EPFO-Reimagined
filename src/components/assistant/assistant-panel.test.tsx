import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, vi } from "vitest";

import type { MemberSnapshot } from "@/domain/member-snapshot";
import { AssistantPanel } from "./assistant-panel";

type VoiceCaption = {
  role: "member" | "assistant";
  text: string;
};

type VoiceControlProps = {
  active: boolean;
  contextVersion: string;
  route: string;
  onExit(): void;
  onReturnToText(captions: VoiceCaption[]): void;
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
      <section aria-label="EPF Sahayak voice mode" data-context-version={props.contextVersion} data-route={props.route}>
        <p>मेरा passbook</p>
        <p>आपका passbook तैयार है</p>
        <button
          onClick={() => props.onReturnToText([
            { role: "member", text: "मेरा passbook" },
            { role: "assistant", text: "आपका passbook तैयार है" },
          ])}
          type="button"
        >
          Open text chat
        </button>
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

function openVoiceMode() {
  fireEvent.click(screen.getByRole("button", { name: "Ask EPF Sahayak" }));
  fireEvent.click(screen.getByRole("button", { name: "Talk to EPF Sahayak" }));
}

describe("AssistantPanel voice integration", () => {
  beforeEach(() => {
    navigation.pathname = "/claims";
    voiceHarness.props = null;
  });

  test("passes route changes to the same mounted voice HUD", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => historyResponse()));
    const { rerender } = render(<AssistantPanel snapshot={snapshot()} />);
    await screen.findByText("Ask about this page, a status, or the safest next action.");

    openVoiceMode();
    const voiceHud = screen.getByRole("region", { name: "EPF Sahayak voice mode" });
    expect(voiceHud).toHaveAttribute("data-route", "/claims");
    expect(voiceHarness.props?.route).toBe("/claims");

    navigation.pathname = "/passbook";
    rerender(<AssistantPanel snapshot={snapshot()} />);

    expect(screen.getByRole("region", { name: "EPF Sahayak voice mode" })).toBe(voiceHud);
    expect(voiceHud).toHaveAttribute("data-route", "/passbook");
    expect(voiceHarness.props?.route).toBe("/passbook");
  });

  test("changes the voice grounding version when router refresh supplies new member state", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => historyResponse()));
    const firstSnapshot = snapshot();
    const { rerender } = render(<AssistantPanel snapshot={firstSnapshot} />);
    await screen.findByText("Ask about this page, a status, or the safest next action.");
    openVoiceMode();
    const voiceHud = screen.getByRole("region", { name: "EPF Sahayak voice mode" });
    const firstVersion = voiceHarness.props?.contextVersion;

    rerender(<AssistantPanel snapshot={{
      ...firstSnapshot,
      profile: { ...firstSnapshot.profile, onboardingComplete: true },
      nextAction: { label: "Review contributions", href: "/passbook" },
    }} />);

    expect(screen.getByRole("region", { name: "EPF Sahayak voice mode" })).toBe(voiceHud);
    expect(voiceHarness.props?.route).toBe("/claims");
    expect(voiceHarness.props?.contextVersion).not.toBe(firstVersion);
  });

  test("moves visible voice captions into text chat without submitting them", async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<ReturnType<typeof historyResponse>>>(async () => historyResponse());
    vi.stubGlobal("fetch", fetchMock);
    render(<AssistantPanel snapshot={snapshot()} />);
    await screen.findByText("Ask about this page, a status, or the safest next action.");

    openVoiceMode();
    fireEvent.click(screen.getByRole("button", { name: "Open text chat" }));

    expect(screen.queryByRole("region", { name: "EPF Sahayak voice mode" })).not.toBeInTheDocument();
    const dialog = screen.getByRole("dialog", { name: "EPF Sahayak conversation" });
    expect(dialog).toHaveAttribute("aria-hidden", "false");
    const messages = dialog.querySelectorAll(".assistant-message");
    expect(messages).toHaveLength(2);
    expect(messages[0]).toHaveAttribute("data-role", "member");
    expect(messages[0]?.querySelector(".assistant-message-content")).toHaveTextContent("मेरा passbook");
    expect(messages[1]).toHaveAttribute("data-role", "assistant");
    expect(messages[1]?.querySelector(".assistant-message-content")).toHaveTextContent("आपका passbook तैयार है");
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(0);
  });

  test("merges delayed server history with voice captions transferred while history loads", async () => {
    let resolveHistory: ((body: Record<string, unknown>) => void) | undefined;
    const historyBody = new Promise<Record<string, unknown>>((resolve) => {
      resolveHistory = resolve;
    });
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: () => historyBody })));
    render(<AssistantPanel snapshot={snapshot()} />);

    openVoiceMode();
    fireEvent.click(screen.getByRole("button", { name: "Open text chat" }));
    const dialog = screen.getByRole("dialog", { name: "EPF Sahayak conversation" });
    expect(dialog.querySelectorAll(".assistant-message")).toHaveLength(2);

    await act(async () => {
      resolveHistory?.({
        messages: [
          { role: "assistant", text: "Saved guidance", source: "fallback" },
          { role: "member", text: "मेरा passbook" },
        ],
        dismissedPromptKeys: [],
        formPatchProposal: [],
      });
      await historyBody;
    });

    const messages = dialog.querySelectorAll(".assistant-message-content");
    expect(messages).toHaveLength(3);
    expect(within(dialog).getAllByText("Saved guidance")).toHaveLength(1);
    expect(within(dialog).getAllByText((_, element) => element?.classList.contains("assistant-message-content") === true && element.textContent === "मेरा passbook")).toHaveLength(1);
    expect(messages[2]).toHaveTextContent("आपका passbook तैयार है");
  });

  test("renders text messages with safe English and Devanagari spans", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => historyResponse([
      { role: "member", text: "मेरा passbook" },
      { role: "assistant", text: "आपका **passbook** तैयार है", source: "openai" },
      { role: "assistant", text: "سلام", source: "openai" },
    ])));
    render(<AssistantPanel snapshot={snapshot()} />);

    fireEvent.click(screen.getByRole("button", { name: "Ask EPF Sahayak" }));
    const dialog = await screen.findByRole("dialog", { name: "EPF Sahayak conversation" });
    await within(dialog).findByText("मेरा", { exact: true });
    const messageContent = dialog.querySelectorAll(".assistant-message-content");
    expect(messageContent[0]?.querySelector(".assistant-text-hindi")).toHaveTextContent("मेरा");
    expect(messageContent[0]?.querySelector(".assistant-text-english")).toHaveTextContent("passbook");
    expect(messageContent[1]?.querySelector(".assistant-text-hindi")).toHaveTextContent("आपका");
    expect(within(messageContent[1] as HTMLElement).getByText("passbook").tagName).toBe("SPAN");
    expect(messageContent[2]).toHaveTextContent("Speech received in an unsupported script. Please speak in English or Hindi.");
    expect(dialog).not.toHaveTextContent("سلام");
  });
});
