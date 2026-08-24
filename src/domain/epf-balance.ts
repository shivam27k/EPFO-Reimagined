type EpfContribution = {
  employeeEpf: number;
  employerEpf: number;
  employerEps: number;
  postingStatus: "POSTED" | "MISSING" | "DELAYED";
};

export function calculatePostedEpfBalance(contributions: readonly EpfContribution[]) {
  return contributions
    .filter((contribution) => contribution.postingStatus === "POSTED")
    .reduce(
      (total, contribution) => total + contribution.employeeEpf + contribution.employerEpf,
      0,
    );
}

export function calculateFinalSettlementAmount(
  contributions: readonly EpfContribution[],
  claim?: { amount: number; status: ClaimStatus } | null,
) {
  return claim && claim.status !== "DRAFT"
    ? claim.amount
    : calculatePostedEpfBalance(contributions);
}
import type { ClaimStatus } from "./types";
