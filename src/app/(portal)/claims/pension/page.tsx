import { Landmark, ShieldAlert } from "lucide-react";
import Link from "next/link";

import { CompactFacts, DetailDisclosure, NextActionPanel, TaskPageHeader } from "@/components/ui/task-first";
import { memberAge, recordedServiceMonths } from "@/domain/service-readiness";
import { getCachedCurrentRun as requireCurrentRun } from "@/server/auth/session";
import { getCachedMemberSnapshot as getMemberSnapshot } from "@/server/repositories/member-repository";
import styles from "../../services/services.module.css";

export default async function PensionPage() {
  const current = await requireCurrentRun();
  const snapshot = await getMemberSnapshot(current.demoRun.id);
  const age = memberAge(snapshot.profile.dateOfBirth);
  const months = recordedServiceMonths(snapshot);
  const tenYearsReached = months >= 120;
  const hasExited = snapshot.employments.some((employment) => employment.exitedAt);
  const memberRoute = age >= 58 && tenYearsReached
    ? "Superannuation pension appears relevant"
    : age >= 50 && age < 58 && tenYearsReached && hasExited
      ? "Reduced pension may be reviewed"
      : "Age-based member pension is not indicated yet";

  return (
    <div className={styles.page}>
      <TaskPageHeader eyebrow="Plan pension" title="Check monthly pension readiness" description="Lead with the age-and-service result, then review the pension categories and evidence boundaries." officialTerm="Monthly pension · Form 10D" status={{ label: memberRoute, tone: memberRoute.includes("not indicated") ? "attention" : "active" }} />
      <NextActionPanel eyebrow="Deterministic member result" title={memberRoute} description="This result uses the fictional member age, recorded service span, and exit status. Disablement and family pension categories are not assessed because their evidence is not stored." owner="You and EPFO" tone={memberRoute.includes("not indicated") ? "attention" : "active"} action={<Link className="primary-action" href="/employment">Review service records</Link>} />
      <CompactFacts items={[
        { label: "Member age", value: `${age} years`, supporting: "Calculated as at 22 August 2026" },
        { label: "Recorded service", value: `${months} months`, supporting: tenYearsReached ? "Ten-year date-span reached" : "Ten-year date-span not reached" },
        { label: "Other pension categories", value: "Not assessed", supporting: "Disability and family evidence are not stored" },
      ]} />
      <DetailDisclosure summary="View Form 10D readiness checks">
      <section className={styles.decision} aria-labelledby="pension-decision-heading"><div className={styles.decisionLead}><Landmark aria-hidden="true" size={24} /><p className="utility-label">Member-age branch</p><h2 id="pension-decision-heading">{memberRoute}</h2><strong>Age {age} · {months} recorded service months</strong><p>Calculated from fictional dates as at 22 August 2026. Official pensionable service can differ.</p></div><ul className={styles.checks}>
        <li><span>{age >= 58 ? "✓" : "—"}</span><div><strong>Superannuation pension</strong><small>Member at age 58 or above, subject to EPS eligibility.</small></div></li>
        <li><span>{age >= 50 && age < 58 && hasExited ? "✓" : "—"}</span><div><strong>Reduced pension</strong><small>Member age 50 to below 58 who has left service, with the applicable reduction and eligible service.</small></div></li>
        <li><span>!</span><div><strong>Disablement and family categories</strong><small>Not assessed: this prototype does not store disability, death, spouse, child, guardian, nominee, or dependent-parent evidence.</small></div></li>
      </ul></section>
      </DetailDisclosure>
      <DetailDisclosure summary="Compare Form 10D pension categories">
      <section className={styles.panel} aria-labelledby="pension-types-heading"><p className="utility-label">Form 10D pension types</p><h2 id="pension-types-heading">The claimant determines the evidence path</h2><div className={styles.optionGrid}>
        <article className={styles.option}><p className="utility-label">Member</p><h3>Superannuation or reduced pension</h3><p>Age, leaving service, and eligible pensionable service determine whether and when the member route can start.</p><dl><dt>Ten-year record check</dt><dd>{tenYearsReached ? "Reached in this date-span preview" : "Not reached in this date-span preview"}</dd></dl></article>
        <article className={styles.option}><p className="utility-label">Member</p><h3>Disablement pension</h3><p>Applies on leaving service because of total and permanent disablement, subject to official medical and contribution requirements.</p><dl><dt>This prototype</dt><dd>Not assessed</dd></dl></article>
        <article className={styles.option}><p className="utility-label">Family or beneficiary</p><h3>Survivor pension categories</h3><p>Widow/widower, children, orphan, guardian, nominee, and dependent-parent claims use category-specific evidence.</p><dl><dt>This prototype</dt><dd>No family claim facts stored</dd></dl></article>
      </div></section>
      </DetailDisclosure>
      <DetailDisclosure summary="View Form 10D prototype boundary">
      <section className={styles.boundary}><ShieldAlert aria-hidden="true" size={23} /><div><p className="utility-label">Prototype boundary</p><h2>No pension amount or Form 10D is submitted</h2><p>The pension formula needs official pensionable salary, eligible service, category, dates, and supporting records that this demo does not hold.</p></div><span>Readiness only</span></section>
      </DetailDisclosure>
    </div>
  );
}
