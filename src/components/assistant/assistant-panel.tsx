"use client";

import "./voice-welcome.css";

import { AudioLines, ArrowDown, Compass, ChevronLeft, ChevronRight, FileSearch, Mic, PanelRightClose, Paperclip, Send, Sparkles, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  ASSISTANT_VALIDATION_EVENT,
  type AssistantValidationEventDetail,
} from "@/domain/assistant-events";
import type { MemberSnapshot } from "@/domain/member-snapshot";
import { destinationRoutes } from "@/domain/portal-actions";
import { toolResultSchema, type ToolResult } from "@/domain/assistant-tools";
import type { UiRequest } from "@/domain/assistant-ui";
import type { AssistantReply } from "@/server/assistant/respond";
import { processDefinitions } from "@/domain/process-definitions";
import { buildQuestionBatches, type FormFieldProposal, type FormPatchScope } from "@/server/assistant/form-copilot";
import type { AssistantActionProposal } from "@/server/assistant/tools";
import { AssistantMessage } from "./assistant-message";
import { AssistantVoiceControl, type AssistantVoiceCaption } from "./assistant-voice-control";
import { FormPatchReview } from "./form-patch-review";
import { ProactivePrompt, type ProactivePromptModel } from "./proactive-prompt";
import type { AssistantWorkspaceView } from "./assistant-workspace-state";
import { captureVisibleScreenText } from "./visible-screen-context";
import { executePortalAction, type BrowserActionState } from "./portal-action-coordinator";
import { assistantRequest, finishTextContinuation, recoverCall } from "./assistant-transport";
import { rememberCall, useAssistantActions } from "./use-assistant-actions";
import { AssistantActionProgress, PersistedActionReview } from "./persisted-action-review";

interface Message {
  role: "member" | "assistant";
  text: string;
  source?: "openai" | "fallback";
  actions?: AssistantActionProposal[];
}

function mergeMessageHistory(history: Message[], local: Message[]): Message[] {
  const unmatchedHistory = new Map<string, number>();
  const identity = (message: Message) => JSON.stringify([message.role, message.text, message.source ?? null]);

  for (const message of history) {
    const key = identity(message);
    unmatchedHistory.set(key, (unmatchedHistory.get(key) ?? 0) + 1);
  }

  const localOnly = local.filter((message) => {
    const key = identity(message);
    const remaining = unmatchedHistory.get(key) ?? 0;
    if (remaining === 0) return true;
    unmatchedHistory.set(key, remaining - 1);
    return false;
  });

  return [...history, ...localOnly];
}

const pageSuggestions: Record<string, string[]> = {
  "/onboarding": ["What information do I need?", "Why is identity matching important?"],
  "/profile": ["Explain my KYC status", "Who can correct a bank mismatch?"],
  "/employment": ["Why is my exit date missing?", "Who owns the next action?"],
  "/passbook": ["Explain this contribution history", "What does a missing month mean?"],
  "/claims": ["Am I ready to claim?", "Explain my claim status"],
};

const pageNames: Record<string, string> = {
  "/onboarding": "Member onboarding",
  "/profile": "Profile and KYC",
  "/employment": "Employment details",
  "/passbook": "Passbook",
  "/claims": "Claims",
};

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "summary",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function pageName(pathname: string): string {
  const matchedRoute = Object.keys(pageNames).find((route) => pathname === route || pathname.startsWith(`${route}/`));
  return matchedRoute ? pageNames[matchedRoute] : "Member portal";
}

function promptForPage(pathname: string, snapshot: MemberSnapshot): ProactivePromptModel | null {
  if (pathname === "/onboarding" && snapshot.persona === "NEW_MEMBER" && !snapshot.profile.onboardingComplete) {
    const count = processDefinitions.ONBOARDING.questions.length;
    return { key: "process-onboarding-start", eyebrow: "Optional guided setup", title: `${count} questions are needed for this onboarding demo`, explanation: "Complete the clear form yourself, or ask me to pace the same questions for you.", reason: "You opened the new-member onboarding process.", processKey: "ONBOARDING", questionCount: count };
  }
  if (pathname.startsWith("/claims")) {
    const count = processDefinitions.FINAL_CLAIM.questions.length;
    return { key: "process-final-claim-start", eyebrow: "Before you begin", title: `${count} member confirmations are in the final-claim review`, explanation: "Have the verified bank account and recorded exit date ready. I can explain each confirmation, but I cannot accept declarations or submit the claim for you.", reason: "You opened the final-settlement claim process.", processKey: "FINAL_CLAIM", questionCount: count };
  }
  const blocker = snapshot.findings.find((finding) => finding.severity === "BLOCKER");
  return blocker ? { key: `blocker-${blocker.code.toLowerCase()}`, eyebrow: "Account blocker found", title: blocker.title, explanation: `${blocker.explanation} The next action belongs to ${blocker.owner.toLowerCase()}.`, reason: "A deterministic account check found a blocker relevant to this journey." } : null;
}

