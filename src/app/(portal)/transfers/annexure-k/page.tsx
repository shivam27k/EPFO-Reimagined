import { FileDown, FileText, Info, ShieldAlert } from "lucide-react";
import Link from "next/link";

import { PrintStatusAction } from "@/components/services/print-status-action";
import { CompactFacts, DetailDisclosure, NextActionPanel, TaskPageHeader } from "@/components/ui/task-first";
import { requireCurrentRun } from "@/server/auth/session";
import { getMemberSnapshot } from "@/server/repositories/member-repository";
import styles from "../../services/services.module.css";

export default async function AnnexureKPage() {
  const current = await requireCurrentRun();
  const snapshot = await getMemberSnapshot(current.demoRun.id);
  const previousEmployment = snapshot.employments.find((employment) => employment.exitedAt !== null);
  const presentEmployment = snapshot.employments.find(
    (employment) => employment.employmentKey !== previousEmployment?.employmentKey,
  );
  const hasTransferPair = Boolean(previousEmployment && presentEmployment);

  return (
    <div className={styles.page}>
      <TaskPageHeader eyebrow="Move service history" title="Check your transfer record" description="See the download result first, then review what Annexure K contains and where it comes from." officialTerm="Transfer Certificate · Annexure K" status={{ label: "Official download unavailable", tone: "attention" }} />
      <NextActionPanel eyebrow="Deterministic result" title="No completed transfer is recorded in this demo run" description="An employment pair can support a walkthrough, but this prototype does not store a completed EPFO transfer and cannot offer an official Annexure K download." owner="EPFO or exempted trust" tone="attention" action={<Link className="primary-action" href="/transfers">Review transfer readiness</Link>} />
      <CompactFacts items={[
        { label: "Previous Member ID", value: previousEmployment?.memberIdMasked ?? "Not available", supporting: "Fictional masked record" },
        { label: "Present Member ID", value: presentEmployment?.memberIdMasked ?? "Not available", supporting: "Fictional masked record" },
        { label: "Completed transfer", value: "Not recorded", supporting: hasTransferPair ? "Employment pair found" : "Transfer pair incomplete" },
      ]} />

      <DetailDisclosure summary="View Annexure K status checks">
      <section className={styles.decision} aria-labelledby="annexure-status-heading">
        <div className={styles.decisionLead}>
          <FileText aria-hidden="true" size={24} />
          <p className="utility-label">Download status</p>
          <h2 id="annexure-status-heading">No completed transfer is recorded in this demo run</h2>
          <strong>{hasTransferPair ? "Employment pair found" : "Transfer pair incomplete"}</strong>
          <p>Two employment records can support a transfer walkthrough, but they do not prove that EPFO has completed a transfer or issued Annexure K.</p>
        </div>
        <ul className={styles.checks}>
          <li><span>{previousEmployment ? "✓" : "—"}</span><div><strong>Previous Member ID</strong><small>{previousEmployment?.memberIdMasked ?? "Not available in this run"}</small></div></li>
          <li><span>{presentEmployment ? "✓" : "—"}</span><div><strong>Present Member ID</strong><small>{presentEmployment?.memberIdMasked ?? "Not available in this run"}</small></div></li>
          <li><span>—</span><div><strong>Completed transfer record</strong><small>Not stored by this prototype, so an official Annexure K download cannot be offered.</small></div></li>
        </ul>
      </section>
      </DetailDisclosure>

      <DetailDisclosure summary="View the records Annexure K contains">
      <section className={styles.panel} aria-labelledby="annexure-contents-heading">
        <p className="utility-label">What the document contains</p>
        <h2 id="annexure-contents-heading">The bridge between the old and new account records</h2>
        <p className={styles.panelIntro}>An official Annexure K may include member details, PF accumulations and interest, service history, dates of joining and exit, and previous and present Member IDs. The receiving field office or exempted trust uses those details to account for the transfer.</p>
        <table className={styles.recordTable}>
          <thead><tr><th>Fictional record</th><th>Masked value</th><th>Why it matters</th></tr></thead>
          <tbody>
            <tr><td>Member</td><td>{snapshot.profile.displayName}</td><td>Matches the transfer to the member record.</td></tr>
            <tr><td>UAN</td><td>{snapshot.profile.uanMasked}</td><td>Connects linked Member IDs under the same account.</td></tr>
            <tr><td>Previous employment</td><td>{previousEmployment?.memberIdMasked ?? "Not recorded"}</td><td>Identifies the source service and accumulation.</td></tr>
            <tr><td>Present employment</td><td>{presentEmployment?.memberIdMasked ?? "Not recorded"}</td><td>Identifies where the transfer is to be credited.</td></tr>
          </tbody>
        </table>
      </section>
      </DetailDisclosure>

      <DetailDisclosure summary="View official route and prototype boundary">
      <section className={styles.boundary}>
        <ShieldAlert aria-hidden="true" size={23} />
        <div><p className="utility-label">Official route and prototype boundary</p><h2>Download only after an official transfer record exists</h2><p>In Member e-Sewa, use <strong>Online Services → Track Claim Status → Download Annexure K</strong> when the official transfer record makes it available. Printing here creates only a local copy of this fictional status page.</p></div>
        <span>Not an official document</span>
      </section>

      <div className={styles.actions}>
        <PrintStatusAction label="Print fictional status" />
        <Link className={styles.nextLink} href="/transfers"><Info aria-hidden="true" size={16} /> Review transfer readiness</Link>
        <Link className={styles.nextLink} href="/services"><FileDown aria-hidden="true" size={16} /> Return to services</Link>
      </div>
      <p className={styles.sourceNote}>All names, identifiers, employers, and status details shown here are fictional. No EPFO, employer, trust, or bank system is contacted.</p>
      </DetailDisclosure>
    </div>
  );
}
