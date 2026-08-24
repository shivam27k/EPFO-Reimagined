import Link from "next/link";

import styles from "@/components/member/member-management.module.css";
import { BankCorrectionAction } from "@/components/profile/bank-correction-action";
import {
  DetailDisclosure,
  NextActionPanel,
  TaskPageHeader,
  type TaskTone,
} from "@/components/ui/task-first";
import type { Finding } from "@/domain/types";
import { requireCurrentRun } from "@/server/auth/session";
import { getMemberSnapshot } from "@/server/repositories/member-repository";

const kycFindingCodes = new Set([
  "BANK_NAME_MISMATCH",
  "PAN_NAME_MISMATCH",
  "BANK_NOT_VERIFIED",
  "PENDING_BANK_CHANGE",
  "IDENTITY_NOT_ACTIVATED",
]);

const severityOrder: Record<Finding["severity"], number> = {
  BLOCKER: 0,
  WARNING: 1,
  INFO: 2,
};

const compactKycStatus = {
  NOT_STARTED: "Not started",
  PENDING: "Pending",
  VERIFIED: "Verified",
  MISMATCH: "Needs correction",
} as const;

function actionForFinding(finding: Finding, persona: "NEW_MEMBER" | "EXISTING_MEMBER") {
  if (finding.code === "BANK_NAME_MISMATCH" && persona === "EXISTING_MEMBER") {
    return <BankCorrectionAction />;
  }
  if (persona === "NEW_MEMBER") {
    return <Link className="primary-action" href="/onboarding">Correct demo KYC details</Link>;
  }
  return <Link className="primary-action" href="#kyc-records">Review the KYC record</Link>;
}

export default async function ProfilePage() {
  const current = await requireCurrentRun();
  const snapshot = await getMemberSnapshot(current.demoRun.id);
  const kycFindings = snapshot.findings
    .filter((finding) => kycFindingCodes.has(finding.code))
    .sort((left, right) => severityOrder[left.severity] - severityOrder[right.severity]);
  const leadFinding = kycFindings[0];
  const verifiedKyc = snapshot.kyc.filter((record) => record.status === "VERIFIED").length;
  const allKycReady = snapshot.kyc.length > 0 && verifiedKyc === snapshot.kyc.length;
  const tone: TaskTone = leadFinding?.severity === "BLOCKER"
    ? "blocked"
    : leadFinding
      ? "attention"
      : allKycReady
        ? "complete"
        : "active";
  const nextTitle = leadFinding?.title
    ?? (snapshot.profile.onboardingComplete ? "Your KYC record is ready" : "Finish profile setup");
  const nextDescription = leadFinding?.explanation
    ?? (allKycReady
      ? "The three fictional KYC records are marked verified in this demo."
      : "Complete the remaining fictional identity and bank checks before assessing claims.");
  const nextAction = leadFinding
    ? actionForFinding(leadFinding, snapshot.persona)
    : snapshot.persona === "NEW_MEMBER" && !snapshot.profile.onboardingComplete
      ? <Link className="primary-action" href="/onboarding">Continue profile setup</Link>
      : <Link className="primary-action" href="/claims">Review claim readiness</Link>;

  return (
    <div className={`${styles.page} task-first-stack profile-page`}>
      <TaskPageHeader
        eyebrow="My account"
        title="Profile and KYC readiness"
        description="Start with the identity or bank item that needs attention. Open the full record only when needed."
        officialTerm="Member profile and Manage > KYC"
        status={{
          label: leadFinding ? "Action needed" : allKycReady ? "KYC ready" : "Setup in progress",
          tone,
        }}
      />

      <NextActionPanel
        eyebrow="Recommended next action"
        title={nextTitle}
        description={nextDescription}
        owner={leadFinding ? (leadFinding.owner === "MEMBER" ? "You" : leadFinding.owner[0] + leadFinding.owner.slice(1).toLowerCase()) : "You"}
        tone={tone}
        action={nextAction}
      />

      <section className={styles.profileSummary} aria-label="Member profile summary">
        <dl className={styles.profileIdentity}>
          <div>
            <dt>Member name</dt>
            <dd>{snapshot.profile.displayName}</dd>
          </div>
          <div>
            <dt>UAN</dt>
            <dd>{snapshot.profile.uanMasked}</dd>
          </div>
          <div>
            <dt>Mobile</dt>
            <dd>{snapshot.profile.mobileMasked}</dd>
          </div>
        </dl>

        <div className={styles.kycSummary} data-ready={allKycReady}>
          <div className={styles.kycSummaryHeading}>
            <span>KYC readiness</span>
            <strong>{verifiedKyc} of {snapshot.kyc.length} verified</strong>
          </div>
          <ul aria-label="KYC verification status">
            {snapshot.kyc.map((record) => (
              <li data-status={record.status.toLowerCase()} key={record.type}>
                <span>{record.type === "AADHAAR" ? "Aadhaar" : record.type === "BANK" ? "Bank" : "PAN"}</span>
                <small>{compactKycStatus[record.status]}</small>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <div className={styles.disclosure}>
        <p>All identifiers and KYC statuses on this page are fictional. They are not live EPFO, Aadhaar, PAN, employer, or bank confirmations.</p>
      </div>

      <div className={styles.disclosureStack}>
        <DetailDisclosure summary="View full identity record">
          <dl className={styles.facts}>
            <div><dt>Name</dt><dd>{snapshot.profile.aadhaarName}</dd></div>
            <div><dt>UAN</dt><dd>{snapshot.profile.uanMasked}</dd></div>
            <div><dt>Date of birth</dt><dd>{snapshot.profile.dateOfBirth}</dd></div>
            <div><dt>Mobile</dt><dd>{snapshot.profile.mobileMasked}</dd></div>
            <div><dt>Profile state</dt><dd>{snapshot.profile.onboardingComplete ? "Setup complete" : "Setup in progress"}</dd></div>
          </dl>
        </DetailDisclosure>

        <div id="kyc-records">
          <DetailDisclosure summary="View individual KYC records" defaultOpen={Boolean(leadFinding)}>
            <div className={styles.kycRegister}>
              {snapshot.kyc.map((record) => (
                <article data-status={record.status.toLowerCase()} key={record.type}>
                  <span>{record.type}</span>
                  <strong>{record.valueMasked}</strong>
                  <small>{record.statusLabel ?? record.status.replaceAll("_", " ").toLowerCase()}</small>
                </article>
              ))}
            </div>
          </DetailDisclosure>
        </div>

        <DetailDisclosure summary="View profile and account tools">
          <nav className={styles.toolGrid} aria-label="Member account tools">
            <Link href="/uan-card"><strong>UAN card</strong><span>View and print a masked demo card.</span></Link>
            <Link href="/contact-details"><strong>Contact details</strong><span>Review mobile and update-request status.</span></Link>
            <Link href="/basic-details"><strong>Basic details</strong><span>Understand name and date-of-birth corrections.</span></Link>
            <Link href="/security"><strong>Account security</strong><span>Review session safety and log out securely.</span></Link>
          </nav>
        </DetailDisclosure>
      </div>
    </div>
  );
}
