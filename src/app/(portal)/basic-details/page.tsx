import { FilePenLine, Info } from "lucide-react";
import Link from "next/link";

import { MemberRequestAction } from "@/components/member/member-request-action";
import styles from "@/components/member/member-management.module.css";
import { CompactFacts, DetailDisclosure, NextActionPanel, TaskPageHeader } from "@/components/ui/task-first";
import { requireCurrentRun } from "@/server/auth/session";
import { getMemberSnapshot } from "@/server/repositories/member-repository";
import { getMemberRequests, type MemberRequestType } from "@/server/services/member-request-service";

export default async function BasicDetailsPage({ searchParams }: { searchParams: Promise<{ field?: string }> }) {
  const current = await requireCurrentRun();
  const [snapshot, requests, params] = await Promise.all([getMemberSnapshot(current.demoRun.id), getMemberRequests(current.demoRun.id), searchParams]);
  const selected = params.field === "dob" ? "dob" : "name";
  const requestType: MemberRequestType = selected === "dob" ? "BASIC_DETAILS_CORRECTION_DOB" : "BASIC_DETAILS_CORRECTION_NAME";
  const request = requests.find((item) => item.type === requestType);
  const stage = request?.status ?? "NOT_STARTED";
  const stageLabel = stage.replaceAll("_", " ").toLowerCase();
  const correctionLabel = selected === "name" ? "Name correction" : "Date-of-birth correction";

  return (
    <div className={`${styles.page} task-first-stack`}>
      <TaskPageHeader
        eyebrow="My account"
        title="Basic details correction"
        description="Follow one persisted simulated correction request without entering a replacement value or identity document."
        officialTerm="Member profile correction"
        status={{ label: stage === "NOT_STARTED" ? "No request" : stageLabel, tone: stage === "RESOLVED" ? "complete" : stage === "NOT_STARTED" ? "neutral" : "active" }}
      />
      <NextActionPanel
        eyebrow="Recommended next action"
        title={stage === "RESOLVED" ? `${correctionLabel} simulation complete` : stage === "NOT_STARTED" ? `Start a ${correctionLabel.toLowerCase()} request` : `Continue the ${correctionLabel.toLowerCase()} request`}
        description="The demo records request status only. EPFO review, evidence and legal identity changes happen outside this prototype."
        owner={stage === "NOT_STARTED" ? "You" : "EPFO · simulated"}
        tone={stage === "RESOLVED" ? "complete" : "active"}
        action={<MemberRequestAction type={requestType} status={request?.status} labels={{ open: "Create simulated correction request", advance: "Simulate EPFO review", resolve: "Simulate correction complete", resolved: "Simulated correction complete" }} />}
        secondaryAction={<Link className="portal-action-link" href="/profile">Return to profile</Link>}
      />
      <CompactFacts items={[
        { label: "Selected detail", value: correctionLabel },
        { label: "Responsible", value: stage === "NOT_STARTED" ? "You" : "EPFO · simulated" },
        { label: "Last update", value: request?.resolvedAt ?? request?.createdAt ?? "No request recorded", supporting: `Current state: ${stageLabel}` },
      ]} />

      <div className={styles.disclosure}><Info aria-hidden="true" size={20} /><p>Current EPFO correction routes may require member submission, evidence, employer involvement, and EPFO approval. This prototype demonstrates status clarity, not the legal correction itself.</p></div>

      <div className={styles.disclosureStack}>
        <DetailDisclosure summary="View current basic-details record">
          <dl className={styles.facts}><div><dt>Name</dt><dd>{snapshot.profile.aadhaarName}</dd></div><div><dt>Date of birth</dt><dd>{snapshot.profile.dateOfBirth}</dd></div><div><dt>UAN</dt><dd>{snapshot.profile.uanMasked}</dd></div></dl>
        </DetailDisclosure>
        <DetailDisclosure summary="View correction status progression">
          <div className={styles.statusCard}>
            <div className={styles.statusHeading}><div><p className={styles.label}>Request status</p><h2>{correctionLabel}</h2></div><span data-resolved={stage === "RESOLVED"}>{stageLabel}</span></div>
            <ol className={styles.steps}><li data-active={stage === "NOT_STARTED"}><span>Member</span><strong>Prepare request</strong><p>No replacement value or document is collected in this demo.</p></li><li data-active={stage === "OPEN" || stage === "IN_PROGRESS"}><span>EPFO · simulated</span><strong>Review details</strong><p>The request remains visible while the responsible office reviews it.</p></li><li data-active={stage === "RESOLVED"}><span>Record</span><strong>Correction complete</strong><p>The demo marks the request resolved without changing legal identity data.</p></li></ol>
          </div>
        </DetailDisclosure>
        <DetailDisclosure summary="Choose a different detail to correct">
          <div className={styles.choiceList} aria-label="Choose a detail to correct"><Link aria-current={selected === "name" ? "page" : undefined} href="/basic-details?field=name"><strong>Name correction</strong><span>Simulate a joint/basic-details correction review.</span></Link><Link aria-current={selected === "dob" ? "page" : undefined} href="/basic-details?field=dob"><strong>Date-of-birth correction</strong><span>Simulate review of a date-of-birth correction request.</span></Link></div>
        </DetailDisclosure>
      </div>
      <div className={styles.recordMarker}><FilePenLine aria-hidden="true" size={20} /><span>Correction activity stays in this isolated demo session.</span></div>
    </div>
  );
}
