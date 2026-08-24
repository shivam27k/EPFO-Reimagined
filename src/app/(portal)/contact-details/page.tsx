import { AtSign, Info, Smartphone } from "lucide-react";
import Link from "next/link";

import { MemberRequestAction } from "@/components/member/member-request-action";
import styles from "@/components/member/member-management.module.css";
import { CompactFacts, DetailDisclosure, NextActionPanel, TaskPageHeader } from "@/components/ui/task-first";
import { requireCurrentRun } from "@/server/auth/session";
import { getMemberSnapshot } from "@/server/repositories/member-repository";
import { getMemberRequests } from "@/server/services/member-request-service";

export default async function ContactDetailsPage() {
  const current = await requireCurrentRun();
  const [snapshot, requests] = await Promise.all([getMemberSnapshot(current.demoRun.id), getMemberRequests(current.demoRun.id)]);
  const request = requests.find((item) => item.type === "CONTACT_MOBILE_UPDATE");
  const stage = request?.status ?? "NOT_STARTED";
  const stageLabel = stage.replaceAll("_", " ").toLowerCase();

  return (
    <div className={`${styles.page} task-first-stack`}>
      <TaskPageHeader
        eyebrow="My account"
        title="Contact details"
        description="Review your masked contact and the status of a simulated update request."
        officialTerm="Member mobile-number update"
        status={{ label: stage === "NOT_STARTED" ? "No request" : stageLabel, tone: stage === "RESOLVED" ? "complete" : stage === "NOT_STARTED" ? "neutral" : "active" }}
      />
      <NextActionPanel
        eyebrow="Recommended next action"
        title={stage === "RESOLVED" ? "Mobile update simulation complete" : stage === "NOT_STARTED" ? "Start a simulated mobile update" : "Continue the mobile update request"}
        description="The demo records only the request stage. It never asks for a real replacement number or OTP."
        owner={stage === "NOT_STARTED" ? "You" : "EPFO · simulated"}
        tone={stage === "RESOLVED" ? "complete" : "active"}
        action={<MemberRequestAction type="CONTACT_MOBILE_UPDATE" status={request?.status} labels={{ open: "Start simulated mobile update", advance: "Simulate identity review", resolve: "Simulate update complete", resolved: "Simulated update complete" }} />}
        secondaryAction={<Link className="portal-action-link" href="/profile">Return to profile</Link>}
      />
      <CompactFacts items={[
        { label: "Saved mobile", value: snapshot.profile.mobileMasked },
        { label: "Request state", value: stageLabel },
        { label: "Last update", value: request?.resolvedAt ?? request?.createdAt ?? "No request recorded", supporting: "Stored only in this demo run" },
      ]} />
      <div className={styles.disclosureStack}>
        <DetailDisclosure summary="View saved contact record">
          <dl className={styles.facts}><div><dt>Name</dt><dd>{snapshot.profile.displayName}</dd></div><div><dt>Mobile</dt><dd>{snapshot.profile.mobileMasked}</dd></div><div><dt>Email</dt><dd>Not stored in this prototype</dd></div></dl>
        </DetailDisclosure>
        <DetailDisclosure summary="View update-process safeguards">
          <div className={styles.securityRows}><div><Smartphone aria-hidden="true" size={20} /><div><strong>Masked destination only</strong><span>No replacement number is collected.</span></div></div><div><AtSign aria-hidden="true" size={20} /><div><strong>Email remains unchanged</strong><span>This prototype has no email record to overwrite.</span></div></div></div>
        </DetailDisclosure>
      </div>
      <div className={styles.disclosure}><Info aria-hidden="true" size={20} /><p>Request state persists only inside this isolated demo session and resets on logout or Reset Demo.</p></div>
    </div>
  );
}
