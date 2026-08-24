import type { Finding } from "@/domain/types";

const ownerLabels: Record<Finding["owner"], string> = {
  MEMBER: "You",
  EMPLOYER: "Employer",
  EPFO: "EPFO",
  BANK: "Bank",
  AADHAAR: "Aadhaar",
};

export function ClaimReadiness({ findings }: { findings: Finding[] }) {
  const blockers = findings.filter((finding) =>
    finding.severity === "BLOCKER" && finding.code !== "ACTIVE_FINAL_SETTLEMENT_CLAIM_EXISTS"
  );

  return blockers.length ? (
    <div className="owner-groups">
      {blockers.map((finding) => (
        <article className="alert-row" data-severity={finding.severity.toLowerCase()} key={finding.code}>
          <div>
            <span className="alert-severity">Responsible: {ownerLabels[finding.owner]}</span>
            <h3>{finding.title}</h3>
            <p>{finding.explanation}</p>
          </div>
        </article>
      ))}
    </div>
  ) : (
    <div className="empty-register">
      <p>All deterministic profile, bank, exit-date, and eligibility checks are clear.</p>
      <span>The submission remains fictional and does not contact EPFO.</span>
    </div>
  );
}
