"use client";

import { Check, ShieldCheck, X } from "lucide-react";

import type { FormFieldProposal, FormPatchScope } from "@/server/assistant/form-copilot";

function confidenceLabel(confidence: number) {
  if (confidence >= 0.95) return "High confidence";
  if (confidence >= 0.8) return "Review recommended";
  return "Low confidence";
}

export function FormPatchReview({
  proposals,
  scope,
  pending,
  disabled = false,
  prepareOnly = false,
  onConfirm,
  onCancel,
}: {
  proposals: FormFieldProposal[];
  scope: FormPatchScope;
  pending: boolean;
  disabled?: boolean;
  prepareOnly?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const requiresReExtraction = proposals.some((proposal) => proposal.validation !== "VALID");
  return (
    <section className="form-patch-review" aria-label="Review proposed form changes">
      <header>
        <div>
          <span className="utility-label">{scope.replaceAll("_", " ")} proposal</span>
          <h3>Review before anything changes</h3>
        </div>
        <ShieldCheck aria-hidden="true" size={22} />
      </header>
      <div className="patch-list">
        {proposals.map((proposal) => (
          <article className="patch-row" key={proposal.field}>
            <div className="patch-heading">
              <strong>{proposal.label}</strong>
              <span data-validation={proposal.validation}>{proposal.validation === "VALID" ? "Valid" : "Check value"}</span>
            </div>
            <dl>
              <div><dt>Existing</dt><dd>{proposal.existingValue || "Not saved"}</dd></div>
              <div><dt>Proposed</dt><dd>{proposal.sensitive ? "•••• " : ""}{proposal.proposedValue}</dd></div>
              <div><dt>Source</dt><dd>{proposal.source}</dd></div>
              <div><dt>Confidence</dt><dd>{confidenceLabel(proposal.confidence)} · {Math.round(proposal.confidence * 100)}%</dd></div>
            </dl>
          </article>
        ))}
      </div>
      <p className="patch-boundary">{prepareOnly ? "Prepare an exact stored proposal first. No draft fields are saved until you review and confirm that proposal." : "Confirming saves a synthetic onboarding draft only. It never accepts a legal declaration or submits a claim."}</p>
      {requiresReExtraction ? <p className="patch-boundary">Sensitive proposed values were masked when this run was saved. Re-run the synthetic extraction before applying them.</p> : null}
      <div className="patch-actions">
        <button className="primary-action" disabled={disabled || pending || requiresReExtraction} onClick={onConfirm} type="button">
          <Check aria-hidden="true" size={17} /> {pending ? "Working…" : prepareOnly ? "Prepare exact review" : "Confirm proposed changes"}
        </button>
        <button className="secondary-action" disabled={disabled || pending} onClick={onCancel} type="button">
          <X aria-hidden="true" size={17} /> Cancel
        </button>
      </div>
    </section>
  );
}
