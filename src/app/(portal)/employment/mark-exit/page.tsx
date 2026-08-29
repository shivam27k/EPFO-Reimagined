import { ArrowLeft } from "lucide-react";
import Link from "next/link";

import { MarkExitForm } from "@/components/employment/mark-exit-form";
import { TaskPageHeader } from "@/components/ui/task-first";
import { getCachedCurrentRun as requireCurrentRun } from "@/server/auth/session";
import { getCachedMemberSnapshot as getMemberSnapshot } from "@/server/repositories/member-repository";

export default async function MarkExitPage() {
  const current = await requireCurrentRun();
  const snapshot = await getMemberSnapshot(current.demoRun.id);
  const openEmployments = snapshot.employments.filter((employment) => !employment.exitedAt).map((employment) => ({
    ...employment,
    latestContributionMonth: snapshot.contributions.find((contribution) => contribution.establishmentName === employment.establishmentName)?.wageMonth ?? null,
  }));

  return (
    <div className="task-first-stack mark-exit-page">
      <TaskPageHeader
        eyebrow="Employment · Mark Exit"
        title="Record when an employment ended"
        description="Confirm the selected service record, matching exit dates, and fictional authentication details before recording this demo update."
        officialTerm="Member-side Mark Exit"
        status={{ label: openEmployments.length > 0 ? "Exit update in progress" : "No exit update needed", tone: openEmployments.length > 0 ? "active" : "complete" }}
      />
      <div className="mark-exit-page-actions">
        <Link className="secondary-action" href="/employment"><ArrowLeft aria-hidden="true" size={16} />View employment</Link>
      </div>
      <aside className="prototype-notice"><strong>Demo boundary</strong><p>This updates only the current isolated demo run. It does not contact EPFO, UIDAI, an employer or an Aadhaar-linked mobile number.</p></aside>
      <MarkExitForm employments={openEmployments} />
    </div>
  );
}
