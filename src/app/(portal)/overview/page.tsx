import { CheckCircle2 } from "lucide-react";
import Link from "next/link";

import {
  CompactFacts,
  DetailDisclosure,
  NextActionPanel,
  TaskPageHeader,
  type TaskTone,
} from "@/components/ui/task-first";
import type { Finding } from "@/domain/types";
import { requireCurrentRun } from "@/server/auth/session";
import { getCachedMemberSnapshot } from "@/server/repositories/member-repository";

const ownerLabels: Record<Finding["owner"], string> = {
  MEMBER: "You",
  EMPLOYER: "Previous employer",
  EPFO: "EPFO",
  BANK: "Bank",
  AADHAAR: "Aadhaar",
};

const severityOrder: Record<Finding["severity"], number> = {
  BLOCKER: 0,
  WARNING: 1,
  INFO: 2,
};

function formatRupees(amountInPaise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amountInPaise / 100);
}

function findingAction(finding: Finding) {
  if (finding.code === "MISSING_EXIT_DATE" || finding.code === "INVALID_EXIT_DATE") {
    return { href: "/employment", label: "Review employment record" };
  }
  if (finding.code.includes("CONTRIBUTION")) {
    return { href: "/passbook", label: "Review contribution ledger" };
  }
  if (
    finding.owner === "BANK"
    || finding.owner === "AADHAAR"
    || ["PAN_NAME_MISMATCH", "BANK_NAME_MISMATCH", "BANK_NOT_VERIFIED", "PENDING_BANK_CHANGE", "IDENTITY_NOT_ACTIVATED"].includes(finding.code)
  ) {
    return { href: "/profile", label: "Review KYC details" };
  }
  return { href: "/claims", label: "Review claim readiness" };
}

function toneForFindings(findings: Finding[]): TaskTone {
  if (findings.some((finding) => finding.severity === "BLOCKER")) return "blocked";
  if (findings.some((finding) => finding.severity === "WARNING")) return "attention";
  return findings.length > 0 ? "active" : "complete";
}

