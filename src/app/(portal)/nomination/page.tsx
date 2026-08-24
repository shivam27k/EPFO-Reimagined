import { Check, FileSignature, Info, UsersRound } from "lucide-react";
import Link from "next/link";

import { CompactFacts, DetailDisclosure, NextActionPanel, TaskPageHeader } from "@/components/ui/task-first";
import { requireCurrentRun } from "@/server/auth/session";
import { getMemberSnapshot } from "@/server/repositories/member-repository";

export default async function NominationPage() {
  const current = await requireCurrentRun();
  const snapshot = await getMemberSnapshot(current.demoRun.id);
  const aadhaarReady = snapshot.kyc.some((record) => record.type === "AADHAAR" && record.status === "VERIFIED");

  return (
    <div className="task-first-stack secondary-service-page">
      <TaskPageHeader eyebrow="Protect family" title="Prepare a family nomination" description="Check the stored readiness result before reviewing family allocation and the official e-sign requirement." officialTerm="e-Nomination · Form 2 and Aadhaar e-sign" status={{ label: "Not started", tone: "attention" }} />
      <NextActionPanel eyebrow="Deterministic result" title="No nomination is saved in this prototype" description={aadhaarReady ? "Aadhaar is recorded as verified in this simulation, but the legal nomination must still be created and e-signed in the official member service." : "Aadhaar verification is not complete in this run. The official journey also requires family details, a 100% allocation, and Aadhaar-based e-sign."} owner="You" tone="attention" action={<Link className="primary-action" href="/profile">Review profile readiness</Link>} />
      <CompactFacts items={[
        { label: "Aadhaar readiness", value: aadhaarReady ? "Recorded as verified" : "Not complete", supporting: "Simulated status, not a live UIDAI result" },
        { label: "Saved nominees", value: "None", supporting: "Walkthrough data is never saved" },
        { label: "Official e-sign", value: "Required", supporting: "Not available in this prototype" },
      ]} />
      <DetailDisclosure summary="View nomination status details">
      <section className="nomination-status" aria-labelledby="nomination-status-heading">
        <div><p className="utility-label">Nomination status</p><h2 id="nomination-status-heading">Not started in this prototype</h2><p>The official member portal remains the place to file and e-sign an e-nomination. Here you can see the information structure without creating a legal nomination.</p></div>
        <dl><div><dt>Member</dt><dd>{snapshot.profile.displayName}</dd></div><div><dt>Aadhaar readiness</dt><dd>{aadhaarReady ? "Recorded as verified — simulated" : "Verification not complete"}</dd></div><div><dt>Saved nominees</dt><dd>None — walkthrough data is not saved</dd></div></dl>
      </section>
      </DetailDisclosure>

      <DetailDisclosure summary="View fictional family allocation example">
      <section className="service-section" aria-labelledby="family-example-heading">
        <div className="section-heading-row"><div><p className="utility-label">Fictional example</p><h2 id="family-example-heading">How a family summary could read</h2></div><span>Example only</span></div>
        <p className="section-intro">These people are invented for demonstration and are not connected to this member account.</p>
        <div className="family-summary"><article><UsersRound aria-hidden="true" size={20} /><div><strong>Meera Joshi</strong><span>Spouse · Fictional example</span></div><b>60%</b></article><article><UsersRound aria-hidden="true" size={20} /><div><strong>Vihaan Joshi</strong><span>Child · Fictional example</span></div><b>40%</b></article><div className="allocation-total"><span>Total allocation</span><strong>100%</strong></div></div>
      </section>
      </DetailDisclosure>

      <DetailDisclosure summary="View official e-Nomination journey steps">
      <section className="walkthrough-steps" aria-labelledby="nomination-walkthrough-heading">
        <div><p className="utility-label">Non-submitting walkthrough</p><h2 id="nomination-walkthrough-heading">What the official journey requires</h2></div>
        <ol><li><span><Check aria-hidden="true" size={16} /></span><div><strong>Review family details</strong><p>Add eligible family members and their relationship details.</p></div></li><li><span>2</span><div><strong>Allocate the share</strong><p>Nominee shares must add up to 100% for the relevant benefit.</p></div></li><li><span>3</span><div><strong>Complete Aadhaar-based e-sign</strong><p>EPFO requires the member to e-sign the e-nomination using Aadhaar. This prototype never requests Aadhaar or OTP data.</p></div></li></ol>
      </section>
      </DetailDisclosure>

      <section className="esign-note" aria-labelledby="esign-heading"><FileSignature aria-hidden="true" size={24} /><div><p className="utility-label">Required official step</p><h2 id="esign-heading">A nomination is not complete until e-sign</h2><p><Info aria-hidden="true" size={16} /> Reviewing this walkthrough does not create, register, or change a nomination. Use the official EPFO member service for the legal process.</p></div><span className="boundary-state">View prototype explanation</span></section>
      <DetailDisclosure summary="View nomination prototype boundary">
        <p>No family record, nominee allocation, Aadhaar detail, OTP, or legal declaration is saved or sent. This page does not create, register, or change a nomination.</p>
      </DetailDisclosure>
    </div>
  );
}
