import { redirect } from "next/navigation";

import { OnboardingForm } from "@/components/forms/onboarding-form";
import { TaskPageHeader } from "@/components/ui/task-first";
import { getOnboardingPreflight } from "@/domain/process-definitions";
import { getCachedCurrentRun as requireCurrentRun } from "@/server/auth/session";
import { getOnboardingDraft } from "@/server/services/onboarding-service";

export default async function OnboardingPage() {
  const preflight = getOnboardingPreflight();
  const current = await requireCurrentRun();
  if (current.demoRun.persona !== "NEW_MEMBER") {
    redirect("/profile");
  }
  const draft = await getOnboardingDraft(current.demoRun.id);

  return (
    <div className="task-first-stack onboarding-page">
      <TaskPageHeader
        eyebrow="New-member setup"
        title="Set up your demo member profile"
        description="Review one short section at a time. Saved progress stays in this demo session."
        officialTerm="Simulated UMANG UAN return and Member Portal KYC review"
        status={{ label: "Four guided sections", tone: "active" }}
      />
      <OnboardingForm draft={draft} preflight={preflight} />
    </div>
  );
}
