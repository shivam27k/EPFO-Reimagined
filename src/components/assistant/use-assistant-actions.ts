"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { persistedProposalSchema, type PersistedProposal } from "@/domain/assistant-proposals";
import { toolResultSchema, type ToolResult } from "@/domain/assistant-tools";
import { ASSISTANT_PATCH_APPLIED_EVENT, type AssistantPatchAppliedEventDetail } from "@/domain/assistant-events";
import type { OnboardingDraftDto } from "@/domain/onboarding-schema";
import { assistantRequest, recoverCall } from "./assistant-transport";

const CALLS_KEY = "epf-sahayak:recent-action-calls";
export function rememberCall(callId: string) {
  try {
    const previous = JSON.parse(sessionStorage.getItem(CALLS_KEY) ?? "[]") as string[];
    sessionStorage.setItem(CALLS_KEY, JSON.stringify([...new Set([...previous, callId])].slice(-16)));
  } catch { /* Recovery IDs are optional local hints, never authorization. */ }
}
export function useAssistantActions(
  route: string,
  onRefresh: () => Promise<boolean>,
  onDecisionStart: () => void,
  onCommitted?: (proposal: PersistedProposal, result: ToolResult) => void,
) {
  const [proposal, setProposal] = useState<PersistedProposal | null>(null);
  const [progress, setProgress] = useState<ToolResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [acknowledged, setAcknowledged] = useState("");
  const [refreshStatus, setRefreshStatus] = useState("");
  const receipts = useRef(new Set<string>());
  const refreshRef = useRef(onRefresh);
  const committedRef = useRef(onCommitted);
  const proposalRevision = useRef(0);
  const decisionRef = useRef<{ proposalId: string; decision: string; requestKey: string; callId: string } | null>(null);
  useEffect(() => { refreshRef.current = onRefresh; }, [onRefresh]);
  useEffect(() => { committedRef.current = onCommitted; }, [onCommitted]);
  const acceptResult = useCallback((result: ToolResult, applyCurrentReadback = false, refreshCommitted = true) => {
    rememberCall(result.callId);
    setProgress((current) => [...current.filter((item) => item.callId !== result.callId), result].slice(-8));
    const parsed = persistedProposalSchema.safeParse(result.data?.proposal);
    if (parsed.success && applyCurrentReadback) { proposalRevision.current += 1; setProposal(parsed.data); }
    const receiptId = result.data?.receiptId;
    if (typeof receiptId === "string" && result.data?.recordOutcome === "committed") {
      setProposal((current) => current?.proposalId === result.data?.proposalId ? null : current);
      if (!receipts.current.has(receiptId)) {
        receipts.current.add(receiptId);
        const readback = result.data.readback as { draft?: OnboardingDraftDto; appliedFields?: string[] } | undefined;
        if (applyCurrentReadback && readback?.draft) {
          const fields = readback.appliedFields ?? [];
          const values = Object.fromEntries(Object.entries(readback.draft.values).filter(([field]) => fields.includes(field)));
          const maskedValues = Object.fromEntries(Object.entries(readback.draft.maskedValues).filter(([field]) => fields.includes(field)));
          window.dispatchEvent(new CustomEvent<AssistantPatchAppliedEventDetail>(ASSISTANT_PATCH_APPLIED_EVENT, {
            detail: { values, maskedValues, receiptId },
          }));
        }
        if (refreshCommitted) {
          setRefreshStatus("Server write committed; refreshing the browser separately…");
          void refreshRef.current().then((observed) => setRefreshStatus(observed
            ? "Server receipt retained. Fresh member context fetched; route render is not verified."
            : "Server receipt retained. Browser refresh was not verified; refresh the page when ready."))
            .catch(() => setRefreshStatus("Server receipt retained. Browser refresh failed."));
        } else {
          setRefreshStatus("");
        }
      }
    }
    if (result.status === "cancelled") setProposal((current) => current?.proposalId === result.data?.proposalId ? null : current);
  }, []);
  const reload = useCallback(async () => {
    const revision = proposalRevision.current;
    try {
      const result = toolResultSchema.parse(await assistantRequest("/api/assistant/actions"));
      if (revision !== proposalRevision.current) return;
      const parsed = persistedProposalSchema.safeParse(result.data?.proposal);
      setProposal(parsed.success ? parsed.data : null);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Pending proposal could not be restored."); }
  }, []);
  useEffect(() => {
    void reload();
    let active = true;
    let ids: string[] = [];
    try { ids = JSON.parse(sessionStorage.getItem(CALLS_KEY) ?? "[]") as string[]; } catch {}
    void (async () => {
      for (const id of ids.slice(-16)) {
        if (!active) break;
        const result = await recoverCall(id);
        if (active && result.error?.code !== "CALL_NOT_FOUND") acceptResult(result);
      }
    })();
    const focus = () => { void reload(); };
    window.addEventListener("focus", focus);
    return () => { active = false; window.removeEventListener("focus", focus); };
  }, [acceptResult, reload]);
  const markDisplayed = useCallback(async (exact: PersistedProposal) => {
    try {
      const body = await assistantRequest<{ proposal: unknown }>("/api/assistant/actions",
        { kind: "displayed", proposalId: exact.proposalId, payloadHash: exact.payloadHash });
      const fresh = persistedProposalSchema.parse(body.proposal);
      setProposal((current) => current?.proposalId === exact.proposalId && current.payloadHash === exact.payloadHash ? fresh : current);
      setAcknowledged(exact.proposalId + ":" + exact.payloadHash);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Review acknowledgement failed."); }
  }, []);
  const decide = async (decision: "confirm" | "cancel") => {
    if (!proposal || busy || acknowledged !== proposal.proposalId + ":" + proposal.payloadHash) return;
    onDecisionStart();
    setBusy(true); setError("");
    const exact = proposal;
    let event = decisionRef.current;
    if (!event || event.proposalId !== exact.proposalId || event.decision !== decision) {
      event = { proposalId: exact.proposalId, decision, requestKey: crypto.randomUUID(), callId: crypto.randomUUID() };
      decisionRef.current = event;
    }
    rememberCall(event.callId);
    try {
      const response = await assistantRequest<{ result: unknown }>("/api/assistant/actions", {
        ...event, kind: "decision", route, payloadHash: exact.payloadHash,
      });
      const result = toolResultSchema.parse(response.result);
      const redirectsAfterCommit = decision === "confirm"
        && result.status === "completed"
        && result.data?.recordOutcome === "committed"
        && exact.payload.kind === "simulation"
        && exact.payload.action === "simulate_employer_exit_date";
      acceptResult(result, true, !redirectsAfterCommit);
      if (result.status !== "completed" && result.status !== "cancelled") setError(result.message);
      if (redirectsAfterCommit) {
        committedRef.current?.(exact, result);
        return;
      }
      if (decision === "confirm" && result.status === "completed" && result.data?.recordOutcome === "committed") {
        committedRef.current?.(exact, result);
      }
      await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Decision outcome is uncertain; do not repeat the change.");
      acceptResult(await recoverCall(event.callId));
      await reload();
    } finally { setBusy(false); }
  };
  return { proposal, progress, busy, error, acknowledged, refreshStatus, acceptResult, reload, markDisplayed, decide };
}
