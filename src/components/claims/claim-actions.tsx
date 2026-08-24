"use client";

import { ChevronDown, CircleAlert, Send, StepForward } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { processDefinitions } from "@/domain/process-definitions";
import type { ClaimStatus } from "@/domain/types";

type ClaimCommand =
  | "SIMULATE_CRYPTIC_STATUS"
  | "SIMULATE_TWO_MONTH_WAIT"
  | "SIMULATE_EPFO_APPROVAL"
  | "SIMULATE_PAYMENT_RETURNED"
  | "SIMULATE_BANK_PAYMENT";

interface ClaimActionsProps {
  canSubmit: boolean;
  status?: ClaimStatus | null;
  blockerCodes: string[];
  mode?: "primary" | "alternative";
  reviewDetails?: Partial<Record<string, {
    facts: Array<{ label: string; value: string }>;
    editHref?: string;
    editLabel?: string;
  }>>;
}

const reviewButtonLabels: Record<string, string> = {
  bankAccountConfirmed: "Review bank account details",
  exitDateConfirmed: "Review exit details",
  unemploymentDeclared: "Review unemployment eligibility",
  claimDeclarationAccepted: "Review claim declaration",
};

export function ClaimActions({ canSubmit, status, blockerCodes, mode = "primary", reviewDetails = {} }: ClaimActionsProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmations, setConfirmations] = useState<Record<string, boolean>>({});
  const [reviewed, setReviewed] = useState<Record<string, boolean>>({});
  const [expandedReview, setExpandedReview] = useState<string | null>(null);
  const idempotencyKey = useMemo(() => `claim-${crypto.randomUUID()}`, []);
  const requiredConfirmations = processDefinitions.FINAL_CLAIM.questions;
  const allConfirmed = requiredConfirmations.every((question) => confirmations[question.key]);

  async function call(method: "POST" | "PATCH", body: Record<string, string>, completed: string) {
    setPending(true);
    setMessage("");
    try {
      const response = await fetch("/api/claims", {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json() as { error?: string; blockers?: Array<{ title: string }> };
      if (!response.ok) {
        throw new Error(result.blockers?.[0]?.title ?? result.error ?? "Claim action failed. Nothing was changed; retry this action.");
      }
      setMessage(completed);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Claim action failed. Nothing was changed; retry this action.");
    } finally {
      setPending(false);
    }
  }

  function transitionButton(command: ClaimCommand, label: string, pendingLabel: string, completed: string, icon: "step" | "alert" = "step") {
    const Icon = icon === "alert" ? CircleAlert : StepForward;
    return (
      <button
        className={mode === "primary" ? "primary-action" : "secondary-action"}
        disabled={pending}
        onClick={() => call("PATCH", { command }, completed)}
        type="button"
      >
        <Icon aria-hidden="true" size={17} />
        {pending ? pendingLabel : label}
      </button>
    );
  }

  if (mode === "primary" && canSubmit && (!status || status === "DRAFT")) {
    return (
      <section className="claim-confirmation-panel" aria-labelledby="claim-confirmations-heading">
        <div>
          <p className="utility-label">Required before submission</p>
          <h2 id="claim-confirmations-heading">Confirm all four claim details</h2>
          <p>Review each fictional record and declaration. Submit stays unavailable until all four are confirmed.</p>
        </div>
        <fieldset disabled={pending}>
          <legend>Final settlement confirmations</legend>
          {requiredConfirmations.map((question) => {
            const details = reviewDetails[question.key];
            const isExpanded = expandedReview === question.key;
            const reviewRequired = Boolean(details);
            return (
              <div className="claim-review-item" key={question.key}>
                <div className="claim-review-row">
                  <label>
                    <input
                      checked={Boolean(confirmations[question.key])}
                      disabled={reviewRequired && !reviewed[question.key]}
                      onChange={(event) => setConfirmations((current) => ({
                        ...current,
                        [question.key]: event.target.checked,
                      }))}
                      type="checkbox"
                    />
                    <span>
                      <strong>{question.label}</strong>
                      <small>{question.officialTerm} · {question.explanation}</small>
                    </span>
                  </label>
                  {details ? (
                    <button
                      aria-expanded={isExpanded}
                      className="claim-review-toggle"
                      onClick={() => {
                        setReviewed((current) => ({ ...current, [question.key]: true }));
                        setExpandedReview(isExpanded ? null : question.key);
                      }}
                      type="button"
                    >
                      {reviewButtonLabels[question.key] ?? "Review details"}
                      <ChevronDown aria-hidden="true" size={17} />
                    </button>
                  ) : null}
                </div>
                {details && isExpanded ? (
                  <div className="claim-review-details">
                    <dl>
                      {details.facts.map((fact) => (
                        <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>
                      ))}
                    </dl>
                    {details.editHref && details.editLabel ? (
                      <Link href={details.editHref}>{details.editLabel}</Link>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </fieldset>
        <div className="claim-confirmation-action">
          <button
            className="primary-action"
            disabled={pending || !canSubmit || !allConfirmed}
            onClick={() => call("POST", { idempotencyKey }, "Final settlement was submitted in this demo. The visible claim status has been refreshed.")}
            type="button"
          >
            <Send aria-hidden="true" size={17} />
            {pending ? "Submitting final settlement…" : "Submit final settlement"}
          </button>
          <p aria-live="polite" role="status">{message}</p>
        </div>
      </section>
    );
  }

  let action = null;

  if (mode === "alternative") {
    if (status === "SUBMITTED") {
      action = transitionButton("SIMULATE_EPFO_APPROVAL", "Skip status issue and simulate EPFO approval", "Simulating EPFO approval…", "EPFO approval was simulated. The visible claim status has been refreshed.");
    } else if (status === "APPROVED" || status === "PAYMENT_SENT") {
      action = transitionButton("SIMULATE_PAYMENT_RETURNED", "Simulate bank payment returned", "Simulating returned payment…", "A returned bank payment was simulated. The visible claim status has been refreshed.", "alert");
    }
  } else if ((!status || status === "DRAFT") && blockerCodes.length === 1 && blockerCodes.includes("TWO_MONTH_UNEMPLOYMENT_NOT_MET")) {
    action = transitionButton("SIMULATE_TWO_MONTH_WAIT", "Simulate two-month eligibility wait", "Advancing eligibility date…", "The two-month wait was simulated. Claim readiness has been refreshed.");
  } else if (status === "SUBMITTED") {
    action = transitionButton("SIMULATE_CRYPTIC_STATUS", "Load and explain the EPFO status", "Loading EPFO status…", "The EPFO status was loaded and explained. The visible claim status has been refreshed.", "alert");
  } else if (status === "UNDER_REVIEW") {
    action = transitionButton("SIMULATE_EPFO_APPROVAL", "Simulate EPFO approval", "Simulating EPFO approval…", "EPFO approval was simulated. The visible claim status has been refreshed.");
  } else if (status === "APPROVED" || status === "PAYMENT_SENT") {
    action = transitionButton("SIMULATE_BANK_PAYMENT", "Simulate bank settlement", "Simulating bank settlement…", "Bank settlement was simulated. The visible claim status has been refreshed.");
  } else if (status === "PAYMENT_RETURNED") {
    action = transitionButton("SIMULATE_BANK_PAYMENT", "Simulate corrected bank payment", "Simulating corrected bank payment…", "The corrected bank payment was simulated. The visible claim status has been refreshed.");
  }

  if (!action) return null;

  return (
    <div className="demo-inline-actions">
      {action}
      <p aria-live="polite" role="status">{message}</p>
    </div>
  );
}
