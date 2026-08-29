import { CheckCircle2 } from "lucide-react";
import Link from "next/link";

import { ContributionTable } from "@/components/passbook/contribution-table";
import { AutomaticContributionTimeline } from "@/components/passbook/automatic-contribution-timeline";
import {
  CompactFacts,
  DetailDisclosure,
  NextActionPanel,
  TaskPageHeader,
} from "@/components/ui/task-first";
import { calculatePostedEpfBalance } from "@/domain/epf-balance";
import { getCachedCurrentRun as requireCurrentRun } from "@/server/auth/session";
import { getCachedMemberSnapshot as getMemberSnapshot } from "@/server/repositories/member-repository";

function formatRupees(amountInPaise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amountInPaise / 100);
}

export default async function PassbookPage(
  { searchParams = Promise.resolve({}) }: { searchParams?: Promise<{ onboarding?: string; timeline?: string }> } = {},
) {
  const current = await requireCurrentRun();
  const [snapshot, params] = await Promise.all([
    getMemberSnapshot(current.demoRun.id),
    searchParams,
  ]);
  const postedBalance = calculatePostedEpfBalance(snapshot.contributions);
  const gapContribution = snapshot.contributions.find((contribution) => contribution.postingStatus !== "POSTED");
  const latestContribution = snapshot.contributions[0];
  const canSimulateMonths = snapshot.persona === "NEW_MEMBER" && snapshot.profile.onboardingComplete;
  const contributionStatus = gapContribution
    ? gapContribution.postingStatus === "MISSING"
      ? `Missing contribution · ${gapContribution.wageMonth}`
      : `Delayed contribution · ${gapContribution.wageMonth}`
    : snapshot.contributions.length > 0
      ? "Contributions up to date"
      : "No contributions yet";

  return (
    <div className="task-first-stack passbook-page">
      {canSimulateMonths && snapshot.contributions.length === 0 ? <AutomaticContributionTimeline /> : null}
      {params.onboarding === "complete" || params.timeline === "complete" ? (
        <section className="flow-complete-banner" role="status" aria-labelledby="onboarding-complete-heading">
          <CheckCircle2 aria-hidden="true" size={25} />
          <div>
            <p className="utility-label">{params.timeline === "complete" ? "Timeline simulated" : "Onboarding complete"}</p>
            <h2 id="onboarding-complete-heading">{params.timeline === "complete" ? "Six contribution months are now in your passbook" : "Your demo member profile is ready"}</h2>
            <p>{params.timeline === "complete" ? "The fictional member, employer EPF and employer EPS entries below cover August 2026 through January 2027." : "Identity, first employment and simulated KYC records were saved. The contribution timeline is being created automatically."}</p>
          </div>
        </section>
      ) : null}
      <TaskPageHeader
        eyebrow="Contributions and passbook"
        title="See whether monthly contributions are on track"
        description="Start with contribution status, then open the monthly EPF ledger and its fictional scenario controls when needed."
        officialTerm="EPF passbook"
        status={{
          label: contributionStatus,
          tone: gapContribution ? "attention" : snapshot.contributions.length > 0 ? "complete" : "active",
        }}
      />

      {snapshot.contributions.length === 0 ? (
        <NextActionPanel
          eyebrow="Recommended next action"
          title={canSimulateMonths ? "Create your first six contribution months" : snapshot.persona === "NEW_MEMBER" ? "Complete member setup first" : "Wait for your first contribution record"}
          description={canSimulateMonths
            ? "This new-member demo has no posted months yet. Create six fictional wage months to continue."
            : snapshot.persona === "NEW_MEMBER"
              ? "Complete member setup before the simulated employment timeline can create a wage record."
              : "Contribution history appears after the employment timeline creates a wage record."}
          owner={canSimulateMonths || snapshot.persona === "NEW_MEMBER" ? "You" : "Employer payroll / ECR"}
          tone="active"
          action={canSimulateMonths
            ? null
            : snapshot.persona === "NEW_MEMBER"
              ? <Link className="primary-action" href="/onboarding">Complete member setup</Link>
              : <Link className="primary-action" href="/claims">Review claim readiness</Link>}
          secondaryAction={<Link className="secondary-action" href="/employment">Review employment record</Link>}
        />
      ) : gapContribution ? (
        <NextActionPanel
          eyebrow="Contribution needs attention"
          title={gapContribution.postingStatus === "MISSING" ? `A contribution is missing for ${gapContribution.wageMonth}` : `A contribution is delayed for ${gapContribution.wageMonth}`}
          description="The employer must complete the ECR posting. The full monthly record and demo controls are available below."
          owner="Employer payroll / ECR"
          tone="attention"
          action={<a className="primary-action" href="#monthly-contribution-records">View monthly records</a>}
        />
      ) : (
        <NextActionPanel
          eyebrow="Contribution status"
          title="Your recorded contributions are up to date"
          description="No missing or delayed month is detected in this demo run. You can review the full ledger below."
          owner="No action needed now"
          tone="complete"
          action={<Link className="primary-action" href="/claims">Review claim readiness</Link>}
        />
      )}

      <CompactFacts items={[
        {
          label: "Latest month",
          value: latestContribution?.wageMonth ?? "No month recorded",
          supporting: latestContribution ? latestContribution.establishmentName : "Create fictional months after onboarding",
        },
        {
          label: "Gap state",
          value: gapContribution ? gapContribution.postingStatus === "MISSING" ? "Missing" : "Delayed" : snapshot.contributions.length > 0 ? "No gap detected" : "Not assessed",
          supporting: gapContribution ? `${gapContribution.wageMonth} needs employer/ECR attention` : "Posting status is shown before the balance",
        },
        {
          label: "Posted balance",
          value: formatRupees(postedBalance),
          supporting: "Posted fictional employee and employer EPF rows",
        },
      ]} />

      {snapshot.contributions.length > 0 ? (
        <DetailDisclosure assistantTarget="contributions.monthly_records" summary="View monthly contribution records" defaultOpen={Boolean(gapContribution)}>
          <div id="monthly-contribution-records">
            <ContributionTable contributions={snapshot.contributions} />
          </div>
        </DetailDisclosure>
      ) : (
        <section className="empty-register">
          <p>No contributions have been posted for this demo run yet.</p>
          <span>For the new-member journey, use the recommended action above after onboarding to create six fictional wage months.</span>
        </section>
      )}
    </div>
  );
}
