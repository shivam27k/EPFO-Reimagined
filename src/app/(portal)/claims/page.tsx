import Link from "next/link";

import { ClaimActions } from "@/components/claims/claim-actions";
import { ClaimReadiness } from "@/components/claims/claim-readiness";
import { ClaimTimeline } from "@/components/claims/claim-timeline";
import { CompactFacts, DetailDisclosure, NextActionPanel, TaskPageHeader, type TaskTone } from "@/components/ui/task-first";
import { calculateFinalSettlementAmount } from "@/domain/epf-balance";
import { processDefinitions } from "@/domain/process-definitions";
import { demoReferenceDate } from "@/domain/service-readiness";
import type { ClaimStatus } from "@/domain/types";
import { requireCurrentRun } from "@/server/auth/session";
import { getMemberSnapshot } from "@/server/repositories/member-repository";

function formatRupees(amountInPaise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amountInPaise / 100);
}

const statusCopy: Record<ClaimStatus, { label: string; title: string; description: string; owner: string; tone: TaskTone }> = {
  DRAFT: { label: "Draft", title: "Review readiness before submitting", description: "Submit only when every deterministic check is clear and the required declarations below have been reviewed.", owner: "You", tone: "active" },
  SUBMITTED: { label: "Submitted", title: "Your fictional claim has been received", description: "Load the next simulated EPFO status. Do not submit the claim again while it is pending.", owner: "EPFO", tone: "active" },
  UNDER_REVIEW: { label: "Under review", title: "EPFO review is in progress", description: "The claim is being reviewed in this simulation; no resubmission is needed.", owner: "EPFO", tone: "active" },
  APPROVED: { label: "Approved", title: "The claim is approved for simulated payment", description: "Continue to the bank settlement step, or use the demo-path disclosure to inspect a returned payment.", owner: "Bank", tone: "complete" },
  PAYMENT_SENT: { label: "Payment sent", title: "The simulated payment is with the bank", description: "Continue to settlement, or use the demo-path disclosure to inspect a returned payment.", owner: "Bank", tone: "active" },
  PAYMENT_RETURNED: { label: "Payment returned", title: "The bank returned the simulated payment", description: "The EPFO approval remains recorded. Retry the fictional payment after reviewing the bank details.", owner: "Bank", tone: "attention" },
  SETTLED: { label: "Settled", title: "The fictional settlement is complete", description: "The simulated payment reached the fictional bank account. No further claim action is required.", owner: "Complete", tone: "complete" },
  REJECTED: { label: "Rejected", title: "The fictional claim was rejected", description: "Review the event history for the recorded reason. This demo does not offer a resubmission transition from this state.", owner: "EPFO", tone: "blocked" },
};

const ownerLabels = { MEMBER: "You", EMPLOYER: "Employer", EPFO: "EPFO", BANK: "Bank", AADHAAR: "Aadhaar" } as const;

