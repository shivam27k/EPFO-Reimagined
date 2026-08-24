import { Check, Circle, CircleAlert, MapPin } from "lucide-react";

import type { JourneyMilestone } from "@/domain/member-snapshot";

const statusLabels = {
  completed: "Completed",
  current: "Current",
  upcoming: "Upcoming",
  blocked: "Blocked",
} as const;

const statusIcons = {
  completed: Check,
  current: MapPin,
  upcoming: Circle,
  blocked: CircleAlert,
} as const;

export function JourneyRail({ milestones }: { milestones: JourneyMilestone[] }) {
  return (
    <ol className="journey-rail" aria-label="EPF journey">
      {milestones.map((milestone) => {
        const Icon = statusIcons[milestone.status];

        return (
          <li
            className="journey-milestone"
            data-status={milestone.status}
            key={milestone.key}
          >
            <span className="journey-marker" aria-hidden="true">
              <Icon size={16} strokeWidth={2.2} />
            </span>
            <div className="journey-milestone-copy">
              <div className="journey-milestone-heading">
                <h3>{milestone.label}</h3>
                <span className="journey-status">{statusLabels[milestone.status]}</span>
              </div>
              <p>{milestone.description}</p>
              {milestone.owner ? (
                <p className="journey-owner">
                  <span>Who acts next</span>
                  <strong>{milestone.owner}</strong>
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
