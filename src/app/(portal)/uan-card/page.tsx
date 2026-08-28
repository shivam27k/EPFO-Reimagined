import { PrintUanCardButton } from "@/components/member/print-uan-card-button";
import styles from "@/components/member/member-management.module.css";
import { CompactFacts, DetailDisclosure, NextActionPanel, TaskPageHeader } from "@/components/ui/task-first";
import { getCachedCurrentRun as requireCurrentRun } from "@/server/auth/session";
import { getCachedMemberSnapshot as getMemberSnapshot } from "@/server/repositories/member-repository";

export default async function UanCardPage() {
  const current = await requireCurrentRun();
  const snapshot = await getMemberSnapshot(current.demoRun.id);
  return (
    <div className={`${styles.page} task-first-stack`}>
      <TaskPageHeader
        eyebrow="My account"
        title="Masked UAN card"
        description="Review or print the fictional member identity saved in this demo run."
        officialTerm="Universal Account Number card"
        status={{ label: snapshot.profile.onboardingComplete ? "Profile set up" : "Setup in progress", tone: snapshot.profile.onboardingComplete ? "complete" : "active" }}
      />
      <NextActionPanel
        eyebrow="Available action"
        title="Print the masked demo card"
        description="This is not an official EPFO UAN card and cannot be used for employment, KYC, claims, or verification."
        owner="You"
        action={<PrintUanCardButton />}
      />
      <CompactFacts items={[
        { label: "Member", value: snapshot.profile.displayName },
        { label: "UAN", value: snapshot.profile.uanMasked },
        { label: "Account state", value: snapshot.profile.onboardingComplete ? "Profile set up — simulated" : "Member setup in progress" },
      ]} />
      <div className={styles.printDisclosure}>
        <DetailDisclosure summary="View printable UAN card" defaultOpen>
          <section className={styles.uanCard} aria-labelledby="uan-card-holder">
            <div className={styles.uanTop}><div><p className={styles.label}>Universal Account Number</p><strong>EPF Sahayak member card</strong></div><span className={styles.badge}>Fictional demo record</span></div>
            <p className={styles.uanNumber}>{snapshot.profile.uanMasked}</p>
            <dl className={styles.facts}><div><dt>Member name</dt><dd id="uan-card-holder">{snapshot.profile.displayName}</dd></div><div><dt>Date of birth</dt><dd>{snapshot.profile.dateOfBirth}</dd></div><div><dt>Mobile</dt><dd>{snapshot.profile.mobileMasked}</dd></div><div><dt>Account state</dt><dd>{snapshot.profile.onboardingComplete ? "Profile set up — simulated" : "Member setup in progress"}</dd></div></dl>
          </section>
        </DetailDisclosure>
      </div>
    </div>
  );
}