export default async function ClaimsPage() {
  const current = await requireCurrentRun();
  const snapshot = await getMemberSnapshot(current.demoRun.id);
  const blockers = snapshot.findings.filter((finding) =>
    finding.severity === "BLOCKER" && finding.code !== "ACTIVE_FINAL_SETTLEMENT_CLAIM_EXISTS"
  );
  const canSubmit = blockers.length === 0;
  const displayedClaim = snapshot.activeClaim ?? snapshot.latestClaim;
  const claimAmount = calculateFinalSettlementAmount(snapshot.contributions, displayedClaim);
  const bankRecord = snapshot.kyc.find((record) => record.type === "BANK");
  const exitedEmployment = snapshot.employments.find((employment) => employment.exitedAt);
  const eligibilityAsOf = snapshot.simulations[0]?.recordedAt.slice(0, 10) ?? demoReferenceDate;
  const reviewDetails = {
    bankAccountConfirmed: {
      facts: [
        { label: "Payment account", value: bankRecord?.valueMasked ?? "No verified bank account available" },
        { label: "Verification", value: bankRecord?.status === "VERIFIED" ? "Verified" : "Needs attention" },
      ],
      editHref: "/profile",
      editLabel: "Review or update bank details",
    },
    exitDateConfirmed: {
      facts: [
        { label: "Employer", value: exitedEmployment?.establishmentName ?? "No exited employment available" },
        { label: "Recorded exit date", value: exitedEmployment?.exitedAt ?? "Not recorded" },
      ],
      editHref: "/employment",
      editLabel: "Review employment record",
    },
    unemploymentDeclared: {
      facts: [
        { label: "Exit date", value: exitedEmployment?.exitedAt ?? "Not recorded" },
        { label: "Eligibility checked as of", value: eligibilityAsOf },
        { label: "Result", value: "Two-month unemployment requirement completed" },
      ],
    },
    claimDeclarationAccepted: {
      facts: [
        { label: "Claim", value: "Final settlement · Form 19" },
        { label: "Amount", value: formatRupees(claimAmount) },
        { label: "Submission", value: "Fictional demo claim; no EPFO system is contacted" },
      ],
    },
  };
  const claimStatus = displayedClaim?.status;
  const state = claimStatus
    ? statusCopy[claimStatus]
    : canSubmit
      ? { label: "Eligible to submit", title: "Your final settlement is ready to submit", description: "Review the required declarations, then submit this fictional Form 19 claim.", owner: "You", tone: "active" as const }
      : { label: `${blockers.length} blocker${blockers.length === 1 ? "" : "s"}`, title: blockers[0]?.title ?? "Claim readiness needs attention", description: blockers[0]?.explanation ?? "Complete the outstanding eligibility checks before submitting.", owner: blockers[0] ? ownerLabels[blockers[0].owner] : "You", tone: "blocked" as const };
  const latestEvent = snapshot.claimEvents[0];
  const submissionPossible = canSubmit && (!claimStatus || claimStatus === "DRAFT");
  const waitCanBeSimulated = (!claimStatus || claimStatus === "DRAFT") && blockers.length === 1 && blockers[0]?.code === "TWO_MONTH_UNEMPLOYMENT_NOT_MET";
  const blockerHref = blockers[0]?.code.includes("EXIT_DATE") ? "/employment" : blockers[0]?.owner === "EPFO" ? "/help" : "/profile";
  const primaryAction = claimStatus === "SETTLED"
    ? <Link className="primary-action" href="/services">Choose another service</Link>
    : claimStatus === "REJECTED"
      ? <Link className="primary-action" href="/help">Review claim help</Link>
      : blockers.length && (!claimStatus || claimStatus === "DRAFT") && !waitCanBeSimulated
        ? <Link className="primary-action" href={blockerHref}>Resolve claim blocker</Link>
        : <ClaimActions canSubmit={canSubmit} status={claimStatus} blockerCodes={blockers.map((finding) => finding.code)} reviewDetails={reviewDetails} />;

  return (
    <div className="task-first-stack claims-page">
      <TaskPageHeader
        eyebrow="Claims"
        title="Withdraw your full PF balance"
        description="See whether you can submit or track the current fictional final-settlement claim."
        officialTerm="Final settlement · Form 19"
        status={{ label: state.label, tone: state.tone }}
      />

      <NextActionPanel
        eyebrow="Current claim status"
        title={state.title}
        description={state.description}
        owner={state.owner}
        tone={state.tone}
        action={submissionPossible ? undefined : primaryAction}
      />

      {submissionPossible ? (
        <ClaimActions canSubmit={canSubmit} status={claimStatus} blockerCodes={blockers.map((finding) => finding.code)} reviewDetails={reviewDetails} />
      ) : null}

      <CompactFacts items={[
        { label: "Claim amount", value: formatRupees(claimAmount), supporting: "Posted employee and employer EPF balance" },
        { label: "Responsible now", value: state.owner, supporting: claimStatus ? "Based on current claim status" : "Based on the highest-priority blocker" },
        { label: "Last update", value: latestEvent ? latestEvent.occurredAt.slice(0, 10) : "Not submitted", supporting: latestEvent?.status.replaceAll("_", " ") ?? "No claim event yet" },
      ]} />

      <DetailDisclosure summary={blockers.length ? `View ${blockers.length} eligibility blocker${blockers.length === 1 ? "" : "s"}` : "View eligibility checks"}>
        <ClaimReadiness findings={snapshot.findings} />
      </DetailDisclosure>

      {!submissionPossible ? (
        <DetailDisclosure summary="View final-settlement confirmation requirements">
          <ul>
            {processDefinitions.FINAL_CLAIM.questions.map((question) => (
              <li key={question.key}><strong>{question.label}</strong> — {question.explanation}</li>
            ))}
          </ul>
        </DetailDisclosure>
      ) : null}

      {(claimStatus === "SUBMITTED" || claimStatus === "APPROVED" || claimStatus === "PAYMENT_SENT") ? (
        <DetailDisclosure summary="View alternative demo transition">
          <p>These controls demonstrate a secondary claim-state branch and are not the recommended next action.</p>
          <ClaimActions canSubmit={canSubmit} status={claimStatus} blockerCodes={blockers.map((finding) => finding.code)} mode="alternative" />
        </DetailDisclosure>
      ) : null}

      <DetailDisclosure summary="View full claim event history">
        <ClaimTimeline events={snapshot.claimEvents} />
      </DetailDisclosure>
    </div>
  );
}
