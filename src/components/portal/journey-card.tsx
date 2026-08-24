import Link from "next/link";

import {
  buildJourneyMilestones,
  type JourneyMilestone,
  type MemberSnapshot,
} from "@/domain/member-snapshot";
import { JourneyRail } from "./journey-rail";

function milestoneForAction(
  milestones: JourneyMilestone[],
  href: string,
): JourneyMilestone | undefined {
  const key = href.startsWith("/onboarding") || href.startsWith("/profile")
    ? "kyc"
    : href.startsWith("/passbook")
      ? "contributions"
      : href.startsWith("/employment") || href.startsWith("/transfers")
        ? "exit"
        : href.startsWith("/claims") || href.startsWith("/services") || href.startsWith("/help")
          ? "claim"
          : undefined;

  return key ? milestones.find((milestone) => milestone.key === key) : undefined;
}

export function JourneyCard({
  onNavigate,
  snapshot,
}: {
  onNavigate?: () => void;
  snapshot: MemberSnapshot;
}) {
  const milestones = buildJourneyMilestones(snapshot);
  const completeCount = milestones.filter((milestone) => milestone.status === "completed").length;
  const currentMilestone = milestoneForAction(milestones, snapshot.nextAction.href)
    ?? milestones.find((milestone) => milestone.status === "blocked")
    ?? milestones.find((milestone) => milestone.status === "current")
    ?? milestones.find((milestone) => milestone.status === "upcoming")
    ?? milestones.at(-1);
  const completedMilestones = milestones.filter(
    (milestone) => milestone.status === "completed" && milestone.key !== currentMilestone?.key,
  );

  return (
    <section className="journey-card" aria-labelledby="journey-heading">
      <div className="journey-card-heading">
        <div>
          <p className="utility-label">Your EPF journey</p>
          <h2 id="journey-heading">Your current step and what to do next</h2>
        </div>
        <p className="journey-progress">
          <span>Journey progress</span>
          <strong>
            {completeCount} of {milestones.length} complete
          </strong>
        </p>
      </div>

      {currentMilestone ? (
        <section className="journey-current-step" data-status={currentMilestone.status} aria-labelledby="journey-current-heading">
          <p className="utility-label">Current step</p>
          <h3 id="journey-current-heading">{currentMilestone.label}</h3>
          <p>{currentMilestone.description}</p>
          {currentMilestone.owner ? <p className="journey-current-owner"><span>Who acts next</span><strong>{currentMilestone.owner}</strong></p> : null}
        </section>
      ) : null}

      <div className="journey-next-action">
        <div>
          <p className="utility-label">Next action</p>
          <p>{snapshot.nextAction.label}</p>
        </div>
        <Link className="primary-action" href={snapshot.nextAction.href} onClick={onNavigate}>
          {snapshot.nextAction.label}
        </Link>
      </div>

      <details className="journey-completed-details">
        <summary>
          View completed steps
          <span>{completedMilestones.length}</span>
        </summary>
        {completedMilestones.length > 0 ? (
          <JourneyRail milestones={completedMilestones} />
        ) : (
          <p className="journey-completed-empty">No earlier steps are complete yet.</p>
        )}
      </details>
    </section>
  );
}
