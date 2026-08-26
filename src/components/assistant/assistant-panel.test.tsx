import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, vi } from "vitest";

import type { MemberSnapshot } from "@/domain/member-snapshot";
import type { PortalAction, PortalActionResult } from "@/domain/portal-actions";
import { AssistantPanel } from "./assistant-panel";

type VoiceCaption = {
  role: "member" | "assistant";
  text: string;
};

type VoiceControlProps = {
  active: boolean;
  contextVersion: string;
  route: string;
  onToolCall?(action: PortalAction): Promise<PortalActionResult>;
  onExit(): void;
  onReturnToText(captions: VoiceCaption[]): void;
};

const navigation = vi.hoisted(() => ({ pathname: "/claims" }));
const routerHarness = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
const voiceHarness = vi.hoisted(() => ({ props: null as VoiceControlProps | null }));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useRouter: () => routerHarness,
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
    routerHarness.push.mockReset();
    routerHarness.refresh.mockReset();
    voiceHarness.props = null;
  });

  test("keeps voice, the workspace, and the stationary composer together", () => {
    vi.stubGlobal("fetch", vi.fn(async () => historyResponse()));
    render(<AssistantPanel onViewChange={vi.fn()} snapshot={snapshot()} view="docked" />);

    fireEvent.click(screen.getByRole("button", { name: "Talk to EPF Sahayak" }));

    const workspace = screen.getByRole("complementary", { name: "EPF Sahayak workspace" });
    const voice = screen.getByRole("region", { name: "EPF Sahayak voice mode" });
    const composer = screen.getByRole("textbox", { name: "Ask EPF Sahayak" });

    expect(workspace).toContainElement(voice);
    expect(workspace).toContainElement(composer);
    expect(voice.parentElement).toHaveClass("assistant-workspace-scroll");
    expect(document.body.querySelectorAll('[aria-label="EPF Sahayak voice mode"]')).toHaveLength(1);
  });

  test("passes route changes to the same mounted voice HUD", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => historyResponse()));
    const { rerender } = render(<AssistantPanel snapshot={snapshot()} />);
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

  test("offers an exit to the navigated page after voice navigation in full screen", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => historyResponse()));
    const onViewChange = vi.fn();
    render(<AssistantPanel onViewChange={onViewChange} snapshot={snapshot()} view="fullscreen" />);

    fireEvent.click(screen.getByRole("button", { name: "Talk to EPF Sahayak" }));
    expect(screen.getByRole("button", { name: "Exit EPF Sahayak full screen" })).toBeEnabled();
    let result: PortalActionResult | undefined;
    await act(async () => {
      result = await voiceHarness.props?.onToolCall?.({
        name: "navigate_to",
        arguments: { destination: "profile" },
      });
    });

    expect(result).toMatchObject({ status: "completed", route: "/profile" });
    expect(routerHarness.push).toHaveBeenCalledWith("/profile");
    fireEvent.click(await screen.findByRole("button", { name: "Exit full screen to view page" }));
    expect(onViewChange).toHaveBeenCalledWith("docked");
  });

  test("keeps docked voice available after a completed navigation", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => historyResponse()));
    render(<AssistantPanel snapshot={snapshot()} />);

    openVoiceMode();
    await act(async () => {
      await voiceHarness.props?.onToolCall?.({
        name: "navigate_to",
        arguments: { destination: "profile" },
      });
    });

    expect(screen.getByRole("complementary", { name: "EPF Sahayak workspace" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "EPF Sahayak voice mode" })).toBeInTheDocument();
  });

  test("requires ending voice before the workspace can collapse", () => {
    vi.stubGlobal("fetch", vi.fn(async () => historyResponse()));
    render(<AssistantPanel snapshot={snapshot()} />);

    openVoiceMode();
    const collapse = screen.getByRole("button", { name: "Collapse EPF Sahayak" });
    expect(collapse).toBeDisabled();
    expect(collapse).toHaveAttribute("title", "End voice mode before collapsing EPF Sahayak.");

    fireEvent.click(screen.getByRole("button", { name: "End voice mode" }));
    expect(collapse).toBeEnabled();
    fireEvent.click(collapse);
    expect(screen.getByRole("button", { name: "Ask EPF Sahayak" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Ask EPF Sahayak" }));
    expect(screen.getByRole("complementary", { name: "EPF Sahayak workspace" })).toBeVisible();
  });

  test("shows the returned failure message for a failed voice tool", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/assistant") return historyResponse();
      return { ok: false, json: async () => ({ error: "The returned failure text." }) };
    }));
    render(<AssistantPanel onViewChange={vi.fn()} snapshot={snapshot()} view="docked" />);

    fireEvent.click(screen.getByRole("button", { name: "Talk to EPF Sahayak" }));
    await act(async () => {
      await voiceHarness.props?.onToolCall?.({
        name: "propose_demo_action",
        arguments: { action: "simulate_bank_payment" },
      });
    });
    await act(async () => {
      await voiceHarness.props?.onToolCall?.({ name: "confirm_pending_action", arguments: {} });
    });

    expect(screen.getByRole("alert")).toHaveTextContent("The returned failure text.");
  });

  test("changes the voice grounding version when router refresh supplies new member state", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => historyResponse()));
    const firstSnapshot = snapshot();
    const { rerender } = render(<AssistantPanel snapshot={firstSnapshot} />);
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
    openVoiceMode();
    fireEvent.click(screen.getByRole("button", { name: "Open text chat" }));

    expect(screen.queryByRole("region", { name: "EPF Sahayak voice mode" })).not.toBeInTheDocument();
    const conversation = screen.getByRole("region", { name: "EPF Sahayak conversation" });
    const messages = conversation.querySelectorAll(".assistant-message");
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
    const conversation = screen.getByRole("region", { name: "EPF Sahayak conversation" });
    expect(conversation.querySelectorAll(".assistant-message")).toHaveLength(2);

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

    const messages = conversation.querySelectorAll(".assistant-message-content");
    expect(messages).toHaveLength(3);
    expect(within(conversation).getAllByText("Saved guidance")).toHaveLength(1);
    expect(within(conversation).getAllByText((_, element) => element?.classList.contains("assistant-message-content") === true && element.textContent === "मेरा passbook")).toHaveLength(1);
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
    const conversation = await screen.findByRole("region", { name: "EPF Sahayak conversation" });
    await within(conversation).findByText("मेरा", { exact: true });
    const messageContent = conversation.querySelectorAll(".assistant-message-content");
    expect(messageContent[0]?.querySelector(".assistant-text-hindi")).toHaveTextContent("मेरा");
    expect(messageContent[0]?.querySelector(".assistant-text-english")).toHaveTextContent("passbook");
    expect(messageContent[1]?.querySelector(".assistant-text-hindi")).toHaveTextContent("आपका");
    expect(within(messageContent[1] as HTMLElement).getByText("passbook").tagName).toBe("SPAN");
    expect(messageContent[2]).toHaveTextContent("Speech received in an unsupported script. Please speak in English or Hindi.");
    expect(conversation).not.toHaveTextContent("سلام");
  });
});

