import { CheckCircle2 } from "lucide-react";
import Link from "next/link";

import { EmploymentActions } from "@/components/employment/employment-actions";
import {
  CompactFacts,
  DetailDisclosure,
  NextActionPanel,
  TaskPageHeader,
} from "@/components/ui/task-first";
import { requireCurrentRun } from "@/server/auth/session";
import { getMemberSnapshot } from "@/server/repositories/member-repository";

export default async function EmploymentPage(
  { searchParams = Promise.resolve({}) }: { searchParams?: Promise<{ updated?: string }> } = {},
) {
  const current = await requireCurrentRun();
  const [snapshot, params] = await Promise.all([
    getMemberSnapshot(current.demoRun.id),
    searchParams,
  ]);
  const missingExitFinding = snapshot.findings.find(
    (finding) => finding.code === "MISSING_EXIT_DATE",
  );
  const openEmployment = snapshot.employments.find((employment) => !employment.exitedAt);
  const exitUpdateNeeded = Boolean(openEmployment);
  const latestEmployment = snapshot.employments[0];
  const nextService = snapshot.employments.length > 1
    ? { href: "/transfers", label: "Review transfer options" }
    : { href: "/claims", label: "Review claim readiness" };

  return (
    <div className="task-first-stack employment-page">
      {params.updated === "exit" ? (
        <section className="flow-complete-banner" role="status" aria-labelledby="exit-complete-heading">
          <CheckCircle2 aria-hidden="true" size={25} />
          <div>
            <p className="utility-label">Employment record updated</p>
            <h2 id="exit-complete-heading">Date of exit recorded</h2>
            <p>The missing-exit blocker has been cleared in this demo run. Review the updated record below, then continue to claim readiness.</p>
          </div>
        </section>
      ) : null}
      <TaskPageHeader
        eyebrow="Employment history"
        title="Keep your employment record ready"
        description="See the one employment update that matters now, then open the complete service record when you need it."
        officialTerm="UAN-linked service records"
        status={exitUpdateNeeded
          ? { label: "Exit update needed", tone: "attention" }
          : { label: "Employment record complete", tone: "complete" }}
      />

      {exitUpdateNeeded ? (
        <NextActionPanel
          eyebrow="Recommended next action"
          title="Mark exit yourself"
          description={`${missingExitFinding?.explanation ?? "A date of exit has not been recorded for this employment."} Use the member-side process when its conditions are met.`}
          owner="You"
          tone="attention"
          action={<Link className="primary-action" href="/employment/mark-exit">Mark exit</Link>}
          secondaryAction={openEmployment ? (
            <div>
              <p className="utility-label">Demo alternative · previous employer</p>
              <EmploymentActions employmentId={openEmployment.employmentKey} />
            </div>
          ) : undefined}
        />
      ) : (
        <NextActionPanel
          eyebrow="Employment record complete"
          title="Your recorded employment exit is complete"
          description="No missing exit date is blocking the next service in this demo run."
          owner="No action needed now"
          tone="complete"
          action={<Link className="primary-action" href={nextService.href}>{nextService.label}</Link>}
        />
      )}

      <CompactFacts items={[
        {
          label: "Current state",
          value: exitUpdateNeeded ? "Exit date not recorded" : "Exit dates recorded",
          supporting: openEmployment?.establishmentName ?? "No open employment record",
        },
        {
          label: "Responsible now",
          value: exitUpdateNeeded ? "You" : "No action needed",
          supporting: exitUpdateNeeded ? "Member-side Mark Exit is available" : "Continue to the next service when ready",
        },
        {
          label: "Latest record",
          value: latestEmployment?.establishmentName ?? "No employment record",
          supporting: latestEmployment ? `Joined ${latestEmployment.joinedAt}` : "Employment is added during onboarding",
        },
      ]} />

      <DetailDisclosure summary="View employment records">
        <section className="record-stack" aria-labelledby="employment-records-heading">
          <div className="section-heading-row">
            <div>
              <p className="utility-label">Service register</p>
              <h2 id="employment-records-heading">Employment records</h2>
            </div>
          </div>
        {snapshot.employments.map((employment) => (
          <article className="employment-record" key={`${employment.memberIdMasked}-${employment.joinedAt}`}>
            <div>
              <p className="utility-label">Establishment</p>
              <h3>{employment.establishmentName}</h3>
              <p>{employment.exitedAt ? "Previous employment" : "Exit date not recorded"}</p>
            </div>
            <dl>
              <div><dt>Member ID</dt><dd>{employment.memberIdMasked}</dd></div>
              <div><dt>Date of joining EPF</dt><dd>{employment.joinedAt}</dd></div>
              <div><dt>Date of exit</dt><dd>{employment.exitedAt ?? "Not recorded by employer"}</dd></div>
              <div><dt>EPF / EPS</dt><dd>{employment.epfMember ? "EPF member" : "No EPF"} · {employment.epsMember ? "EPS member" : "No EPS"}</dd></div>
            </dl>
          </article>
        ))}
        </section>
      </DetailDisclosure>
    </div>
  );
}
