"use client";

import { ArrowRight, Clock3, FileCheck2, ShieldAlert } from "lucide-react";

import type { getOnboardingPreflight } from "@/domain/process-definitions";

type Preflight = ReturnType<typeof getOnboardingPreflight>;

const sourceDisplayLabels: Record<string, string> = {
  "Simulated UMANG return sheet": "UMANG return sheet",
  "Synthetic Aadhaar result sheet": "Aadhaar result sheet",
  "Demo mobile number": "Mobile number",
  "Synthetic joining letter": "Joining letter",
  "Synthetic PAN card": "PAN card",
  "Synthetic bank statement": "Bank statement",
};

export function PreflightPanel({
  preflight,
  onManual,
  onAutofill,
  disclosureAccepted,
  onDisclosureChange,
}: {
  preflight: Preflight;
  onManual: () => void;
  onAutofill: () => void;
  disclosureAccepted: boolean;
  onDisclosureChange: (accepted: boolean) => void;
}) {
  return (
    <section className="preflight-panel" aria-labelledby="preflight-heading">
      <div className="preflight-intro">
        <p className="utility-label">Before you begin</p>
        <h2 id="preflight-heading">Prepare a fictional member file</h2>
        <p>
          This guided demo is for a new EPF member recording identity, contact,
          first employment, and KYC readiness. It does not connect to EPFO or any bank.
        </p>
      </div>

      <dl className="preflight-facts">
        <div>
          <FileCheck2 aria-hidden="true" size={20} />
          <dt>Questions</dt>
          <dd>{preflight.questionCount} exact demo questions</dd>
        </div>
        <div>
          <Clock3 aria-hidden="true" size={20} />
          <dt>Estimated effort</dt>
          <dd>About {preflight.estimatedMinutes} minutes</dd>
        </div>
      </dl>

      <div className="preflight-register">
        <div>
          <h3>Synthetic documents and information</h3>
          <ul>
            {preflight.requiredSources.map((source) => (
              <li key={source}>{sourceDisplayLabels[source] ?? source}</li>
            ))}
          </ul>
        </div>
        <div>
          <h3>Four short sections</h3>
          <ol>
            {preflight.steps.map((step) => <li key={step.key}>{step.label}</li>)}
          </ol>
        </div>
      </div>

      <div className="data-warning" role="note">
        <ShieldAlert aria-hidden="true" size={22} />
        <p>
          <strong>Use synthetic data only.</strong> Do not enter a real UAN, Aadhaar,
          PAN, bank account, member ID, mobile number, or other government data.
        </p>
      </div>

      <div className="official-process-note" role="note">
        <strong>Official UAN handoff:</strong> UAN allotment and activation continue in
        UMANG under EPFO Services → UAN Services Through Face Auth, while this prototype
        only returns a fictional UAN and never collects Aadhaar numbers, face images, or biometrics.
      </div>

      <label className="disclosure-consent">
        <input
          checked={disclosureAccepted}
          onChange={(event) => onDisclosureChange(event.target.checked)}
          type="checkbox"
        />
        Accept the synthetic-data disclosure before starting
      </label>

      <div className="preflight-actions">
        <button className="primary-action" disabled={!disclosureAccepted} onClick={onManual} type="button">
          Enter demo details manually <ArrowRight aria-hidden="true" size={18} />
        </button>
        <div className="simulated-choice">
          <span>Simulated shortcut</span>
          <button className="secondary-action" disabled={!disclosureAccepted} onClick={onAutofill} type="button">
            Fill with valid demo data
          </button>
        </div>
      </div>
    </section>
  );
}
