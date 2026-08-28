"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { PersistedProposal } from "@/domain/assistant-proposals";
import type { ToolResult } from "@/domain/assistant-tools";
import { processDefinitions } from "@/domain/process-definitions";
import { FormPatchReview } from "./form-patch-review";

export function PersistedActionReview({ proposal, busy, acknowledged, onDisplayed, onDecision }: {
  proposal: PersistedProposal; busy: boolean; acknowledged: string;
  onDisplayed: (proposal: PersistedProposal) => Promise<void>;
  onDecision: (decision: "confirm" | "cancel") => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [expired, setExpired] = useState(false);
  const identity = proposal.proposalId + ":" + proposal.payloadHash;
  useEffect(() => {
    const timer = setTimeout(() => setExpired(true), Math.max(0, Date.parse(proposal.expiresAt) - Date.now()));
    return () => clearTimeout(timer);
  }, [proposal.expiresAt]);
  useEffect(() => {
    const element = ref.current;
    if (!element || proposal.status !== "pending" || acknowledged === identity) return;
    let sent = false;
    const display = () => {
      const rect = element.getBoundingClientRect();
      if (sent || document.visibilityState !== "visible" || element.closest('[inert], [hidden], [aria-hidden="true"]')
        || !element.getClientRects().length || rect.bottom <= 0 || rect.top >= window.innerHeight) return;
      sent = true;
      void onDisplayed(proposal);
    };
    const observer = new IntersectionObserver((entries) => { if (entries.some((entry) => entry.isIntersecting)) display(); });
    observer.observe(element);
    const timer = setTimeout(display, 0);
    document.addEventListener("visibilitychange", display);
    return () => { observer.disconnect(); clearTimeout(timer); document.removeEventListener("visibilitychange", display); };
  }, [acknowledged, identity, onDisplayed, proposal]);
  const disabled = busy || expired || proposal.status !== "pending" || acknowledged !== identity;
  const payload = proposal.payload;
  return <div className="assistant-action-card" ref={ref}>
    <p>{proposal.message}</p>
    {payload.kind === "onboarding" ? <FormPatchReview
      proposals={payload.fields.map((field) => {
        const question = processDefinitions.ONBOARDING.questions.find((item) => item.key === field);
        return { field, label: question?.label ?? field, existingValue: "Current saved draft",
          proposedValue: String(payload.maskedValues[field] ?? payload.values[field] ?? ""),
          source: payload.source, confidence: 1, validation: "VALID", section: question?.step ?? "",
          sensitive: field in payload.maskedValues };
      })}
      scope="WHOLE_FORM" pending={busy} disabled={disabled}
      onConfirm={() => onDecision("confirm")} onCancel={() => onDecision("cancel")} />
      : <><strong>{payload.action.replaceAll("_", " ")}</strong>
        <dl>{Object.entries(payload).filter(([key, value]) => key !== "kind" && key !== "action" && value !== null)
          .map(([key, value]) => <div key={key}><dt>{key}</dt><dd style={{ overflowWrap: "anywhere" }}>{String(value)}</dd></div>)}</dl>
        <p>Synthetic demo change only. Nothing changes until a subsequent confirmation.</p>
        <div><button className="primary-action" disabled={disabled} onClick={() => onDecision("confirm")} type="button">Confirm action</button>
          <button className="secondary-action" disabled={disabled} onClick={() => onDecision("cancel")} type="button">Cancel</button></div></>}
    <small>{expired ? "Expired — prepare a fresh proposal." : proposal.status !== "pending"
      ? "This proposal is " + proposal.status + ". Prepare a fresh review."
      : acknowledged !== identity ? "Registering this displayed review…" : "Exact proposal reviewed. Confirmation expires after five minutes."}</small>
  </div>;
}
function TemporaryActionNotice({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 2_000);
    return () => clearTimeout(timer);
  }, []);
  return visible ? <>{children}</> : null;
}

export function AssistantActionProgress({ results, refreshStatus }: { results: ToolResult[]; refreshStatus: string }) {
  if (!results.length) return null;
  return <section aria-label="Assistant action progress" aria-live="polite">
    {results.slice(-5).map((result) => <TemporaryActionNotice key={JSON.stringify([
      result.callId, result.status, result.message, result.error?.code, result.data?.receiptId,
    ])}><div className="assistant-action-card">
      <small>{result.status.replaceAll("_", " ")}</small><p>{result.message}</p>
      {result.error ? <small>{result.error.code}</small> : null}
      {typeof result.data?.receiptId === "string" ? <small>Receipt: {result.data.receiptId}</small> : null}
    </div></TemporaryActionNotice>)}
    {refreshStatus ? <TemporaryActionNotice key={refreshStatus}><p role="status">{refreshStatus}</p></TemporaryActionNotice> : null}
  </section>;
}
