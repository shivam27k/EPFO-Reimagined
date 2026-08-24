import type { ClaimStatus } from "@/domain/types";

interface ClaimEvent {
  status: ClaimStatus;
  actor: "MEMBER" | "EMPLOYER" | "EPFO" | "BANK" | "AADHAAR";
  explanation: string;
  occurredAt: string;
}

export function ClaimTimeline({ events }: { events: ClaimEvent[] }) {
  if (!events.length) return <p>No claim events have been recorded yet.</p>;

  return (
    <ol className="claim-timeline">
      {events.map((event) => (
        <li key={`${event.status}-${event.occurredAt}`}>
          <span>{event.status.replaceAll("_", " ")}</span>
          <strong>{event.actor}</strong>
          <p>{event.explanation}</p>
          <time dateTime={event.occurredAt}>{event.occurredAt.slice(0, 16).replace("T", " ")}</time>
        </li>
      ))}
    </ol>
  );
}