export default async function OverviewPage(
  { searchParams = Promise.resolve({}) }: { searchParams?: Promise<{ demo?: string }> } = {},
) {
  const current = await requireCurrentRun();
  const [snapshot, params] = await Promise.all([
    getCachedMemberSnapshot(current.demoRun.id),
    searchParams,
  ]);
  const hasMissingExitDate = snapshot.findings.some(
    (finding) => finding.code === "MISSING_EXIT_DATE",
  );
  const employmentRecord = hasMissingExitDate
    ? snapshot.employments[0]
    : (snapshot.employments.find((employment) => employment.exitedAt === null) ??
      snapshot.employments[0]);
  const employmentState = hasMissingExitDate
    ? "Previous employment — exit update pending"
    : employmentRecord?.exitedAt
      ? "Previous employment"
      : "Current employment";
  const latestContribution = snapshot.contributions[0];
  const postedBalance = snapshot.contributions
    .filter((contribution) => contribution.postingStatus === "POSTED")
    .reduce(
      (sum, contribution) => sum + contribution.employeeEpf + contribution.employerEpf,
      0,
    );
  const blockers = snapshot.findings.filter((finding) => finding.severity === "BLOCKER");
  const sortedFindings = [...snapshot.findings].sort(
    (left, right) => severityOrder[left.severity] - severityOrder[right.severity],
  );
  const priorityAlerts = sortedFindings.slice(0, 3);
  const recommendedFinding = sortedFindings.find(
    (finding) => findingAction(finding).href === snapshot.nextAction.href,
  );
  const tone = toneForFindings(snapshot.findings);

  return (
    <div className="task-first-stack overview-page">
      {params.demo === "reset" ? (
        <section className="flow-complete-banner" role="status" aria-labelledby="reset-complete-heading">
          <CheckCircle2 aria-hidden="true" size={25} />
          <div>
            <p className="utility-label">Demo reset complete</p>
            <h2 id="reset-complete-heading">The starting scenario has been restored</h2>
            <p>Profile changes, scenario progress, claim activity and assistant messages from the previous run have been cleared. You can replay the journey now.</p>
          </div>
        </section>
      ) : null}

      <TaskPageHeader
        eyebrow="Home"
        title={`Good to see you, ${snapshot.profile.displayName.split(" ")[0]}.`}
        description="See what needs attention now, then open supporting account records only when you need them."
        status={{
          label: blockers.length > 0
            ? `${blockers.length} blocker${blockers.length === 1 ? "" : "s"}`
            : snapshot.profile.onboardingComplete
              ? "Account set up"
              : "Setup in progress",
          tone,
        }}
      />

      <NextActionPanel
        eyebrow="Recommended next action"
        title={snapshot.nextAction.label}
        description={recommendedFinding?.explanation ?? (snapshot.profile.onboardingComplete
          ? "Your profile has no blocking issue. Continue with the most useful account task."
          : "Finish the remaining setup checks before relying on claim readiness.")}
        owner={recommendedFinding ? ownerLabels[recommendedFinding.owner] : "You"}
        tone={recommendedFinding ? toneForFindings([recommendedFinding]) : tone}
        action={<Link className="primary-action" href={snapshot.nextAction.href}>{snapshot.nextAction.label}</Link>}
      />

      <CompactFacts items={[
        {
          label: "Illustrative balance",
          value: formatRupees(postedBalance),
          supporting: "Posted employee and employer EPF deposits",
        },
        {
          label: "Profile state",
          value: snapshot.profile.onboardingComplete ? "Set up" : "Verification needed",
          supporting: snapshot.profile.onboardingComplete ? "Member profile saved" : "Bank and identity checks remain",
        },
        {
          label: "Open blockers",
          value: blockers.length,
          supporting: blockers.length > 0 ? "Resolve these before claiming" : "No blocking finding detected",
        },
      ]} />

      <section className="alerts-section" aria-labelledby="alerts-heading">
        <div className="section-heading-row">
          <div>
            <p className="utility-label">Prioritized alerts</p>
            <h2 id="alerts-heading">What needs attention</h2>
          </div>
          <span>{snapshot.findings.length} open</span>
        </div>
        {priorityAlerts.length > 0 ? (
          <div className="owner-groups">
            {priorityAlerts.map((finding) => {
              const action = findingAction(finding);
              return (
                <article className="alert-row" data-severity={finding.severity.toLowerCase()} key={finding.code}>
                  <div>
                    <span className="alert-severity">{finding.severity} · {ownerLabels[finding.owner]}</span>
                    <h4>{finding.title}</h4>
                    <p>{finding.explanation}</p>
                  </div>
                  <Link className="portal-action-link" href={action.href}>{action.label}</Link>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="empty-register">
            <p>No alerts are open.</p>
            <span>Your supporting records remain available below.</span>
          </div>
        )}
      </section>

      {sortedFindings.length > priorityAlerts.length ? (
        <DetailDisclosure summary={`View ${sortedFindings.length - priorityAlerts.length} more account alert${sortedFindings.length - priorityAlerts.length === 1 ? "" : "s"}`}>
          <div className="owner-groups">
            {sortedFindings.slice(3).map((finding) => {
              const action = findingAction(finding);
              return (
                <article className="alert-row" data-severity={finding.severity.toLowerCase()} key={finding.code}>
                  <div>
                    <span className="alert-severity">{finding.severity} · {ownerLabels[finding.owner]}</span>
                    <h4>{finding.title}</h4>
                    <p>{finding.explanation}</p>
                  </div>
                  <Link className="portal-action-link" href={action.href}>{action.label}</Link>
                </article>
              );
            })}
          </div>
        </DetailDisclosure>
      ) : null}

      <DetailDisclosure summary="View account records">
        <div className="overview-facts">
          <section className="fact-row" aria-labelledby="employment-heading">
            <div><p className="utility-label">Employment</p><h2 id="employment-heading">Employment record</h2></div>
            {employmentRecord ? (
              <dl>
                <div><dt>State</dt><dd><strong className="fact-state">{employmentState}</strong><span>{employmentRecord.establishmentName} is recorded from {employmentRecord.joinedAt}.</span></dd></div>
                <div><dt>Responsible</dt><dd>{hasMissingExitDate ? "Previous employer" : "No action needed now"}</dd></div>
                <div><dt>Open record</dt><dd><Link className="portal-action-link" href="/employment">Review employment record</Link></dd></div>
              </dl>
            ) : <p>No employment record has been added yet.</p>}
          </section>

          <section className="fact-row" aria-labelledby="contribution-heading">
            <div><p className="utility-label">Ledger</p><h2 id="contribution-heading">Latest contribution</h2></div>
            {latestContribution ? (
              <dl>
                <div><dt>State</dt><dd>{latestContribution.wageMonth}: {latestContribution.postingStatus.toLowerCase()}.</dd></div>
                <div><dt>Responsible</dt><dd>{latestContribution.postingStatus === "POSTED" ? "No action needed" : "Employer"}</dd></div>
                <div><dt>Open record</dt><dd><Link className="portal-action-link" href="/passbook">Review contribution ledger</Link></dd></div>
              </dl>
            ) : <p>No contributions have been posted for this new account.</p>}
          </section>

          <section className="fact-row" aria-labelledby="claim-readiness-heading">
            <div><p className="utility-label">Claims</p><h2 id="claim-readiness-heading">Claim readiness</h2></div>
            <dl>
              <div><dt>State</dt><dd>{!snapshot.profile.onboardingComplete ? "Not assessed until profile verification" : blockers.length === 0 ? "No blockers detected" : `${blockers.length} blocker${blockers.length === 1 ? "" : "s"}`}</dd></div>
              <div><dt>Responsible</dt><dd>{!snapshot.profile.onboardingComplete ? "You, then your bank" : blockers[0] ? ownerLabels[blockers[0].owner] : "You, when you choose to claim"}</dd></div>
              <div><dt>Open record</dt><dd><Link className="portal-action-link" href="/claims">Review claim readiness</Link></dd></div>
            </dl>
          </section>
        </div>
      </DetailDisclosure>
    </div>
  );
}