describe("AssistantPanel workspace shell", () => {
  test("changes between docked, full-screen, and collapsed views without remounting the conversation", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => historyResponse()));
    const onViewChange = vi.fn();
    const { rerender } = render(
      <AssistantPanel onViewChange={onViewChange} snapshot={snapshot()} view="docked" />,
    );
    const workspace = screen.getByRole("complementary", { name: "EPF Sahayak workspace" });
    const conversation = screen.getByRole("region", { name: "EPF Sahayak conversation" });

    expect(workspace).toHaveAttribute("data-view", "docked");
    expect(workspace).not.toHaveAttribute("aria-modal");
    expect(workspace).toHaveTextContent("Current page");
    expect(workspace).toHaveTextContent("Claims");

    fireEvent.click(screen.getByRole("button", { name: "Open EPF Sahayak full screen" }));
    expect(onViewChange).toHaveBeenCalledWith("fullscreen");

    rerender(<AssistantPanel onViewChange={onViewChange} snapshot={snapshot()} view="fullscreen" />);

    expect(screen.getByRole("dialog", { name: "EPF Sahayak workspace" })).toHaveAttribute("aria-modal", "true");
    expect(screen.getByRole("region", { name: "EPF Sahayak conversation" })).toBe(conversation);

    fireEvent.click(screen.getByRole("button", { name: "Collapse EPF Sahayak" }));
    expect(onViewChange).toHaveBeenCalledWith("collapsed");
  });

  test("shows the last verified context notice when refresh fails", () => {
    vi.stubGlobal("fetch", vi.fn(async () => historyResponse()));
    render(<AssistantPanel contextStale onViewChange={vi.fn()} snapshot={snapshot()} view="docked" />);

    expect(screen.getByText("Context refresh failed; showing the last verified demo record.")).toBeInTheDocument();
  });

  test("keeps optional workspace content inside one scroll region above the stationary composer", () => {
    vi.stubGlobal("fetch", vi.fn(async () => historyResponse()));
    render(<AssistantPanel onViewChange={vi.fn()} snapshot={snapshot()} view="docked" />);

    const workspace = screen.getByRole("complementary", { name: "EPF Sahayak workspace" });
    const scrollRegion = screen.getByRole("region", { name: "EPF Sahayak workspace content" });
    const conversation = screen.getByRole("region", { name: "EPF Sahayak conversation" });
    const composer = workspace.querySelector(".assistant-form");

    expect(scrollRegion).toContainElement(conversation);
    expect(scrollRegion.nextElementSibling).toBe(composer);
  });
});

