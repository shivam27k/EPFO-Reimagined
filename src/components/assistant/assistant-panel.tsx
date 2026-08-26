"use client";

import { Bot, ChevronLeft, ChevronRight, FileSearch, Maximize2, Mic, Minimize2, PanelRightClose, Paperclip, Send, Sparkles } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  ASSISTANT_PATCH_APPLIED_EVENT,
  ASSISTANT_VALIDATION_EVENT,
  type AssistantPatchAppliedEventDetail,
  type AssistantValidationEventDetail,
} from "@/domain/assistant-events";
import type { MemberSnapshot } from "@/domain/member-snapshot";
import { describePortalAction, type PortalAction, type PortalActionResult } from "@/domain/portal-actions";
import { processDefinitions } from "@/domain/process-definitions";
import { buildQuestionBatches, type FormFieldProposal, type FormPatchScope } from "@/server/assistant/form-copilot";
import type { AssistantActionProposal } from "@/server/assistant/tools";
import { AssistantMessage } from "./assistant-message";
import { AssistantVoiceControl, type AssistantVoiceCaption } from "./assistant-voice-control";
import { FormPatchReview } from "./form-patch-review";
import { ProactivePrompt, type ProactivePromptModel } from "./proactive-prompt";
import type { AssistantWorkspaceView } from "./assistant-workspace-state";
import { captureVisibleScreenText } from "./visible-screen-context";
import { consumeQueuedPortalTarget, executePortalAction, type PendingPortalAction } from "./portal-action-coordinator";

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
  view,
  onViewChange,
  contextStale = false,
  onVoiceActiveChange,
  suppressPrompt = false,
}: {
  snapshot: MemberSnapshot;
  view?: AssistantWorkspaceView;
  onViewChange?: (view: AssistantWorkspaceView) => void;
  contextStale?: boolean;
  onVoiceActiveChange?: (active: boolean) => void;
  suppressPrompt?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const workspaceRef = useRef<HTMLElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const validationCounts = useRef<Record<string, number>>({});
  const [internalView, setInternalView] = useState<AssistantWorkspaceView>("collapsed");
  const [voiceActive, setVoiceActive] = useState(false);
  const [navigationCompletedInFullscreen, setNavigationCompletedInFullscreen] = useState(false);
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
  const [pendingPortalAction, setPendingPortalAction] = useState<PendingPortalAction | null>(null);
  const workspaceView = view ?? internalView;
  const workspaceOpen = workspaceView !== "collapsed";

  useEffect(() => {
    onVoiceActiveChange?.(voiceActive);
  }, [onVoiceActiveChange, voiceActive]);

  const changeView = useCallback((nextView: AssistantWorkspaceView) => {
    if (nextView !== "fullscreen") setNavigationCompletedInFullscreen(false);
    if (onViewChange) onViewChange(nextView);
    else setInternalView(nextView);
  }, [onViewChange]);

  function openAssistant() {
    changeView("docked");
  }

  function closeAssistant() {
    changeView("collapsed");
  }

  function startVoice() {
    setVoiceActive(true);
  }

  function returnToText(captions: AssistantVoiceCaption[]) {
    if (captions.length > 0) setMessages((current) => [...current, ...captions]);
    setVoiceActive(false);
  }

  useEffect(() => {
    if (workspaceView !== "fullscreen") return;

    const workspace = workspaceRef.current;
    if (workspace === null) return;
    const focusContainer: HTMLElement = workspace;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        changeView("docked");
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
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [changeView, workspaceView]);

  useEffect(() => {
    let active = true;
    fetch("/api/assistant").then(async (response) => ({ response, body: await readJson(response) })).then(({ response, body }) => {
      if (!active) return;
      if (!response.ok) throw new Error(String(body.error ?? "Assistant history could not be loaded."));
      const history = Array.isArray(body.messages) ? body.messages as Message[] : [];
      setMessages((current) => mergeMessageHistory(history, current));
      setDismissed(Array.isArray(body.dismissedPromptKeys) ? body.dismissedPromptKeys as string[] : []);
      setProposals(Array.isArray(body.formPatchProposal) ? body.formPatchProposal as FormFieldProposal[] : []);
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
    const timer = window.setTimeout(() => consumeQueuedPortalTarget(), 80);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  async function handlePortalAction(action: PortalAction): Promise<PortalActionResult> {
    const result = await executePortalAction(action, {
      pathname,
      navigate: (route) => router.push(route),
      refresh: () => router.refresh(),
      pendingAction: pendingPortalAction,
      setPendingAction: setPendingPortalAction,
      employmentId: snapshot.employments[0]?.employmentKey,
    });
    if (result.status === "failed") setPanelError(result.message);
    if (result.status === "completed" && (action.name === "navigate_to" || action.name === "start_workflow")) {
      if (workspaceView === "fullscreen") setNavigationCompletedInFullscreen(true);
      else if (!voiceActive) closeAssistant();
    }
    return result;
  }

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
    openAssistant();
  }

  async function sendMessage(message: string, signal?: AbortSignal): Promise<{ text: string } | null> {
    const trimmed = message.trim();
    if (!trimmed || pending || signal?.aborted) return null;
    setInput(""); setPending(true); setPanelError("");
    if (!voiceActive) openAssistant();
    setMessages((current) => [...current, { role: "member", text: trimmed }]);
    try {
      const response = await fetch("/api/assistant", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: trimmed, route: pathname, visibleScreenText: captureVisibleScreenText() }), signal });
      const result = await readJson(response);
      if (signal?.aborted) return null;
      if (!response.ok) throw new Error(String(result.error ?? "Assistant response could not be loaded."));
      const text = String(result.text ?? "I could not explain that yet.");
      setMessages((current) => [...current, { role: "assistant", text, source: result.usedFallback ? "fallback" : "openai", actions: Array.isArray(result.actions) ? result.actions as AssistantActionProposal[] : [] }]);
      const portalActions = Array.isArray(result.portalActions) ? result.portalActions as PortalAction[] : [];
      for (const action of portalActions) await handlePortalAction(action);
      return { text };
    } catch (error) {
      if (!signal?.aborted) setPanelError(error instanceof Error ? error.message : "Assistant unavailable. Use the visible page actions to continue.");
      return null;
    } finally { setPending(false); }
  }

  async function resolvePendingPortalAction(confirm: boolean) {
    const result = await handlePortalAction({ name: confirm ? "confirm_pending_action" : "cancel_pending_action", arguments: {} });
    setMessages((current) => [...current, { role: "assistant", text: result.message, source: "fallback" }]);
  }

  async function decideAction(action: AssistantActionProposal, decision: "CONFIRMED" | "REJECTED") {
    const proposalState = { kind: "PROPOSAL_DECISION", proposalKey: `${action.type}-${action.label}`.slice(0, 120), decision };
    if (decision === "REJECTED") {
      try { await persistState(proposalState); } catch { setPanelError("The proposal decision could not be recorded. No account data changed."); return; }
    } else if (action.type === "NAVIGATE" && action.payload.href?.startsWith("/")) {
      try { await persistState(proposalState); } catch { setPanelError("The proposal decision could not be recorded. No account data changed."); return; }
      router.push(action.payload.href); closeAssistant();
    } else if (action.type === "APPLY_DEMO_CORRECTION") {
      const isEmployment = action.payload.correction === "EMPLOYMENT_EXIT_DATE" && action.payload.employmentId?.startsWith("employment:");
      const isBank = action.payload.correction === "BANK_NAME";
      if (!isEmployment && !isBank) { setPanelError("This proposal is not an allowed demo correction. No account data changed."); return; }
      setPending(true); setPanelError("");
      try {
        const response = await fetch(isEmployment ? "/api/scenarios/employment" : "/api/scenarios/bank", {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify(isEmployment
            ? { command: "SIMULATE_EMPLOYER_EXIT_DATE", employmentId: action.payload.employmentId }
            : { command: "SIMULATE_BANK_CORRECTION" }),
        });
        const result = await readJson(response);
        if (!response.ok) throw new Error(String(result.error ?? "The confirmed simulation could not be completed."));
        await persistState(proposalState);
        setMessages((current) => [...current, { role: "assistant", text: "Confirmed simulation completed through the same page workflow. Readiness has been recalculated.", source: "fallback" }]);
        router.refresh();
      } catch (error) { setPanelError(error instanceof Error ? error.message : "The confirmed simulation could not be completed. The proposal remains available."); return; }
      finally { setPending(false); }
    } else {
      setPanelError("This proposal is not available in the current journey. No account data changed.");
      return;
    }
    setMessages((current) => current.map((message) => ({ ...message, actions: message.actions?.filter((candidate) => candidate !== action) })));
  }

  async function extractDocument(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) { setExtractionMessage("Choose a synthetic PDF, JPEG, or PNG first."); return; }
    if (!syntheticAccepted) { setExtractionMessage("Confirm that this file contains synthetic demo data only."); return; }
    setExtractionPending(true); setExtractionMessage("");
    const data = new FormData(); data.set("document", file); data.set("documentKind", documentKind); data.set("syntheticDisclosureAccepted", "true");
    try {
      const response = await fetch("/api/assistant/extract", { method: "POST", body: data });
      const result = await readJson(response);
      if (!response.ok) throw new Error(String(result.error ?? "The synthetic document could not be reviewed."));
      setProposals(Array.isArray(result.proposals) ? result.proposals as FormFieldProposal[] : []); setPatchScope("SECTION"); setExtractionMessage(String(result.disclosure ?? "Proposals are ready for review."));
    } catch (error) { setExtractionMessage(error instanceof Error ? error.message : "The synthetic document could not be reviewed."); } finally { setExtractionPending(false); }
  }

  const scopedProposals = patchScope === "FIELD" ? proposals.slice(0, 1) : proposals;
  function clearDocumentReview(message = "") {
    setDocumentKind("BANK_STATEMENT");
    setSyntheticAccepted(false);
    setProposals([]);
    setPatchScope("SECTION");
    setExtractionMessage(message);
    setDocumentOpen(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  function cancelDocumentReview() {
    clearDocumentReview();
    if (proposals.length > 0) {
      void persistState({ kind: "DISMISS_FORM_PATCH" }).catch(() => setPanelError("The proposal was hidden, but that choice may not survive a refresh."));
    }
  }

  async function applyPatch() {
    if (pathname !== "/onboarding" || snapshot.persona !== "NEW_MEMBER") return;
    setPatchPending(true); setExtractionMessage("");
    try {
      const response = await fetch("/api/assistant/form-patch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ processKey: "ONBOARDING", scope: patchScope, section: patchScope === "SECTION" ? scopedProposals[0]?.section : undefined, proposals: scopedProposals, confirmed: true, demoDisclosureAccepted: true }) });
      const result = await readJson(response);
      if (!response.ok) throw new Error(String(result.error ?? "The proposed values could not be applied."));
      const values = Object.fromEntries(scopedProposals.map((proposal) => [proposal.field, ["epfMember", "epsMember"].includes(proposal.field) ? proposal.proposedValue === "true" : proposal.proposedValue])) as AssistantPatchAppliedEventDetail["values"];
      window.dispatchEvent(new CustomEvent<AssistantPatchAppliedEventDetail>(ASSISTANT_PATCH_APPLIED_EVENT, { detail: { values } }));
      clearDocumentReview();
      setMessages((current) => [...current, { role: "assistant", text: String(result.message ?? "The confirmed draft changes were applied."), source: "fallback" }]);
      router.refresh();
    } catch (error) { setExtractionMessage(error instanceof Error ? error.message : "The proposed values could not be applied."); } finally { setPatchPending(false); }
  }

  const definition = guidance ? processDefinitions[guidance.processKey] : null;
  const batches = definition ? buildQuestionBatches([...definition.questions]) : [];
  const currentBatch = guidance ? batches[guidance.position] : null;
  const maxPosition = guidance && definition ? (guidance.mode === "ONE_BY_ONE" ? definition.questions.length - 1 : batches.length - 1) : 0;

  return (
    <section className="assistant-area" aria-label="EPF Sahayak assistant" data-context-stale={contextStale}>
      {workspaceView === "collapsed" && !voiceActive ? <button aria-label="Ask EPF Sahayak" className="assistant-launcher" onClick={openAssistant} type="button"><Bot aria-hidden="true" size={22} /><span><strong>EPF Sahayak</strong><small>Open page guidance</small></span></button> : null}
      {workspaceOpen ? <section
        aria-label="EPF Sahayak workspace"
        aria-modal={workspaceView === "fullscreen" ? true : undefined}
        className="assistant-workspace"
        data-view={workspaceView}
        ref={workspaceRef}
        role={workspaceView === "fullscreen" ? "dialog" : "complementary"}
        tabIndex={-1}
      >
        <header className="assistant-workspace-header"><div><span className="utility-label">Masked demo context</span><h2>EPF Sahayak</h2></div><div className="assistant-workspace-controls">{navigationCompletedInFullscreen && workspaceView === "fullscreen" ? <button className="secondary-action" onClick={() => changeView("docked")} type="button">Exit full screen to view page</button> : null}<button aria-label="Collapse EPF Sahayak" className="icon-action" disabled={voiceActive} onClick={closeAssistant} title={voiceActive ? "End voice mode before collapsing EPF Sahayak." : undefined} type="button"><PanelRightClose aria-hidden="true" size={19} /></button>{workspaceView === "docked" ? <button className="icon-action" onClick={() => changeView("fullscreen")} type="button" aria-label="Open EPF Sahayak full screen"><Maximize2 aria-hidden="true" size={19} /></button> : <button className="icon-action" onClick={() => changeView("docked")} type="button" aria-label="Exit EPF Sahayak full screen"><Minimize2 aria-hidden="true" size={19} /></button>}</div></header>
        <div className="assistant-context-strip"><span className="utility-label">Current page</span><strong>{pageName(pathname)}</strong><span className={contextStale ? "assistant-context-status is-stale" : "assistant-context-status"}>{contextStale ? "Context refresh failed; showing the last verified demo record." : "Masked context verified for this demo."}</span></div>
        <p className="assistant-boundary">Guidance only. Never enter real Aadhaar, UAN, PAN, bank, OTP, biometric, or government data.</p>
        <div aria-label="EPF Sahayak workspace content" className="assistant-workspace-scroll" role="region">
        {guidance && definition ? <section className="question-guidance">
          <div className="question-guidance-heading"><div><span className="utility-label">{definition.title}</span><h3>{definition.questions.length} questions in total</h3></div><button className="text-action" onClick={() => setGuidance(null)} type="button">End guide</button></div>
          {guidance.mode === "ONE_BY_ONE" ? <article><strong>{definition.questions[guidance.position]?.label}</strong><p>{definition.questions[guidance.position]?.explanation}</p><small>Question {guidance.position + 1} of {definition.questions.length}</small></article> : currentBatch ? <div className="question-batch"><p className="utility-label">Batch {currentBatch.index} of {batches.length} · {currentBatch.remainingAfter} remaining after this batch</p><ol>{currentBatch.questions.map((question) => <li key={question.key}><strong>{question.label}</strong><span>{question.explanation}</span></li>)}</ol></div> : null}
          <div className="guidance-controls"><button className="secondary-action" disabled={guidance.position === 0} onClick={() => setGuidance({ ...guidance, position: guidance.position - 1 })} type="button"><ChevronLeft aria-hidden="true" size={17} /> Previous question</button><button className="primary-action" disabled={guidance.position >= maxPosition} onClick={() => setGuidance({ ...guidance, position: guidance.position + 1 })} type="button">Next question <ChevronRight aria-hidden="true" size={17} /></button></div>
        </section> : null}
        <div className="assistant-suggestions" aria-label="Suggested questions">{suggestions.map((suggestion) => <button disabled={pending} key={suggestion} onClick={() => sendMessage(suggestion)} type="button">{suggestion}</button>)}</div>
        {voiceActive ? <AssistantVoiceControl active contextVersion={voiceContextVersion} onExit={() => setVoiceActive(false)} onReturnToText={returnToText} onToolCall={handlePortalAction} pendingAction={pendingPortalAction} onConfirmPending={() => resolvePendingPortalAction(true)} onCancelPending={() => resolvePendingPortalAction(false)} route={pathname} /> : null}
        <div className="assistant-thread" aria-busy={pending || historyLoading} aria-label="EPF Sahayak conversation" aria-live="polite" role="region">
          {visiblePrompt && !suppressPrompt ? <ProactivePrompt prompt={visiblePrompt} onDismiss={() => dismissPrompt(visiblePrompt)} onChooseGuidance={(mode) => chooseGuidance(visiblePrompt, mode)} /> : null}
          {historyLoading ? <div className="assistant-empty"><Sparkles aria-hidden="true" size={18} /> Loading this run’s conversation…</div> : null}
          {!historyLoading && messages.length === 0 ? <div className="assistant-empty">Ask about this page, a status, or the safest next action.</div> : null}
          {messages.map((message, index) => <div key={`${message.role}-${index}-${message.text}`}><AssistantMessage role={message.role} source={message.source} text={message.text} />{message.actions?.map((action) => <div className="assistant-action-card" key={`${action.type}-${action.label}`}><strong>{action.label}</strong><p>Nothing changes until you confirm.</p><div><button className="primary-action" onClick={() => decideAction(action, "CONFIRMED")} type="button">Confirm action</button><button className="secondary-action" onClick={() => decideAction(action, "REJECTED")} type="button">Keep unchanged</button></div></div>)}</div>)}
          {pendingPortalAction ? <div className="assistant-action-card" role="status"><strong>{describePortalAction(pendingPortalAction)}</strong><p>Nothing changes until you confirm.</p><div><button className="primary-action" disabled={pending} onClick={() => resolvePendingPortalAction(true)} type="button">Confirm action</button><button className="secondary-action" disabled={pending} onClick={() => resolvePendingPortalAction(false)} type="button">Cancel</button></div></div> : null}
          {pending ? <div className="assistant-empty"><Sparkles aria-hidden="true" size={18} /> Checking the masked demo record…</div> : null}
        </div>
        {panelError ? <p className="assistant-error" role="alert">{panelError}</p> : null}
        {documentOpen ? <section aria-label="Synthetic document review" className="document-assist" id="assistant-document-review"><header className="document-assist-header"><FileSearch aria-hidden="true" size={18} /><span><strong>Review a synthetic document</strong><small>Produces proposals only</small></span><button className="text-action" onClick={cancelDocumentReview} type="button">Cancel review</button></header><form onSubmit={extractDocument}>
          <label>Document type<select value={documentKind} onChange={(event) => setDocumentKind(event.target.value)}><option value="IDENTITY_RETURN">Simulated identity return</option><option value="JOINING_LETTER">Synthetic joining letter</option><option value="PAN_CARD">Synthetic PAN card</option><option value="BANK_STATEMENT">Synthetic bank statement</option></select></label>
          <label>Choose PDF, JPEG, or PNG (max 5 MB)<input ref={fileRef} accept="application/pdf,image/jpeg,image/png" type="file" /></label>
          <label className="synthetic-confirm"><input checked={syntheticAccepted} onChange={(event) => setSyntheticAccepted(event.target.checked)} type="checkbox" /><span>This file is entirely synthetic and contains no real identity, bank, or government data.</span></label>
          <button className="secondary-action" disabled={extractionPending || !syntheticAccepted} type="submit">{extractionPending ? "Reviewing…" : "Create review proposals"}</button>
        </form>{extractionMessage ? <p className="extraction-feedback" role="status">{extractionMessage}</p> : null}{proposals.length > 0 ? pathname === "/onboarding" && snapshot.persona === "NEW_MEMBER" ? <><div className="patch-scope" aria-label="Apply scope"><button aria-pressed={patchScope === "FIELD"} onClick={() => setPatchScope("FIELD")} type="button">One field</button><button aria-pressed={patchScope === "SECTION"} onClick={() => setPatchScope("SECTION")} type="button">This section</button><button aria-pressed={patchScope === "WHOLE_FORM"} onClick={() => setPatchScope("WHOLE_FORM")} type="button">All extracted</button></div><FormPatchReview proposals={scopedProposals} scope={patchScope} pending={patchPending} onConfirm={applyPatch} onCancel={cancelDocumentReview} /></> : <section aria-label="Review extracted document" className="document-review-only"><div className="patch-list">{proposals.map((proposal) => <article className="patch-row" key={proposal.field}><div className="patch-heading"><strong>{proposal.label}</strong><span data-validation={proposal.validation}>{proposal.validation === "VALID" ? "Reviewed" : "Check value"}</span></div><dl><div><dt>Existing</dt><dd>{proposal.existingValue || "Not saved"}</dd></div><div><dt>Proposed</dt><dd>{proposal.sensitive ? "•••• " : ""}{proposal.proposedValue}</dd></div><div><dt>Source</dt><dd>{proposal.source}</dd></div><div><dt>Confidence</dt><dd>{Math.round(proposal.confidence * 100)}%</dd></div></dl></article>)}</div><p className="document-review-guidance">I can review this synthetic document here. Open new-member setup before applying extracted values to a form.</p></section> : null}</section> : null}
        </div>
        <form className="assistant-form" onSubmit={(event) => { event.preventDefault(); sendMessage(input); }}><label htmlFor="assistant-message">Ask EPF Sahayak</label><input id="assistant-message" onChange={(event) => setInput(event.target.value)} placeholder="Why is this blocked?" value={input} /><button aria-controls="assistant-document-review" aria-expanded={documentOpen} aria-label="Attach synthetic document" className="assistant-attachment-button" onClick={() => setDocumentOpen((current) => !current)} title="Attach synthetic document" type="button"><Paperclip aria-hidden="true" size={18} /></button><button aria-label="Talk to EPF Sahayak" className="assistant-voice-button" disabled={pending} onClick={startVoice} title="Voice" type="button"><Mic aria-hidden="true" size={18} /></button><button className="primary-action" disabled={pending || !input.trim()} type="submit"><Send aria-hidden="true" size={16} /> Send</button></form>
      </section> : null}
    </section>
  );
}
