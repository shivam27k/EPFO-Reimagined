import { finding } from "./findings";
import type { Finding, MemberSnapshot } from "./types";

function contributionGapCode(wageMonth: string): string {
  return `CONTRIBUTION_GAP_${wageMonth.replace("-", "_")}`;
}

export function evaluateContributions(snapshot: MemberSnapshot): Finding[] {
  return (snapshot.contributions ?? [])
    .filter((contribution) => contribution.status === "MISSING")
    .map((contribution) =>
      finding({
        code: contributionGapCode(contribution.wageMonth),
        severity: "WARNING",
        owner: "EMPLOYER",
        title: `Contribution missing for ${contribution.wageMonth}`,
        explanation:
          "The employer has not posted the contribution for this wage month.",
        allowedActions: ["ASK_EMPLOYER_TO_FILE_CONTRIBUTION"],
      }),
    );
}
