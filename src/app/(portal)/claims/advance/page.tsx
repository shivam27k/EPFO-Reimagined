import { Calculator, Info, ShieldAlert } from "lucide-react";
import Link from "next/link";

import { CompactFacts, DetailDisclosure, NextActionPanel, TaskPageHeader } from "@/components/ui/task-first";
import { formatRupees, postedContributionSummary, recordedServiceMonths } from "@/domain/service-readiness";
import { requireCurrentRun } from "@/server/auth/session";
import { getMemberSnapshot } from "@/server/repositories/member-repository";
import styles from "../../services/services.module.css";

export default async function AdvanceClaimPage() {
  const current = await requireCurrentRun();
  const snapshot = await getMemberSnapshot(current.demoRun.id);
  const serviceMonths = recordedServiceMonths(snapshot);
  const serviceYears = serviceMonths / 12;
  const summary = postedContributionSummary(snapshot);
  const illnessCeiling = Math.min(summary.employeeShare, summary.inferredMonthlyEpfWage * 6);
  const marriageEducationCeiling = Math.floor(summary.employeeShare * 0.5);
  const housingCeiling = Math.min(summary.totalEpf, summary.inferredMonthlyEpfWage * 36);
  const options = [
    { title: "Illness", term: "Para 68J", condition: "No minimum service period shown in this walkthrough", ready: summary.employeeShare > 0, amount: illnessCeiling, note: "Lower of six months’ basic wages and DA or the employee share with interest. Official checks decide the admissible amount." },
    { title: "Marriage or post-matric education", term: "Para 68K", condition: "Seven years of membership", ready: serviceYears >= 7, amount: marriageEducationCeiling, note: "Up to 50% of the employee share with interest, subject to the official purpose, frequency, and evidence rules." },
    { title: "House or flat purchase / construction", term: "Para 68B", condition: "Five years of membership", ready: serviceYears >= 5, amount: housingCeiling, note: "For a house/flat/construction, the ceiling also depends on actual cost. This preview cannot establish that third value." },
  ];

  return (
    <div className={styles.page}>
      <TaskPageHeader eyebrow="Withdraw money" title="Take an advance for an allowed purpose" description="Start with what the money is for; the amount is only an illustrative ceiling from fictional records." officialTerm="PF advance · Form 31 / Composite Claim Form" status={{ label: "Not assessed", tone: "attention" }} />
      <NextActionPanel eyebrow="Deterministic result" title="Purpose-specific eligibility is not assessed" description="This record can compare service and balance conditions, but it does not store the evidence needed to establish an allowed purpose or approval." owner="You and EPFO" tone="attention" action={<Link className="primary-action" href="/passbook">Review contribution records</Link>} />
      <CompactFacts items={[
        { label: "Posted EPF", value: formatRupees(summary.totalEpf), supporting: `${summary.postedMonths} posted month${summary.postedMonths === 1 ? "" : "s"}` },
        { label: "Recorded service", value: `${serviceMonths} months`, supporting: "Fictional date-span calculation" },
        { label: "Purpose evidence", value: "Not assessed", supporting: "Cost, relationship, medical and frequency facts are not stored" },
      ]} />
      <DetailDisclosure summary="View account-basis checks">
      <section className={styles.decision} aria-labelledby="advance-summary-heading">
        <div className={styles.decisionLead}><Calculator aria-hidden="true" size={24} /><p className="utility-label">Recorded account basis</p><h2 id="advance-summary-heading">Illustrative ceiling only</h2><strong>{formatRupees(summary.totalEpf)} posted EPF</strong><p>{serviceMonths} completed fictional service months are visible in this run.</p></div>
        <ul className={styles.checks}>
          <li><span>✓</span><div><strong>Identity shown as {snapshot.kyc.some((item) => item.type === "AADHAAR" && item.status === "VERIFIED") ? "verified" : "not verified"}</strong><small>Simulated KYC status, never a live UIDAI result.</small></div></li>
          <li><span>✓</span><div><strong>{summary.postedMonths} posted contribution month{summary.postedMonths === 1 ? "" : "s"}</strong><small>Missing or delayed rows are excluded from this calculation.</small></div></li>
          <li><span>!</span><div><strong>Purpose-specific facts are still required</strong><small>Cost, relationship, education, medical, frequency, and prior-withdrawal facts are not inferred.</small></div></li>
        </ul>
      </section>
      </DetailDisclosure>
      <DetailDisclosure summary="Compare common Form 31 purpose rules">
      <section className={styles.panel} aria-labelledby="advance-purpose-heading">
        <p className="utility-label">Common purpose comparison</p><h2 id="advance-purpose-heading">What this fictional record suggests</h2><p className={styles.panelIntro}>A green-looking calculation is not an approval. EPFO applies the relevant Scheme paragraph, service period, permitted frequency, available share, wage, purpose evidence, and payment-recipient rules.</p>
        <div className={styles.optionGrid}>
          {options.map((option) => <article className={styles.option} key={option.term}><p className="utility-label">{option.term}</p><h3>{option.title}</h3><p>{option.note}</p><dl><dt>Service condition</dt><dd>{option.condition}</dd><dt>Record result</dt><dd>{option.ready ? "Condition appears met" : "Condition not met or balance unavailable"}</dd><dt>Illustrative ceiling</dt><dd>{option.ready ? formatRupees(option.amount) : "Not calculated"}</dd></dl></article>)}
        </div>
      </section>
      </DetailDisclosure>
      <DetailDisclosure summary="View Form 31 prototype boundary">
      <section className={styles.boundary}><ShieldAlert aria-hidden="true" size={23} /><div><p className="utility-label">Prototype boundary</p><h2>No Form 31 claim is filed here</h2><p>The member must choose the correct purpose and complete the official online or offline claim. This calculation is not an entitlement, sanction, or payment instruction.</p></div><span>Walkthrough only</span></section>
      </DetailDisclosure>
      <p className={styles.sourceNote}><Info aria-hidden="true" size={14} /> Official terminology referenced: EPF Scheme, 1952 advance guidance and the Composite Claim Form / Form 31 online route.</p>
    </div>
  );
}
