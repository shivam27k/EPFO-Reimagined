import { Clock3, KeyRound, LockKeyhole, ShieldCheck } from "lucide-react";

import { MemberRequestAction } from "@/components/member/member-request-action";
import styles from "@/components/member/member-management.module.css";
import { LogoutButton } from "@/components/portal/side-navigation";
import { CompactFacts, DetailDisclosure, NextActionPanel, TaskPageHeader } from "@/components/ui/task-first";
import { getCachedCurrentRun as requireCurrentRun } from "@/server/auth/session";
import { getMemberRequests } from "@/server/services/member-request-service";

export default async function SecurityPage() {
  const current = await requireCurrentRun();
  const requests = await getMemberRequests(current.demoRun.id);
  const request = requests.find((item) => item.type === "SECURITY_REVIEW");
  const stage = request?.status ?? "NOT_STARTED";
  const stageLabel = stage.replaceAll("_", " ").toLowerCase();
  const expiresAt = new Date(current.session.expiresAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

  return (
    <div className={`${styles.page} task-first-stack`}>
      <TaskPageHeader
        eyebrow="My account"
        title="Account security"
        description="Review this isolated session, practice a security-status flow, or log out when finished."
        status={{ label: stage === "NOT_STARTED" ? "Session active" : stageLabel, tone: stage === "RESOLVED" ? "complete" : "active" }}
      />
      <NextActionPanel
        eyebrow="Recommended next action"
        title={stage === "RESOLVED" ? "Security review simulation complete" : stage === "NOT_STARTED" ? "Start a simulated security review" : "Continue the simulated security review"}
        description="No real password, OTP, Aadhaar number, or device fingerprint is requested or stored."
        owner={stage === "NOT_STARTED" ? "You" : "EPFO · simulated"}
        tone={stage === "RESOLVED" ? "complete" : "active"}
        action={<MemberRequestAction type="SECURITY_REVIEW" status={request?.status} labels={{ open: "Start simulated security review", advance: "Simulate review in progress", resolve: "Mark simulated review complete", resolved: "Simulated review complete" }} />}
      />
      <CompactFacts items={[
        { label: "Session state", value: "Signed in securely" },
        { label: "Expires", value: expiresAt },
        { label: "Review state", value: stageLabel, supporting: request?.createdAt ? `Started ${request.createdAt}` : "No review requested" },
      ]} />

      <div className={styles.disclosureStack}>
        <DetailDisclosure summary="View session safeguards">
          <div className={styles.securityRows}><div><ShieldCheck aria-hidden="true" size={20} /><div><strong>HTTP-only session</strong><span>The browser cannot read the opaque session cookie.</span></div></div><div><Clock3 aria-hidden="true" size={20} /><div><strong>Automatic expiry</strong><span>This demo session expires by {expiresAt}.</span></div></div><div><LockKeyhole aria-hidden="true" size={20} /><div><strong>Isolated demo run</strong><span>Another judge using the same credentials receives separate mutable data.</span></div></div></div>
        </DetailDisclosure>
        <DetailDisclosure summary="View security-review boundary">
          <div className={styles.securityRows}><div><KeyRound aria-hidden="true" size={20} /><div><strong>Fictional credential check</strong><span>The simulation uses only the shared demo credential and records request status, not a password.</span></div></div></div>
        </DetailDisclosure>
      </div>

      <section className={styles.dangerNote} aria-labelledby="logout-security-heading"><h2 id="logout-security-heading">Finished on this device?</h2><p>Logging out disposes the current demo run. Signing in again creates a fresh copy of the selected member scenario.</p><LogoutButton /></section>
    </div>
  );
}
