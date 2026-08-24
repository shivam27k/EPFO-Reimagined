import { CalendarClock, IndianRupee, ShieldAlert, UserRoundCheck } from "lucide-react";
import Link from "next/link";

import { CompactFacts, DetailDisclosure, NextActionPanel, TaskPageHeader } from "@/components/ui/task-first";
import { formatRupees, postedContributionSummary } from "@/domain/service-readiness";
import { requireCurrentRun } from "@/server/auth/session";
import { getMemberSnapshot } from "@/server/repositories/member-repository";
import styles from "../services/services.module.css";

const WINDOW_START = "2025-08-01";
const WINDOW_END = "2027-07-31";

export default async function PmvbryPage() {
  const current = await requireCurrentRun();
  const snapshot = await getMemberSnapshot(current.demoRun.id);
  const summary = postedContributionSummary(snapshot);
  const firstEmployment = snapshot.employments
    .slice()
    .sort((left, right) => left.joinedAt.localeCompare(right.joinedAt))[0];
  const joinedInWindow = Boolean(
    firstEmployment && firstEmployment.joinedAt >= WINDOW_START && firstEmployment.joinedAt <= WINDOW_END,
  );
  const aadhaarVerified = snapshot.kyc.some(
    (record) => record.type === "AADHAAR" && record.status === "VERIFIED",
  );
  const firstTimerIndicated = snapshot.persona === "NEW_MEMBER";
  const reachedSixMonths = summary.consecutivePostedMonths >= 6;
  const reachedTwelveMonths = summary.consecutivePostedMonths >= 12;
  const checkpointComplete = firstTimerIndicated
    && joinedInWindow
    && snapshot.profile.onboardingComplete
    && aadhaarVerified
    && reachedSixMonths;
  const status = !firstTimerIndicated
    ? "Part A first-timer status is not indicated"
    : !firstEmployment
      ? "No employment start date is recorded"
      : !joinedInWindow
        ? "The recorded employment starts outside the Part A scheme window"
        : !snapshot.profile.onboardingComplete || !aadhaarVerified
          ? "UAN authentication and member setup are still pending"
          : !reachedSixMonths
            ? "Waiting for six consecutive paid ECR months"
            : "The six-month evidence checkpoint is reached in this prototype";
  const nextHref = !firstTimerIndicated
    ? "/services"
    : !firstEmployment || !joinedInWindow
      ? "/employment"
      : !snapshot.profile.onboardingComplete || !aadhaarVerified
        ? "/profile"
        : "/passbook";
  const nextLabel = !firstTimerIndicated
    ? "Choose another service"
    : !firstEmployment || !joinedInWindow
      ? "Review employment record"
      : !snapshot.profile.onboardingComplete || !aadhaarVerified
        ? "Review identity readiness"
        : "Review contribution months";

  return (
    <div className={styles.page}>
      <TaskPageHeader eyebrow="Understand benefits" title="Check first-timer benefit evidence" description="See the fictional Part A result before opening scheme checkpoints and prototype limits." officialTerm="Pradhan Mantri Viksit Bharat Rozgar Yojana · PMVBRY Part A" status={{ label: !firstTimerIndicated ? "Not indicated" : checkpointComplete ? "Six-month checkpoint reached" : !joinedInWindow ? "Window condition not met" : "Evidence building", tone: checkpointComplete ? "complete" : "attention" }} />
      <NextActionPanel eyebrow="Deterministic result" title={status} description="This preliminary result uses the seeded persona, recorded joining date, member setup, simulated Aadhaar status, and consecutive posted ECR months. Gross wage is not stored, so official eligibility is not assessed." owner={firstTimerIndicated ? "You, employer, and EPFO" : "No Part A action indicated"} tone={checkpointComplete ? "complete" : "attention"} action={<Link className="primary-action" href={nextHref}>{nextLabel}</Link>} />
      <CompactFacts items={[
        { label: "First-timer indication", value: firstTimerIndicated ? "Present" : "Not present", supporting: "Seeded demo persona only" },
        { label: "Joining window", value: joinedInWindow ? "In window" : "Not met", supporting: firstEmployment?.joinedAt ?? "No employment start date" },
        { label: "Consecutive ECR months", value: summary.consecutivePostedMonths, supporting: reachedSixMonths ? "Six-month sequence present" : `${Math.max(0, 6 - summary.consecutivePostedMonths)} more consecutive months needed` },
        { label: "Gross-wage test", value: "Not assessed", supporting: "Gross wage is not stored in this prototype" },
      ]} />

      <DetailDisclosure summary="View PMVBRY Part A condition checks">
      <section className={styles.decision} aria-labelledby="pmvbry-status-heading">
        <div className={styles.decisionLead}>
          <UserRoundCheck aria-hidden="true" size={24} />
          <p className="utility-label">Fictional Part A status</p>
          <h2 id="pmvbry-status-heading">{status}</h2>
          <strong>{summary.consecutivePostedMonths} consecutive posted contribution {summary.consecutivePostedMonths === 1 ? "month" : "months"}</strong>
          <p>Official eligibility depends on EPFO records, continuous ECR filing, gross wage, UAN authentication, and scheme rules—not this preview alone.</p>
        </div>
        <ul className={styles.checks}>
          <li><span>{firstTimerIndicated ? "✓" : "—"}</span><div><strong>First-time employee indication</strong><small>{firstTimerIndicated ? "This seeded persona starts without earlier EPF history." : "This seeded persona already has EPF history."}</small></div></li>
          <li><span>{joinedInWindow ? "✓" : "—"}</span><div><strong>Employment starts in the scheme window</strong><small>1 August 2025 to 31 July 2027 · recorded join date {firstEmployment?.joinedAt ?? "not available"}</small></div></li>
          <li><span>{aadhaarVerified ? "✓" : "—"}</span><div><strong>UAN authentication evidence</strong><small>{aadhaarVerified ? "Simulated UMANG Aadhaar Face Authentication return is recorded." : "Not recorded in this run."}</small></div></li>
          <li><span>?</span><div><strong>Gross wage at or below ₹1,00,000</strong><small>Not confirmed: gross wage is not stored in this prototype.</small></div></li>
        </ul>
      </section>
      </DetailDisclosure>

      <DetailDisclosure summary="View PMVBRY evidence checkpoints">
      <section className={styles.panel} aria-labelledby="pmvbry-timeline-heading">
        <p className="utility-label">Part A timeline</p>
        <h2 id="pmvbry-timeline-heading">Two evidence checkpoints, not an instant payment</h2>
        <div className={styles.optionGrid}>
          <article className={styles.option}><CalendarClock aria-hidden="true" size={21} /><p className="utility-label">Months 1–6</p><h3>Consecutive paid ECR record</h3><p>The first checkpoint follows six consecutive months of ECR and contribution evidence for an employment that starts inside the scheme window.</p><dl><dt>This run</dt><dd>{reachedSixMonths && joinedInWindow ? "Checkpoint sequence reached in fictional records" : !joinedInWindow ? "Joining-window condition not met" : `${Math.max(0, 6 - summary.consecutivePostedMonths)} more consecutive months needed for this preview`}</dd></dl></article>
          <article className={styles.option}><IndianRupee aria-hidden="true" size={21} /><p className="utility-label">First instalment</p><h3>Up to ₹7,500</h3><p>The overall Part A benefit is one completed month of EPF wage, capped at ₹15,000 and paid in two instalments. The first is capped at ₹7,500.</p><dl><dt>Latest inferred EPF wage</dt><dd>{summary.inferredMonthlyEpfWage ? formatRupees(summary.inferredMonthlyEpfWage) : "No posted wage evidence"}</dd><dt>Important</dt><dd>EPF wage is not the gross-wage eligibility test</dd></dl></article>
          <article className={styles.option}><CalendarClock aria-hidden="true" size={21} /><p className="utility-label">Month 12</p><h3>Second instalment</h3><p>The second checkpoint follows 12 months and also requires completion of the prescribed financial-literacy programme.</p><dl><dt>This run</dt><dd>{reachedTwelveMonths ? "12-month record reached; literacy evidence not stored" : "Not yet reached"}</dd></dl></article>
        </div>
      </section>
      </DetailDisclosure>

      <DetailDisclosure summary="View PMVBRY prototype boundary">
      <section className={styles.boundary}>
        <ShieldAlert aria-hidden="true" size={23} />
        <div><p className="utility-label">Prototype boundary</p><h2>No PMVBRY application or payment is created here</h2><p>Part A member benefits are processed from official EPFO and ECR records and paid by DBT to the Aadhaar-seeded bank account. Part B is an employer-side incentive and is information-only in this member portal.</p></div>
        <span>Preliminary guide only</span>
      </section>

      <div className={styles.actions}>
        <Link className={styles.nextLink} href="/passbook">Review contribution months</Link>
        <Link className={styles.nextLink} href="/profile">Review identity and bank status</Link>
      </div>
      <p className={styles.sourceNote}>All status values are calculated from fictional demo data as at 22 August 2026. They do not establish official scheme eligibility.</p>
      </DetailDisclosure>
    </div>
  );
}
