import { ExternalLink, MessageSquareWarning, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { CompactFacts, NextActionPanel, TaskPageHeader } from "@/components/ui/task-first";
import { requireCurrentRun } from "@/server/auth/session";
import { getCachedMemberSnapshot } from "@/server/repositories/member-repository";
import { HelpTopics } from "./help-topics";

const ownerByRoute: Record<string, string> = {
  "/onboarding": "You",
  "/employment": "Previous employer",
  "/profile": "You and your bank",
  "/passbook": "Employer",
  "/claims": "You and EPFO",
};

function formatUpdate(value: string | undefined) {
  if (!value) return "Starting demo state";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

export default async function HelpPage() {
  const current = await requireCurrentRun();
  const snapshot = await getCachedMemberSnapshot(current.demoRun.id);
  const blockers = snapshot.findings.filter((finding) => finding.severity === "BLOCKER");
  const owner = ownerByRoute[snapshot.nextAction.href] ?? "You";
  const latestUpdate = snapshot.scenarioRuns[0]?.updatedAt ?? snapshot.kyc[0]?.updatedAt;

  return (
    <div className="task-first-stack secondary-service-page help-page">
      <TaskPageHeader eyebrow="Help and grievances" title="Find who can resolve your EPF issue" description="Start with the current responsible actor, then search guidance or use the official grievance route when an issue remains unresolved." officialTerm="EPF grievance guidance · EPFiGMS" status={{ label: blockers.length > 0 ? `${blockers.length} blocker${blockers.length === 1 ? "" : "s"}` : "Guidance available", tone: blockers.length > 0 ? "blocked" : "active" }} />
      <NextActionPanel eyebrow="Recommended next action" title={snapshot.nextAction.label} description="Follow the portal's current priority first. Help topics and the fictional grievance example remain available below." owner={owner} tone={blockers.length > 0 ? "blocked" : "active"} action={<Link className="primary-action" href={snapshot.nextAction.href}>{snapshot.nextAction.label}</Link>} secondaryAction={<Link className="secondary-action" href="/services">Browse online services</Link>} />
      <CompactFacts items={[
        { label: "Current priority", value: snapshot.nextAction.label, supporting: "Shared with Overview and Journey" },
        { label: "Responsible", value: owner, supporting: "Start with this actor" },
        { label: "Last meaningful update", value: formatUpdate(latestUpdate), supporting: blockers.length > 0 ? `${blockers.length} blocker${blockers.length === 1 ? "" : "s"} open` : "No blocking finding detected" },
      ]} />
      <section className="official-boundary" aria-labelledby="help-boundary-heading"><ShieldCheck aria-hidden="true" size={22} /><div><h2 id="help-boundary-heading">Independent prototype—not an official EPFO service</h2><p>All records, reference numbers, employers, dates, and integrations shown here are fictional or simulated. This site cannot register a grievance, change an EPFO record, or check a live claim.</p></div></section>
      <HelpTopics />
      <section className="grievance-example" aria-labelledby="grievance-example-heading">
        <div className="grievance-example-heading"><MessageSquareWarning aria-hidden="true" size={24} /><div><p className="utility-label">Fictional status example</p><h2 id="grievance-example-heading">Grievance under examination</h2></div><span>EPFO regional office</span></div>
        <dl><div><dt>Reference</dt><dd>EPSHY/2026/****42</dd></div><div><dt>Topic</dt><dd>Previous employer exit date not reflected</dd></div><div><dt>Status</dt><dd>Under examination at office level</dd></div><div><dt>Age</dt><dd>9 fictional days</dd></div></dl>
        <div className="owner-guidance"><div><span>1</span><p><strong>First: previous employer</strong> Ask the employer to correct the exit date when the issue is still employer-owned.</p></div><div><span>2</span><p><strong>Then: EPFiGMS</strong> If the record remains unresolved, register and track the grievance on the official EPFiGMS portal.</p></div><div><span>3</span><p><strong>Escalate with the reference</strong> EPFO currently advises escalation when a registered grievance is pending for more than 15 days, or when the response is unsatisfactory.</p></div></div>
        <div className="grievance-actions"><Link href="/employment">Return to employment record</Link><a href="https://epfigms.gov.in/" rel="noreferrer" target="_blank">Open official EPFiGMS <ExternalLink aria-hidden="true" size={15} /></a></div>
      </section>
    </div>
  );
}