async function readJson(response: Response) {
  try { return await response.json() as Record<string, unknown>; } catch { return {}; }
}

export function AssistantPanel({
  snapshot,
  welcomeKey,
  view,
  onViewChange,
  contextStale = false,
  onVoiceActiveChange,
  modal = false,
  suppressPrompt = false,
  utilityPanel = null,
  onOpenUtility,
  onRefreshContext,
}: {
  snapshot: MemberSnapshot;
  welcomeKey?: string;
  view?: AssistantWorkspaceView;
  onViewChange?: (view: AssistantWorkspaceView) => void;
  contextStale?: boolean;
  onVoiceActiveChange?: (active: boolean) => void;
  modal?: boolean;
  suppressPrompt?: boolean;
  utilityPanel?: "journey" | "demo" | null;
  onOpenUtility?: (panel: "journey" | "demo") => boolean;
  onRefreshContext?: () => Promise<boolean>;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const workspaceRef = useRef<HTMLElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const extractionGeneration = useRef(0);
  const documentHydrationGeneration = useRef(0);
  const textRequestController = useRef<AbortController | null>(null);
  const textRequestGeneration = useRef(0);
  const validationCounts = useRef<Record<string, number>>({});
  const [internalView, setInternalView] = useState<AssistantWorkspaceView>("collapsed");
  const [voiceActive, setVoiceActive] = useState(false);
  const [textMode, setTextMode] = useState(false);
  const [welcomeVisible, setWelcomeVisible] = useState(false);
  const welcomeInitialized = useRef<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [panelError, setPanelError] = useState("");
  const [guidance, setGuidance] = useState<{ processKey: "ONBOARDING" | "FINAL_CLAIM"; mode: "ONE_BY_ONE" | "REVIEW_ALL"; position: number } | null>(null);
  const [validationPrompt, setValidationPrompt] = useState<ProactivePromptModel | null>(null);
  const [documentKind, setDocumentKind] = useState("BANK_STATEMENT");
  const [syntheticAccepted, setSyntheticAccepted] = useState(false);
  const [documentOpen, setDocumentOpen] = useState(false);
  const [extractionPending, setExtractionPending] = useState(false);
  const [proposals, setProposals] = useState<FormFieldProposal[]>([]);
  const [patchScope, setPatchScope] = useState<FormPatchScope>("SECTION");
  const [patchPending, setPatchPending] = useState(false);
  const [extractionMessage, setExtractionMessage] = useState("");
  const [documentSourceId, setDocumentSourceId] = useState<string | null>(null);
  const [cancellationVersion, setCancellationVersion] = useState(0);
  const expectedNavigation = useRef<string | null>(null);
  const previousPathname = useRef(pathname);
  const documentPrepareEvent = useRef<{ key: string; requestKey: string; callId: string } | null>(null);
  const workspaceView = view ?? internalView;
  const workspaceOpen = workspaceView !== "collapsed";
  const previousWorkspaceOpen = useRef(workspaceOpen);
  const workspaceModal = modal && workspaceOpen;
  const browserState = useRef<BrowserActionState>({ pathname, modal, voiceActive, utilityPanel, documentOpen });
  useEffect(() => {
    browserState.current = { pathname, modal, voiceActive, utilityPanel, documentOpen };
  }, [pathname, modal, voiceActive, utilityPanel, documentOpen]);
  const cancelWork = useCallback(() => {
    textRequestController.current?.abort();
    textRequestController.current = null;
    textRequestGeneration.current += 1;
    expectedNavigation.current = null;
    setPending(false);
    setCancellationVersion((current) => current + 1);
  }, []);
  const refreshAfterCommit = useCallback(async () => {
    router.refresh();
    return onRefreshContext ? onRefreshContext() : false;
  }, [onRefreshContext, router]);
  const actions = useAssistantActions(pathname, refreshAfterCommit, cancelWork);
  const handleVoiceResult = useCallback((result: ToolResult, current = false) => {
    actions.acceptResult(result, current);
    // Recovered proposals are only status hints. Restore the current proposal
    // from the server instead of replacing it with a historical call payload.
    if (!current && result.data?.proposal) void actions.reload();
  }, [actions.acceptResult, actions.reload]);

  useEffect(() => {
    onVoiceActiveChange?.(voiceActive);
  }, [onVoiceActiveChange, voiceActive]);

  const changeView = useCallback((nextView: AssistantWorkspaceView) => {
    if (onViewChange) onViewChange(nextView);
    else setInternalView(nextView);
  }, [onViewChange]);

  useEffect(() => {
    if (!welcomeKey || welcomeInitialized.current === welcomeKey) return;
    welcomeInitialized.current = welcomeKey;
    let seen = false;
    try { seen = sessionStorage.getItem("epf-sahayak:voice-welcome") === welcomeKey; } catch { /* Storage may be unavailable. */ }
    if (!seen) { setWelcomeVisible(true); changeView("collapsed"); }
  }, [welcomeKey, changeView]);

  function dismissWelcome() {
    setWelcomeVisible(false);
    if (welcomeKey) {
      try { sessionStorage.setItem("epf-sahayak:voice-welcome", welcomeKey); } catch { /* Keep the in-memory dismissal. */ }
    }
  }

  function openText() {
    dismissWelcome();
    setTextMode(true);
    changeView("docked");
    requestAnimationFrame(() => document.getElementById("assistant-message")?.focus());
  }

  function openAssistant() {
    dismissWelcome();
    changeView("docked");
  }

  function closeAssistant() {
    cancelWork();
    changeView("collapsed");
  }

  useEffect(() => {
    if (!workspaceOpen && previousWorkspaceOpen.current) {
      document.querySelector<HTMLButtonElement>('[aria-label="Ask EPF Sahayak"]')?.focus();
    }
    previousWorkspaceOpen.current = workspaceOpen;
  }, [workspaceOpen]);

  function startVoice() {
    cancelWork();
    setVoiceActive(true);
  }

  function returnToText(captions: AssistantVoiceCaption[]) {
    cancelWork();
    if (captions.length > 0) setMessages((current) => [...current, ...captions]);
    setVoiceActive(false);
    setTextMode(true);
    void actions.reload();
  }

  useEffect(() => {
    if (!workspaceModal) return;

    const workspace = workspaceRef.current;
    if (workspace === null) return;
    const focusContainer: HTMLElement = workspace;
    const focusFrame = window.requestAnimationFrame(() => {
      const firstFocusable = Array.from(focusContainer.querySelectorAll<HTMLElement>(focusableSelector))
        .find((element) => element.getClientRects().length > 0);
      (firstFocusable ?? focusContainer).focus();
    });

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (voiceActive) return;
        changeView("collapsed");
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = Array.from(focusContainer.querySelectorAll<HTMLElement>(focusableSelector))
        .filter((element) => element.getClientRects().length > 0);
      if (focusable.length === 0) {
        event.preventDefault();
        focusContainer.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const focused = document.activeElement;
      if (event.shiftKey && (focused === first || !focusContainer.contains(focused))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (focused === last || !focusContainer.contains(focused))) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener("keydown", onKeyDown);
      window.requestAnimationFrame(() => {
        if (document.querySelector('[aria-label="EPF Sahayak workspace"][aria-modal="true"]')) return;
        document.querySelector<HTMLButtonElement>('[aria-label="Ask EPF Sahayak"]')?.focus();
      });
    };
  }, [changeView, voiceActive, workspaceModal]);

  useEffect(() => {
    let active = true;
    const hydrationGeneration = documentHydrationGeneration.current;
    fetch("/api/assistant").then(async (response) => ({ response, body: await readJson(response) })).then(({ response, body }) => {
      if (!active) return;
      if (!response.ok) throw new Error(String(body.error ?? "Assistant history could not be loaded."));
      const history = Array.isArray(body.messages) ? body.messages as Message[] : [];
      setMessages((current) => mergeMessageHistory(history, current));
      setDismissed(Array.isArray(body.dismissedPromptKeys) ? body.dismissedPromptKeys as string[] : []);
      if (hydrationGeneration === documentHydrationGeneration.current && body.formPatchNotice) setExtractionMessage(String(body.formPatchNotice));
    }).catch((error) => active && setPanelError(error instanceof Error ? error.message : "Assistant history could not be loaded.")).finally(() => active && setHistoryLoading(false));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    function onValidation(event: Event) {
      const detail = (event as CustomEvent<AssistantValidationEventDetail>).detail;
      if (!detail || detail.valid) return;
      const count = (validationCounts.current[detail.field] ?? 0) + 1;
      validationCounts.current[detail.field] = count;
      const key = `invalid-field-${detail.field}`;
      if (count >= 2 && !dismissed.includes(key)) setValidationPrompt({ key, eyebrow: "Form check", title: `Need help with ${detail.label}?`, explanation: detail.message ?? "The value does not yet match the field format.", reason: "The same field did not pass normal validation twice. I do not read raw keystrokes." });
    }
    window.addEventListener(ASSISTANT_VALIDATION_EVENT, onValidation);
    return () => window.removeEventListener(ASSISTANT_VALIDATION_EVENT, onValidation);
  }, [dismissed]);

  const pagePrompt = useMemo(() => promptForPage(pathname, snapshot), [pathname, snapshot]);
  const voiceContextVersion = useMemo(() => JSON.stringify(snapshot), [snapshot]);
  const proactive = validationPrompt ?? pagePrompt;
  const visiblePrompt = proactive && !dismissed.includes(proactive.key) ? proactive : null;
  const suggestions = pageSuggestions[pathname] ?? ["What should I do next?", "Explain this page in plain language"];

  useEffect(() => {
    if (previousPathname.current === pathname) return;
    previousPathname.current = pathname;
    if (expectedNavigation.current === pathname) expectedNavigation.current = null;
    else cancelWork();
    void actions.reload();
  }, [pathname, cancelWork, actions.reload]);
  useEffect(() => () => { textRequestController.current?.abort(); }, []);

  const handleUiRequest = useCallback(async (request: UiRequest, signal: AbortSignal) => {
    try {
      return await executePortalAction(request, {
        current: () => browserState.current, signal,
        navigate: (route) => { expectedNavigation.current = route; router.push(route); },
        openUtility: (panel) => onOpenUtility?.(panel) ?? false,
        openDocument: () => { changeView("docked"); setDocumentOpen(true); },
      });
    } finally { expectedNavigation.current = null; }
  }, [changeView, onOpenUtility, router]);

  async function persistState(body: Record<string, string>) {
    const response = await fetch("/api/assistant", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (!response.ok) throw new Error("Assistant state could not be saved.");
  }

  async function dismissPrompt(prompt: ProactivePromptModel) {
    setDismissed((current) => [...current, prompt.key]);
    if (validationPrompt?.key === prompt.key) setValidationPrompt(null);
    try { await persistState({ kind: "DISMISS_PROMPT", promptKey: prompt.key }); } catch { setPanelError("The suggestion was hidden, but the dismissal may not survive a refresh."); }
  }

  function chooseGuidance(prompt: ProactivePromptModel, mode: "ONE_BY_ONE" | "REVIEW_ALL") {
    if (!prompt.processKey) return;
    setGuidance({ processKey: prompt.processKey, mode, position: 0 });
    setTextMode(true);
    openAssistant();
  }

  async function sendMessage(message: string, signal?: AbortSignal): Promise<{ text: string } | null> {
    const trimmed = message.trim();
    if (!trimmed || signal?.aborted) return null;
    setTextMode(true);
    setInput(""); setPending(true); setPanelError("");
    if (!voiceActive) openAssistant();
    setMessages((current) => [...current, { role: "member", text: trimmed }]);
    const controller = new AbortController();
    const generation = ++textRequestGeneration.current;
    textRequestController.current?.abort();
    textRequestController.current = controller;
    expectedNavigation.current = null;
    const abortFromCaller = () => controller.abort();
    const clearPendingOnAbort = () => {
      if (generation === textRequestGeneration.current) setPending(false);
    };
    controller.signal.addEventListener("abort", clearPendingOnAbort, { once: true });
    signal?.addEventListener("abort", abortFromCaller, { once: true });
    if (signal?.aborted) controller.abort();
    try {
      const response = await fetch("/api/assistant", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: trimmed, route: pathname, visibleScreenText: captureVisibleScreenText() }), signal: controller.signal });
      const result = await readJson(response);
      if (controller.signal.aborted || generation !== textRequestGeneration.current) return null;
      if (!response.ok) throw new Error(String(result.error ?? "Assistant response could not be loaded."));
      const final = await finishTextContinuation(result as unknown as AssistantReply, handleUiRequest, controller.signal,
        (results) => results.forEach((item) => actions.acceptResult(item, true)));
      if (controller.signal.aborted || generation !== textRequestGeneration.current) return null;
      const text = final.text || "Review the action results before continuing.";
      setMessages((current) => [...current, { role: "assistant", text, source: final.usedFallback ? "fallback" : "openai", actions: final.actions }]);
      // Narrow offline navigation still uses the same observer, without provider
      // continuation. It cannot mutate records or claim unobserved completion.
      for (const action of final.portalActions ?? []) {
        if (action.name !== "navigate_to" || controller.signal.aborted) continue;
        const callId = crypto.randomUUID();
        const observed = await handleUiRequest({ callId, action, contextVersion: "offline",
          expiresAt: new Date(Date.now() + 8000).toISOString() }, controller.signal);
        actions.acceptResult({ callId, contextVersion: "offline", status: observed.status,
          message: observed.status === "completed" ? "Requested page observed in the browser." : "The requested page was not observed." });
      }
      await actions.reload();
      return { text };
    } catch (error) {
      if (!controller.signal.aborted && generation === textRequestGeneration.current) setPanelError(error instanceof Error ? error.message : "Assistant unavailable. Use the visible page actions to continue.");
      return null;
    } finally {
      signal?.removeEventListener("abort", abortFromCaller);
      controller.signal.removeEventListener("abort", clearPendingOnAbort);
      if (generation === textRequestGeneration.current) {
        setPending(false);
        if (textRequestController.current === controller) textRequestController.current = null;
      }
    }
  }

  async function decideAction(action: AssistantActionProposal, decision: "CONFIRMED" | "REJECTED") {
    const proposalState = { kind: "PROPOSAL_DECISION", proposalKey: `${action.type}-${action.label}`.slice(0, 120), decision };
    if (decision === "REJECTED") {
      try { await persistState(proposalState); } catch { setPanelError("The proposal decision could not be recorded. No account data changed."); return; }
    } else if (action.type === "NAVIGATE" && Object.values(destinationRoutes).includes(action.payload.href ?? "")) {
      try { await persistState(proposalState); } catch { setPanelError("The proposal decision could not be recorded. No account data changed."); return; }
      router.push(action.payload.href!);
    } else {
      setPanelError("This legacy card has no persisted confirmation boundary. Ask for a fresh exact proposal; no account data changed.");
      return;
    }
    setMessages((current) => current.map((message) => ({ ...message, actions: message.actions?.filter((candidate) => candidate !== action) })));
  }

  async function extractDocument(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) { setExtractionMessage("Choose a synthetic PDF, JPEG, or PNG first."); return; }
    if (!syntheticAccepted) { setExtractionMessage("Confirm that this file contains synthetic demo data only."); return; }
    documentHydrationGeneration.current += 1;
    const generation = ++extractionGeneration.current;
    setExtractionPending(true); setExtractionMessage(""); setProposals([]); setDocumentSourceId(null);
    documentPrepareEvent.current = null;
    const data = new FormData(); data.set("document", file); data.set("documentKind", documentKind); data.set("syntheticDisclosureAccepted", "true");
    try {
      const response = await fetch("/api/assistant/extract", { method: "POST", body: data });
      const result = await readJson(response);
      if (generation !== extractionGeneration.current) return;
      if (!response.ok) throw new Error(String(result.error ?? "The synthetic document could not be reviewed."));
      if (typeof result.documentProposalId !== "string") throw new Error("No stored document source was returned. Select the document again.");
      setDocumentSourceId(result.documentProposalId);
      setProposals(Array.isArray(result.proposals) ? result.proposals as FormFieldProposal[] : []); setPatchScope("SECTION"); setExtractionMessage(String(result.disclosure ?? "Proposals are ready for review."));
    } catch (error) {
      if (generation === extractionGeneration.current) setExtractionMessage(error instanceof Error ? error.message : "The synthetic document could not be reviewed.");
    } finally {
      if (generation === extractionGeneration.current) setExtractionPending(false);
    }
  }

  const scopedProposals = patchScope === "FIELD" ? proposals.slice(0, 1)
    : patchScope === "SECTION" ? proposals.filter((proposal) => proposal.section === proposals[0]?.section) : proposals;
  function clearDocumentReview(message = "") {
    documentHydrationGeneration.current += 1;
    setDocumentKind("BANK_STATEMENT");
    setSyntheticAccepted(false);
    setProposals([]);
    setDocumentSourceId(null);
    documentPrepareEvent.current = null;
    setPatchScope("SECTION");
    setExtractionMessage(message);
    setExtractionPending(false);
    setDocumentOpen(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  function cancelDocumentReview() {
    extractionGeneration.current += 1;
    clearDocumentReview();
  }

  async function applyPatch() {
    if (pathname !== "/onboarding" || snapshot.persona !== "NEW_MEMBER" || extractionPending || !documentSourceId) return;
    cancelWork();
    setPatchPending(true); setExtractionMessage("");
    try {
      const fields = scopedProposals.map((proposal) => proposal.field);
      const key = JSON.stringify([documentSourceId, fields]);
      let event = documentPrepareEvent.current;
      if (!event || event.key !== key) {
        event = { key, requestKey: crypto.randomUUID(), callId: crypto.randomUUID() };
        documentPrepareEvent.current = event;
      }
      rememberCall(event.callId);
      const result = toolResultSchema.parse(await assistantRequest("/api/assistant/onboarding", {
        requestKey: event.requestKey, callId: event.callId, route: pathname, documentProposalId: documentSourceId, fields,
      }));
      actions.acceptResult(result, true);
      setExtractionMessage(result.message);
      if (result.status === "confirmation_required") setProposals([]);
      await actions.reload();
    } catch (error) {
      setExtractionMessage(error instanceof Error ? error.message : "The proposed values could not be prepared.");
      if (documentPrepareEvent.current) actions.acceptResult(await recoverCall(documentPrepareEvent.current.callId));
      await actions.reload();
    } finally { setPatchPending(false); }
  }

  const definition = guidance ? processDefinitions[guidance.processKey] : null;
  const batches = definition ? buildQuestionBatches([...definition.questions]) : [];
  const currentBatch = guidance ? batches[guidance.position] : null;
  const maxPosition = guidance && definition ? (guidance.mode === "ONE_BY_ONE" ? definition.questions.length - 1 : batches.length - 1) : 0;

  return (
    <section className="assistant-area" aria-label="EPF Sahayak assistant" data-context-stale={contextStale}>
      {workspaceView === "collapsed" && !voiceActive ? <>
        {welcomeVisible && !suppressPrompt ? <aside className="assistant-welcome" aria-label="Meet your voice guide">
          <button className="assistant-welcome-dismiss" aria-label="Dismiss voice welcome" onClick={dismissWelcome} type="button"><X size={18} aria-hidden="true" /></button>
          <p className="utility-label">Meet your voice guide</p><h3>Just ask. I’ll guide you.</h3>
          <p>Speak in natural language. I can explain your next step, open sections and scroll for you.</p>
          <button className="assistant-voice-primary" onClick={() => { setTextMode(false); openAssistant(); }} type="button"><AudioLines size={20} aria-hidden="true" />Explore with voice <span aria-hidden="true">→</span></button>
          <button className="assistant-type-link" onClick={openText} type="button">I’d rather type</button>
        </aside> : null}
        <button aria-label="Ask EPF Sahayak" className="assistant-launcher assistant-launcher-voice" onClick={openAssistant} type="button"><AudioLines aria-hidden="true" size={22} /><span><strong>Talk to Sahayak</strong><small>Your personal EPF guide</small></span></button>
      </> : null}
      <section
        aria-label="EPF Sahayak workspace"
        aria-hidden={!workspaceOpen}
        aria-modal={workspaceModal ? true : undefined}
        className="assistant-workspace"
        data-view="docked"
        data-open={workspaceOpen}
        inert={!workspaceOpen}
        ref={workspaceRef}
        role={workspaceModal ? "dialog" : "complementary"}
        tabIndex={-1}
      >
        <header className="assistant-workspace-header"><div><span className="utility-label">Masked demo context</span><h2>EPF Sahayak</h2></div><div className="assistant-workspace-controls"><button aria-label="Collapse EPF Sahayak" className="icon-action" disabled={voiceActive} onClick={closeAssistant} title={voiceActive ? "End voice mode before collapsing EPF Sahayak." : undefined} type="button"><PanelRightClose aria-hidden="true" size={19} /></button></div></header>
        <div className="assistant-context-strip"><span className="utility-label">Current page</span><strong>{pageName(pathname)}</strong><span className={contextStale ? "assistant-context-status is-stale" : "assistant-context-status"}>{contextStale ? "Context refresh failed; showing the last verified demo record." : "Masked context verified for this demo."}</span></div>
        <p className="assistant-boundary">Guidance only. Never enter real Aadhaar, UAN, PAN, bank, OTP, biometric, or government data.</p>
        <div aria-label="EPF Sahayak workspace content" className="assistant-workspace-scroll" role="region">
        {!voiceActive && !textMode ? <section className="assistant-voice-welcome" aria-label="Start with voice">
          <span className="assistant-voice-recommend">Recommended · Voice guide</span>
          <div className="assistant-welcome-orb"><Mic size={30} aria-hidden="true" /></div>
          <h3>Aap boliye.<br />I’ll help you from here.</h3>
          <p>Ask a question or tell me where to go.<br />No need to find every button.</p>
          <button className="assistant-voice-primary" disabled={pending} onClick={startVoice} type="button"><Mic size={20} aria-hidden="true" />Start voice conversation</button>
          <small>Your microphone starts only when you choose.</small>
          <div className="assistant-voice-examples"><p className="utility-label">You can say</p><p><Compass size={17} aria-hidden="true" />“Mujhe next kya karna hai?”</p><p><PanelRightClose size={17} aria-hidden="true" />“Open my passbook.”</p><p><ArrowDown size={17} aria-hidden="true" />“Scroll to my contributions.”</p></div>
          <button className="assistant-type-link" onClick={openText} type="button">Prefer typing? Open text chat</button>
        </section> : null}
        {!voiceActive && textMode ? <button className="assistant-voice-shortcut" onClick={startVoice} disabled={pending} type="button"><AudioLines size={18} aria-hidden="true" />Want hands-free help? Start voice</button> : null}
        {!voiceActive && textMode && guidance && definition ? <section className="question-guidance">
          <div className="question-guidance-heading"><div><span className="utility-label">{definition.title}</span><h3>{definition.questions.length} questions in total</h3></div><button className="text-action" onClick={() => setGuidance(null)} type="button">End guide</button></div>
          {guidance.mode === "ONE_BY_ONE" ? <article><strong>{definition.questions[guidance.position]?.label}</strong><p>{definition.questions[guidance.position]?.explanation}</p><small>Question {guidance.position + 1} of {definition.questions.length}</small></article> : currentBatch ? <div className="question-batch"><p className="utility-label">Batch {currentBatch.index} of {batches.length} · {currentBatch.remainingAfter} remaining after this batch</p><ol>{currentBatch.questions.map((question) => <li key={question.key}><strong>{question.label}</strong><span>{question.explanation}</span></li>)}</ol></div> : null}
          <div className="guidance-controls"><button className="secondary-action" disabled={guidance.position === 0} onClick={() => setGuidance({ ...guidance, position: guidance.position - 1 })} type="button"><ChevronLeft aria-hidden="true" size={17} /> Previous question</button><button className="primary-action" disabled={guidance.position >= maxPosition} onClick={() => setGuidance({ ...guidance, position: guidance.position + 1 })} type="button">Next question <ChevronRight aria-hidden="true" size={17} /></button></div>
        </section> : null}
        {!voiceActive && textMode ? <div className="assistant-suggestions" aria-label="Suggested questions">{suggestions.map((suggestion) => <button disabled={pending} key={suggestion} onClick={() => sendMessage(suggestion)} type="button">{suggestion}</button>)}</div> : null}
        {voiceActive ? <AssistantVoiceControl active contextVersion={voiceContextVersion} documentOpen={documentOpen} onExit={() => { cancelWork(); setVoiceActive(false); setTextMode(false); }} onReturnToText={returnToText} onToggleDocument={() => setDocumentOpen((current) => !current)} onUiRequest={handleUiRequest} onToolResult={handleVoiceResult} cancellationVersion={cancellationVersion} route={pathname} /> : null}
        {!voiceActive && textMode ? <div className="assistant-thread" aria-busy={pending || historyLoading} aria-label="EPF Sahayak conversation" aria-live="polite" role="region">
          {visiblePrompt && !suppressPrompt ? <ProactivePrompt prompt={visiblePrompt} onDismiss={() => dismissPrompt(visiblePrompt)} onChooseGuidance={(mode) => chooseGuidance(visiblePrompt, mode)} /> : null}
          {historyLoading ? <div className="assistant-empty"><Sparkles aria-hidden="true" size={18} /> Loading this run’s conversation…</div> : null}
          {!historyLoading && messages.length === 0 ? <div className="assistant-empty">Ask about this page, a status, or the safest next action.</div> : null}
          {messages.map((message, index) => <div key={`${message.role}-${index}-${message.text}`}><AssistantMessage role={message.role} source={message.source} text={message.text} />{message.actions?.map((action) => <div className="assistant-action-card" key={`${action.type}-${action.label}`}><strong>{action.label}</strong>{action.type === "NAVIGATE" ? <div><button className="primary-action" onClick={() => decideAction(action, "CONFIRMED")} type="button">Open page</button><button className="secondary-action" onClick={() => decideAction(action, "REJECTED")} type="button">Dismiss</button></div> : <p>Legacy proposal unavailable. Ask for a fresh persisted review.</p>}</div>)}</div>)}
          
          {pending ? <div className="assistant-empty"><Sparkles aria-hidden="true" size={18} /> Checking the masked demo record…</div> : null}
        </div> : null}
        <AssistantActionProgress results={actions.progress} refreshStatus={actions.refreshStatus} />
        {workspaceOpen && actions.proposal ? <PersistedActionReview key={actions.proposal.proposalId + ":" + actions.proposal.payloadHash} proposal={actions.proposal} busy={actions.busy} acknowledged={actions.acknowledged} onDisplayed={actions.markDisplayed} onDecision={actions.decide} /> : null}
        {actions.error ? <p className="assistant-error" role="alert">{actions.error}</p> : null}
        {panelError ? <p className="assistant-error" role="alert">{panelError}</p> : null}
        {documentOpen ? <section aria-label="Synthetic document review" className="document-assist" id="assistant-document-review"><header className="document-assist-header"><FileSearch aria-hidden="true" size={18} /><span><strong>Review a synthetic document</strong><small>Produces proposals only</small></span><button className="text-action" onClick={cancelDocumentReview} type="button">Cancel review</button></header><form onSubmit={extractDocument}>
          <label>Document type<select value={documentKind} onChange={(event) => { documentHydrationGeneration.current += 1; setDocumentKind(event.target.value); }}><option value="IDENTITY_RETURN">Simulated identity return</option><option value="JOINING_LETTER">Synthetic joining letter</option><option value="PAN_CARD">Synthetic PAN card</option><option value="BANK_STATEMENT">Synthetic bank statement</option></select></label>
          <label>Choose PDF, JPEG, or PNG (max 5 MB)<input ref={fileRef} accept="application/pdf,image/jpeg,image/png" onChange={() => { documentHydrationGeneration.current += 1; }} type="file" /></label>
          <label className="synthetic-confirm"><input checked={syntheticAccepted} onChange={(event) => { documentHydrationGeneration.current += 1; setSyntheticAccepted(event.target.checked); }} type="checkbox" /><span>This file is entirely synthetic and contains no real identity, bank, or government data.</span></label>
          <button className="secondary-action" disabled={extractionPending || !syntheticAccepted} type="submit">{extractionPending ? "Reviewing…" : "Create review proposals"}</button>
        </form>{extractionMessage ? <p className="extraction-feedback" role="status">{extractionMessage}</p> : null}{proposals.length > 0 ? pathname === "/onboarding" && snapshot.persona === "NEW_MEMBER" ? <><div className="patch-scope" aria-label="Apply scope"><button aria-pressed={patchScope === "FIELD"} disabled={extractionPending} onClick={() => setPatchScope("FIELD")} type="button">One field</button><button aria-pressed={patchScope === "SECTION"} disabled={extractionPending} onClick={() => setPatchScope("SECTION")} type="button">This section</button><button aria-pressed={patchScope === "WHOLE_FORM"} disabled={extractionPending} onClick={() => setPatchScope("WHOLE_FORM")} type="button">All extracted</button></div><FormPatchReview proposals={scopedProposals} scope={patchScope} prepareOnly pending={patchPending || extractionPending} onConfirm={applyPatch} onCancel={cancelDocumentReview} /></> : <section aria-label="Review extracted document" className="document-review-only"><div className="patch-list">{proposals.map((proposal) => <article className="patch-row" key={proposal.field}><div className="patch-heading"><strong>{proposal.label}</strong><span data-validation={proposal.validation}>{proposal.validation === "VALID" ? "Reviewed" : "Check value"}</span></div><dl><div><dt>Existing</dt><dd>{proposal.existingValue || "Not saved"}</dd></div><div><dt>Proposed</dt><dd>{proposal.sensitive ? "•••• " : ""}{proposal.proposedValue}</dd></div><div><dt>Source</dt><dd>{proposal.source}</dd></div><div><dt>Confidence</dt><dd>{Math.round(proposal.confidence * 100)}%</dd></div></dl></article>)}</div><p className="document-review-guidance">I can review this synthetic document here. Open new-member setup before applying extracted values to a form.</p></section> : null}</section> : null}
        </div>
        {!voiceActive && textMode ? <form className="assistant-form" onSubmit={(event) => { event.preventDefault(); sendMessage(input); }}>
          <label htmlFor="assistant-message">Ask EPF Sahayak</label>
          <textarea id="assistant-message" onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); sendMessage(input); } }} placeholder="Why is this blocked?" rows={2} value={input} />
          <div className="assistant-form-actions">
            <div className="assistant-form-actions-left">
              <button aria-controls="assistant-document-review" aria-expanded={documentOpen} aria-label="Attach synthetic document" className="assistant-attachment-button" onClick={() => setDocumentOpen((current) => !current)} title="Attach synthetic document" type="button"><Paperclip aria-hidden="true" size={18} /></button>
              <button aria-label="Talk to EPF Sahayak" className="assistant-voice-button" disabled={pending} onClick={startVoice} title="Voice" type="button"><Mic aria-hidden="true" size={18} /></button>
            </div>
            <button className="primary-action" disabled={pending || !input.trim()} type="submit"><Send aria-hidden="true" size={16} /> Send</button>
          </div>
        </form> : null}
      </section>
    </section>
  );
}
