import { ArrowRight, CheckCircle2, FileText, Info, ShieldAlert } from "lucide-react";
import Link from "next/link";

import { CompactFacts, DetailDisclosure, NextActionPanel, TaskPageHeader } from "@/components/ui/task-first";
import { requireCurrentRun } from "@/server/auth/session";
import { getMemberSnapshot } from "@/server/repositories/member-repository";

export default async function TransfersPage() {
  const current = await requireCurrentRun();
  const snapshot = await getMemberSnapshot(current.demoRun.id);
  const aadhaarVerified = snapshot.kyc.some((record) => record.type === "AADHAAR" && record.status === "VERIFIED");
  const previousEmployment = snapshot.employments.find((employment) => employment.exitedAt !== null) ?? snapshot.employments[0];
  const presentEmployment = snapshot.employments.find((employment) => employment !== previousEmployment);
  const hasExitDate = Boolean(previousEmployment?.exitedAt);
  const ready = aadhaarVerified && hasExitDate && Boolean(previousEmployment && presentEmployment);
  const readinessItems = [
    { label: "UAN is available", met: Boolean(snapshot.profile.uanMasked) },
    { label: "Aadhaar KYC is recorded", met: aadhaarVerified },
    { label: "Previous employment has a date of exit", met: hasExitDate },
    { label: "Previous and present Member IDs are linked", met: Boolean(previousEmployment && presentEmployment) },
  ];

  return (
    <div className="task-first-stack secondary-service-page">
      <TaskPageHeader eyebrow="Move service history" title="Bring past service into your current account" description="See the transfer-readiness result before opening employment records and official terminology." officialTerm="Transfer claim · Form 13 / auto-transfer" status={{ label: ready ? "Core records present" : "More information needed", tone: ready ? "complete" : "attention" }} />
      <NextActionPanel eyebrow="Deterministic result" title={ready ? "Core records are present for an official transfer review" : "The transfer record is not ready for review"} description={ready ? "The fictional identity, exit date, and linked Member IDs support a walkthrough. This does not prove official eligibility or submit a transfer." : "At least one core identity, exit-date, or linked-employment check is missing. Review the employment record first."} owner={ready ? "You and EPFO" : "You, employer, or Aadhaar"} tone={ready ? "complete" : "attention"} action={<Link className="primary-action" href={ready ? "/transfers/annexure-k" : "/employment"}>{ready ? "Check Annexure K status" : "Review employment records"}</Link>} />
      <CompactFacts items={[
        { label: "Aadhaar KYC", value: aadhaarVerified ? "Recorded" : "Not recorded", supporting: "Simulated verification state" },
        { label: "Previous exit date", value: hasExitDate ? "Recorded" : "Missing", supporting: previousEmployment?.exitedAt ?? "No exit date available" },
        { label: "Linked Member IDs", value: previousEmployment && presentEmployment ? "Pair found" : "Pair incomplete", supporting: "Previous and present employment records" },
      ]} />
      <DetailDisclosure summary="View transfer readiness checks">
      <section className="service-status-board" aria-labelledby="transfer-readiness-heading">
        <div className="service-status-lead" data-ready={ready}>
          {ready ? <CheckCircle2 aria-hidden="true" size={22} /> : <ShieldAlert aria-hidden="true" size={22} />}
          <p className="utility-label">Current readiness</p>
          <h2 id="transfer-readiness-heading">{ready ? "Ready to review on Member e-Sewa" : "More information is needed"}</h2>
          <p>{ready ? "The core records required for a transfer walkthrough are present." : "The checks alongside show exactly what prevents a transfer from being prepared."}</p>
        </div>
        <ul className="readiness-checklist">
          {readinessItems.map((item) => <li data-met={item.met} key={item.label}><span aria-hidden="true">{item.met ? "✓" : "—"}</span><div><strong>{item.label}</strong><small>{item.met ? "On record" : "Not available"}</small></div></li>)}
        </ul>
      </section>
      </DetailDisclosure>

      <DetailDisclosure assistantTarget="transfers.records" summary="View employment records for transfer">
      <section className="service-section" aria-labelledby="transfer-employment-heading">
        <div className="section-heading-row"><div><p className="utility-label">Employment selection</p><h2 id="transfer-employment-heading">Choose the record to transfer from</h2></div><span>Walkthrough only</span></div>
        <p className="section-intro">The current EPFO flow asks a member to identify previous and present employment. This readable preview uses only masked fictional records.</p>
        {snapshot.employments.length ? (
          <fieldset className="employment-selector">
            <legend>Previous employment</legend>
            {snapshot.employments.map((employment, index) => <label key={employment.employmentKey}><input defaultChecked={index === 0} name="transfer-employment" type="radio" /><span><strong>{employment.establishmentName}</strong><small>{employment.memberIdMasked} · Joined {employment.joinedAt} · Exit {employment.exitedAt ?? "not recorded"}</small></span></label>)}
          </fieldset>
        ) : <div className="empty-register"><p>No linked employment is available yet.</p><span>Employment appears here after the new-member setup and simulated employer handoff.</span></div>}
        <div className="present-employment-row"><span>Present employment</span><strong>{presentEmployment?.establishmentName ?? "No separate present Member ID in this demo run"}</strong></div>
      </section>
      </DetailDisclosure>

      <DetailDisclosure summary="Understand Annexure K">
      <section className="annexure-explainer" aria-labelledby="annexure-k-heading">
        <FileText aria-hidden="true" size={24} />
        <div><p className="utility-label">Plain-language document guide</p><h2 id="annexure-k-heading">What is Annexure K?</h2><p>It is the transfer record used by the EPFO field office or an exempted trust. It carries member details, PF accumulation with interest, service history, dates of joining and exit, and the previous and present Member IDs so the transfer can be credited correctly.</p><p><Info aria-hidden="true" size={16} /> Members normally track an online transfer under <strong>Online Services → Track Claim Status</strong> in Member e-Sewa. Annexure K handling may involve the field office or exempted trust.</p></div>
      </section>
      </DetailDisclosure>

      <DetailDisclosure summary="View transfer prototype boundary">
      <section className="prototype-boundary" aria-labelledby="transfer-boundary-heading"><div><p className="utility-label">Prototype boundary</p><h2 id="transfer-boundary-heading">Transfer submission is not included in this demo</h2><p>No request will be sent to an employer, trust, or EPFO office. This page demonstrates a clearer readiness and record-selection experience only.</p></div><span className="boundary-state">Not included in this demo</span></section>
      </DetailDisclosure>
      <nav className="service-next-links" aria-label="Transfer next steps"><Link href="/employment">Correct employment information <ArrowRight aria-hidden="true" size={16} /></Link><Link href="/help">View transfer help <ArrowRight aria-hidden="true" size={16} /></Link></nav>
    </div>
  );
}
