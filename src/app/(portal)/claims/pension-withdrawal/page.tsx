import { FileBadge2, ShieldAlert } from "lucide-react";
import Link from "next/link";

import { CompactFacts, DetailDisclosure, NextActionPanel, TaskPageHeader } from "@/components/ui/task-first";
import { recordedServiceMonths } from "@/domain/service-readiness";
import { getCachedCurrentRun as requireCurrentRun } from "@/server/auth/session";
import { getCachedMemberSnapshot as getMemberSnapshot } from "@/server/repositories/member-repository";
import styles from "../../services/services.module.css";

export default async function PensionWithdrawalPage() {
  const current = await requireCurrentRun();
  const snapshot = await getMemberSnapshot(current.demoRun.id);
  const months = recordedServiceMonths(snapshot);
  const tenYearsReached = months >= 120;
  const epsMember = snapshot.employments.some((employment) => employment.epsMember);

  return (
    <div className={styles.page}>
      <TaskPageHeader eyebrow="Plan pension" title="Preserve service or review withdrawal benefit" description="See which Form 10C route this fictional service record indicates before comparing the rules." officialTerm="Withdrawal benefit or Scheme Certificate · Form 10C" status={{ label: epsMember ? (tenYearsReached ? "Certificate route" : "Under 10 years") : "Not assessed", tone: epsMember ? "active" : "attention" }} />
      <NextActionPanel eyebrow="Deterministic result" title={!epsMember ? "EPS membership is not recorded" : tenYearsReached ? "Preserve service through the Scheme Certificate route" : "Withdrawal benefit or a Scheme Certificate may be considered"} description={!epsMember ? "This run cannot assess a Form 10C route without an EPS membership record." : tenYearsReached ? "The recorded service span reaches ten years, so withdrawal benefit is not the indicated route. EPFO determines official eligible service." : "The recorded span is below ten years. Official eligible service and other EPS rules still decide the route."} owner={epsMember ? "You and EPFO" : "Employer / EPFO records"} tone={epsMember ? "active" : "attention"} action={<Link className="primary-action" href={epsMember && tenYearsReached ? "/claims/pension" : "/employment"}>{epsMember && tenYearsReached ? "Review monthly pension" : "Review service records"}</Link>} />
      <CompactFacts items={[
        { label: "EPS membership", value: epsMember ? "Recorded" : "Not recorded", supporting: "Fictional employment record" },
        { label: "Recorded service", value: `${months} months`, supporting: tenYearsReached ? "Ten-year boundary reached" : "Below ten-year boundary" },
        { label: "Official eligible service", value: "Not assessed", supporting: "Past service, breaks and certificates can change the result" },
      ]} />
      <DetailDisclosure summary="View Form 10C readiness checks">
      <section className={styles.decision} aria-labelledby="form10c-decision-heading">
        <div className={styles.decisionLead}><FileBadge2 aria-hidden="true" size={24} /><p className="utility-label">Fictional service span</p><h2 id="form10c-decision-heading">{epsMember ? `${months} recorded months` : "EPS membership not recorded"}</h2><strong>{tenYearsReached ? "Scheme Certificate route" : "Under ten-year boundary"}</strong><p>EPFO—not this date-span calculation—determines eligible service.</p></div>
        <ul className={styles.checks}>
          <li><span>{epsMember ? "✓" : "—"}</span><div><strong>EPS membership</strong><small>{epsMember ? "Present in a fictional employment record" : "No EPS membership is available in this run"}</small></div></li>
          <li><span>{tenYearsReached ? "✓" : "—"}</span><div><strong>Ten years of recorded service</strong><small>{tenYearsReached ? "Withdrawal benefit is not the route after this boundary" : "Withdrawal benefit or Scheme Certificate may be considered, subject to official eligible service"}</small></div></li>
          <li><span>!</span><div><strong>Age and official service still matter</strong><small>Past service, breaks, certificates, and EPS rules can change the official result.</small></div></li>
        </ul>
      </section>
      </DetailDisclosure>
      <DetailDisclosure summary="Compare Form 10C outcomes">
      <section className={styles.panel} aria-labelledby="form10c-options-heading"><p className="utility-label">Choose the intended outcome</p><h2 id="form10c-options-heading">Do not treat both options as the same payment</h2><div className={styles.optionGrid}>
        <article className={styles.option}><p className="utility-label">Withdrawal benefit</p><h3>Receive the admissible EPS withdrawal benefit</h3><p>Generally relevant where official eligible service remains below ten years. The amount uses the EPS withdrawal-benefit table and cannot be derived accurately from the passbook balance.</p><dl><dt>This record</dt><dd>{epsMember && !tenYearsReached ? "May be considered" : "Not indicated"}</dd><dt>Important</dt><dd>This is not a refund of an EPS account balance.</dd></dl></article>
        <article className={styles.option}><p className="utility-label">Scheme Certificate</p><h3>Preserve pensionable service</h3><p>The certificate records pensionable service so it can be combined with future EPS service or used for later pension rights.</p><dl><dt>This record</dt><dd>{epsMember ? "Can be reviewed as an option" : "EPS service required"}</dd><dt>At ten years</dt><dd>Certificate, not withdrawal benefit</dd></dl></article>
        <article className={styles.option}><p className="utility-label">Monthly pension</p><h3>Form 10D is a separate route</h3><p>A member with sufficient eligible service and the applicable age or pension category reviews Form 10D rather than treating Form 10C as pension.</p><dl><dt>Next page</dt><dd><Link className={styles.nextLink} href="/claims/pension">Review Form 10D</Link></dd></dl></article>
      </div></section>
      </DetailDisclosure>
      <DetailDisclosure summary="View Form 10C prototype boundary">
      <section className={styles.boundary}><ShieldAlert aria-hidden="true" size={23} /><div><p className="utility-label">Prototype boundary</p><h2>No withdrawal or certificate request is created</h2><p>This page does not calculate the official withdrawal factor, issue a Scheme Certificate, or contact EPFO.</p></div><span>Decision guide only</span></section>
      </DetailDisclosure>
    </div>
  );
}
