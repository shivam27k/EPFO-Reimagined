"use client";

import { CheckCircle2, RotateCcw, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import type { MemberSnapshot } from "@/domain/member-snapshot";
import type { ScenarioKey, ScenarioStage } from "@/domain/types";

type ScenarioArea = "Onboarding" | "Contributions" | "Employment" | "Claims";

type ScenarioDefinition = {
  key: ScenarioKey;
  area: ScenarioArea;
  title: string;
  simulated: string;
  learning: string;
  href: string;
};

export const scenarioCatalog = [
  { key: "ONBOARDING_NAME_MISMATCH", area: "Onboarding", title: "Bank-name mismatch during onboarding", simulated: "Fictional bank and Aadhaar names do not match.", learning: "See validation stop a likely rejection before KYC is saved.", href: "/onboarding" },
  { key: "MISSING_CONTRIBUTION", area: "Contributions", title: "Missing monthly contribution", simulated: "One wage month is absent from the employer/ECR ledger.", learning: "See the missing month and responsible actor without reading a raw passbook.", href: "/passbook" },
  { key: "MISSING_EXIT_DATE", area: "Employment", title: "Missing employer exit date", simulated: "A previous employer has not recorded the date of exit.", learning: "See why a claim is blocked and simulate the employer-owned correction.", href: "/employment" },
  { key: "CLAIM_BANK_NAME_MISMATCH", area: "Claims", title: "Bank mismatch blocks a claim", simulated: "The verified identity name and fictional bank name differ.", learning: "See claim readiness explain the blocker before submission.", href: "/claims" },
  { key: "CRYPTIC_CLAIM_STATUS", area: "Claims", title: "Confusing claim status", simulated: "A claim moves through simulated EPFO review states.", learning: "See each status translated into what happened, who acts, and what comes next.", href: "/claims" },
  { key: "PAYMENT_RETURNED", area: "Claims", title: "Bank-returned claim payment", simulated: "A fictional payment return is represented as an optional claim-stage scenario.", learning: "See the bank named as the owner instead of treating payment as a silent failure.", href: "/claims" },
] as const satisfies readonly ScenarioDefinition[];

const scenarioAreas: readonly ScenarioArea[] = ["Onboarding", "Contributions", "Employment", "Claims"];

function derivedStage(snapshot: MemberSnapshot | undefined, key: ScenarioKey): ScenarioStage {
  const recorded = snapshot?.scenarioRuns.find((scenario) => scenario.scenarioKey === key)?.stage;
  if (recorded) return recorded;
  if (!snapshot && key === "MISSING_EXIT_DATE") return "ISSUE_LOADED";
  if (key === "MISSING_CONTRIBUTION" && snapshot?.findings.some((finding) => finding.code.startsWith("CONTRIBUTION_GAP_"))) return "ISSUE_LOADED";
  if (key === "CLAIM_BANK_NAME_MISMATCH" && snapshot?.findings.some((finding) => finding.code === "BANK_NAME_MISMATCH")) return "ISSUE_LOADED";
  if (key === "PAYMENT_RETURNED" && snapshot?.activeClaim?.status === "PAYMENT_RETURNED") return "ISSUE_LOADED";
  if (key === "CRYPTIC_CLAIM_STATUS" && snapshot?.activeClaim && !["DRAFT", "SETTLED", "REJECTED", "PAYMENT_RETURNED"].includes(snapshot.activeClaim.status)) return "ISSUE_LOADED";
  return "START";
}

function scenarioStatus(stage: ScenarioStage) {
  if (stage === "COMPLETE" || stage === "RESOLVED") return { state: "completed", label: "Completed" } as const;
  if (stage === "ISSUE_LOADED") return { state: "current", label: "Issue loaded" } as const;
  if (stage === "ACTION_REQUESTED") return { state: "current", label: "Action requested" } as const;
  return { state: "available", label: "Available" } as const;
}

export function ScenarioDrawer({
  snapshot,
  open = false,
  onClose = () => undefined,
}: {
  snapshot?: MemberSnapshot;
  open?: boolean;
  onClose?: () => void;
}) {
  const [isResetting, setIsResetting] = useState(false);
  const [message, setMessage] = useState("");

  async function resetDemo() {
    const confirmed = window.confirm("Reset this demo run? All profile changes, scenario progress, claim activity, and assistant messages in this session will return to the selected demo account's starting state.");
    if (!confirmed) return;
    setIsResetting(true);
    setMessage("");
    try {
      const response = await fetch("/api/scenarios/reset", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ command: "RESET" }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "The demo could not be reset.");
      setMessage("Demo reset to this account's starting scenario.");
      window.location.assign("/overview?demo=reset");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The demo could not be reset.");
    } finally {
      setIsResetting(false);
    }
  }

  return (
    <aside
      aria-hidden={!open}
      aria-label="Demo scenario workspace"
      aria-modal={open ? true : undefined}
      className="utility-drawer scenario-drawer"
      data-open={open}
      data-utility-panel="scenarios"
      id="scenario-utility-panel"
      inert={!open ? true : undefined}
      role="dialog"
      tabIndex={-1}
    >
      <header className="utility-drawer-header">
        <div><span className="utility-label">Demo mode only</span><h2>Explore scenarios</h2></div>
        <button aria-label="Close demo scenarios" className="icon-action" data-utility-close onClick={onClose} type="button"><X aria-hidden="true" size={20} /></button>
      </header>
      <div className="utility-drawer-scroll">
        <div className="scenario-panel">
          <header className="scenario-panel-heading">
            <div><p className="utility-label">Judge guide</p><h2>Choose a scenario</h2></div>
            <p>Open one fictional state on the page where a member would encounter it.</p>
          </header>
          <div className="scenario-groups">
            {scenarioAreas.map((area) => (
              <section aria-labelledby={`scenario-${area.toLowerCase()}`} key={area}>
                <h3 id={`scenario-${area.toLowerCase()}`}>{area}</h3>
                <div className="scenario-list">
                  {scenarioCatalog.filter((scenario) => scenario.area === area).map((scenario) => {
                    const status = scenarioStatus(derivedStage(snapshot, scenario.key));
                    return (
                      <article className="scenario-item" data-state={status.state} key={scenario.key}>
                        <div className="scenario-item-heading">
                          <h4>{scenario.title}</h4>
                        </div>
                        <dl>
                          <div><dt>Demonstration</dt><dd>{scenario.simulated}</dd></div>
                          <div><dt>State</dt><dd className="scenario-state">{status.state === "completed" ? <CheckCircle2 aria-hidden="true" size={16} /> : null}{status.label}</dd></div>
                        </dl>
                        <Link aria-label={`${scenario.title} — open scenario`} href={scenario.href} onClick={onClose}>Open scenario</Link>
                        <details className="scenario-learning">
                          <summary>What judges can observe</summary>
                          <p>{scenario.learning}</p>
                        </details>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
          <footer className="scenario-footer">
            <div><strong>Replay is always safe</strong><p>Reset restarts this session. Logging out disposes it; signing in again creates a fresh, isolated copy of the same starting scenario.</p><p aria-live="polite">{message}</p></div>
            <button className="secondary-action" disabled={isResetting} onClick={resetDemo} type="button"><RotateCcw aria-hidden="true" size={17} />{isResetting ? "Resetting…" : "Reset demo"}</button>
          </footer>
        </div>
      </div>
    </aside>
  );
}