describe("AssistantPanel synthetic document workspace", () => {
  const bankProposal = {
    field: "bankName",
    label: "Name on bank statement",
    existingValue: "Rohan Mehta",
    proposedValue: "Rohan K Mehta",
    source: "bank-statement.pdf · local synthetic demo extraction",
    confidence: 0.94,
    validation: "VALID",
    section: "kyc",
  };

  beforeEach(() => {
    navigation.pathname = "/claims";
    routerHarness.push.mockReset();
    routerHarness.refresh.mockReset();
  });

  test("keeps the synthetic document review open with its inputs when the route changes", () => {
    vi.stubGlobal("fetch", vi.fn(async () => historyResponse()));
    const { rerender } = render(<AssistantPanel snapshot={snapshot()} />);

    fireEvent.click(screen.getByRole("button", { name: "Ask EPF Sahayak" }));
    expect(screen.getByRole("button", { name: "Attach synthetic document" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Talk to EPF Sahayak" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Attach synthetic document" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Document type" }), { target: { value: "PAN_CARD" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /This file is entirely synthetic/ }));

    navigation.pathname = "/profile";
    rerender(<AssistantPanel snapshot={snapshot()} />);

    expect(screen.getByRole("region", { name: "Synthetic document review" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Document type" })).toHaveValue("PAN_CARD");
    expect(screen.getByRole("checkbox", { name: /This file is entirely synthetic/ })).toBeChecked();
  });

  test("shows reviewed proposals without an apply action outside onboarding", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => assistantResponse({
      messages: [],
      dismissedPromptKeys: [],
      formPatchProposal: [bankProposal],
    })));
    const { rerender } = render(<AssistantPanel snapshot={snapshot()} />);

    fireEvent.click(screen.getByRole("button", { name: "Ask EPF Sahayak" }));
    fireEvent.click(screen.getByRole("button", { name: "Attach synthetic document" }));

    expect(await screen.findByText("Rohan K Mehta")).toBeInTheDocument();
    navigation.pathname = "/profile";
    rerender(<AssistantPanel snapshot={snapshot()} />);

    expect(screen.getByText("Rohan K Mehta")).toBeInTheDocument();
    expect(screen.getByText("I can review this synthetic document here. Open new-member setup before applying extracted values to a form.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirm proposed changes" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "One field" })).not.toBeInTheDocument();
  });

  test("retains review-and-apply controls on onboarding", async () => {
    navigation.pathname = "/onboarding";
    vi.stubGlobal("fetch", vi.fn(async () => assistantResponse({
      messages: [],
      dismissedPromptKeys: [],
      formPatchProposal: [bankProposal],
    })));
    render(<AssistantPanel snapshot={snapshot()} />);

    fireEvent.click(screen.getByRole("button", { name: "Ask EPF Sahayak" }));
    fireEvent.click(screen.getByRole("button", { name: "Attach synthetic document" }));

    expect(await screen.findByRole("region", { name: "Review proposed form changes" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm proposed changes" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "One field" })).toBeInTheDocument();
  });

  test("keeps a cancelled in-flight extraction from restoring or persisting late proposals", async () => {
    let resolveExtraction: ((response: ReturnType<typeof assistantResponse>) => void) | undefined;
    const extraction = new Promise<ReturnType<typeof assistantResponse>>((resolve) => {
      resolveExtraction = resolve;
    });
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === "/api/assistant/extract") return extraction;
      if (init?.method === "PUT") return assistantResponse({ ok: true });
      return historyResponse();
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<AssistantPanel snapshot={snapshot()} />);

    fireEvent.click(screen.getByRole("button", { name: "Ask EPF Sahayak" }));
    fireEvent.click(screen.getByRole("button", { name: "Attach synthetic document" }));
    fireEvent.change(screen.getByLabelText("Choose PDF, JPEG, or PNG (max 5 MB)"), {
      target: { files: [new File(["demo"], "bank-statement.pdf", { type: "application/pdf" })] },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /This file is entirely synthetic/ }));
    fireEvent.click(screen.getByRole("button", { name: "Create review proposals" }));
    expect(screen.getByRole("button", { name: "Reviewing…" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Cancel review" }));
    await waitFor(() => expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "PUT")).toHaveLength(1));

    await act(async () => {
      resolveExtraction?.(assistantResponse({ proposals: [bankProposal], disclosure: "Late proposal" }));
      await extraction;
    });

    await waitFor(() => expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "PUT")).toHaveLength(2));
    fireEvent.click(screen.getByRole("button", { name: "Attach synthetic document" }));
    expect(screen.queryByText("Rohan K Mehta")).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Document type" })).toHaveValue("BANK_STATEMENT");
    expect(screen.getByRole("checkbox", { name: /This file is entirely synthetic/ })).not.toBeChecked();
  });

  test("disables prior proposal application while a replacement extraction is pending", async () => {
    navigation.pathname = "/onboarding";
    let resolveExtraction: ((response: ReturnType<typeof assistantResponse>) => void) | undefined;
    const extraction = new Promise<ReturnType<typeof assistantResponse>>((resolve) => {
      resolveExtraction = resolve;
    });
    const replacementProposal = { ...bankProposal, field: "panName", label: "Name on PAN card", proposedValue: "Rohan Mehta", source: "pan-card.png · local synthetic demo extraction" };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/assistant/extract") return extraction;
      return assistantResponse({ messages: [], dismissedPromptKeys: [], formPatchProposal: [bankProposal] });
    }));
    render(<AssistantPanel snapshot={snapshot()} />);

    fireEvent.click(screen.getByRole("button", { name: "Ask EPF Sahayak" }));
    fireEvent.click(screen.getByRole("button", { name: "Attach synthetic document" }));
    expect(await screen.findByRole("button", { name: "Confirm proposed changes" })).toBeEnabled();
    fireEvent.change(screen.getByLabelText("Choose PDF, JPEG, or PNG (max 5 MB)"), {
      target: { files: [new File(["demo"], "pan-card.png", { type: "image/png" })] },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: /This file is entirely synthetic/ }));
    fireEvent.click(screen.getByRole("button", { name: "Create review proposals" }));

    expect(screen.queryByRole("button", { name: "Confirm proposed changes" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "One field" })).not.toBeInTheDocument();

    await act(async () => {
      resolveExtraction?.(assistantResponse({ proposals: [replacementProposal], disclosure: "Replacement ready" }));
      await extraction;
    });

    expect(screen.getByText("Name on PAN card")).toBeInTheDocument();
    expect(screen.queryByText("Rohan K Mehta")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm proposed changes" })).toBeEnabled();
  });
});
