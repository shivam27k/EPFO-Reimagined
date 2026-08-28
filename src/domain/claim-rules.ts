import { finding } from "./findings";
import type { ClaimStatus, Finding, MemberSnapshot } from "./types";

const activeFinalSettlementStatuses: ClaimStatus[] = [
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "APPROVED",
  "PAYMENT_SENT",
  "PAYMENT_RETURNED",
];

interface IsoDateParts {
  year: number;
  month: number;
  day: number;
}

function parseIsoCalendarDate(value: string | undefined | null): IsoDateParts | null {
  if (typeof value !== "string") {
    return null;
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

function toDate(parts: IsoDateParts): Date {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
}

function addCalendarMonthsClamped(parts: IsoDateParts, months: number): Date {
  const absoluteTargetMonth = parts.month - 1 + months;
  const targetYear = parts.year + Math.floor(absoluteTargetMonth / 12);
  const targetMonthIndex = ((absoluteTargetMonth % 12) + 12) % 12;
  const lastTargetDay = new Date(Date.UTC(targetYear, targetMonthIndex + 1, 0)).getUTCDate();

  return new Date(
    Date.UTC(targetYear, targetMonthIndex, Math.min(parts.day, lastTargetDay)),
  );
}

export function evaluateClaimReadiness(snapshot: MemberSnapshot): Finding[] {
  const findings: Finding[] = [];

  if (!snapshot.profile.onboardingComplete) {
    findings.push(finding({ code: "ONBOARDING_INCOMPLETE", severity: "BLOCKER", owner: "MEMBER",
      title: "Complete your profile first", explanation: "Finish new-member setup before reviewing final-settlement eligibility.",
      allowedActions: ["COMPLETE_ONBOARDING"] }));
  }
  if (snapshot.employment?.hasRecord !== true) {
    findings.push(finding({ code: "EMPLOYMENT_RECORD_REQUIRED", severity: "BLOCKER", owner: "EMPLOYER",
      title: "No employment record available", explanation: "An EPF employment record is required before final settlement can be evaluated.",
      allowedActions: ["REVIEW_EMPLOYMENT"] }));
  } else if (snapshot.employment.isActive) {
    findings.push(finding({ code: "ACTIVE_EMPLOYMENT_EXISTS", severity: "BLOCKER", owner: "EMPLOYER",
      title: "Employment is still active", explanation: "The recorded employment has not ended. Review employment details before considering final settlement.",
      allowedActions: ["REVIEW_EMPLOYMENT"] }));
  }
  if (typeof snapshot.postedEpfBalance !== "number" || !Number.isFinite(snapshot.postedEpfBalance) || snapshot.postedEpfBalance <= 0) {
    findings.push(finding({ code: "NO_WITHDRAWABLE_EPF_BALANCE", severity: "BLOCKER", owner: "EMPLOYER",
      title: "No posted EPF balance available", explanation: "A positive posted EPF balance is required. Review your contribution history; a zero-value claim cannot be submitted.",
      allowedActions: ["REVIEW_CONTRIBUTIONS"] }));
  }

  if (snapshot.identity?.activated !== true) {
    findings.push(
      finding({
        code: "IDENTITY_NOT_ACTIVATED",
        severity: "BLOCKER",
        owner: "AADHAAR",
        title: "Activate Aadhaar identity",
        explanation: "Final settlement requires an activated member identity.",
        allowedActions: ["ACTIVATE_IDENTITY"],
      }),
    );
  }

  if (snapshot.bank?.verificationStatus !== "VERIFIED") {
    findings.push(
      finding({
        code: "BANK_NOT_VERIFIED",
        severity: "BLOCKER",
        owner: "BANK",
        title: "Verify bank account",
        explanation: "Final settlement cannot proceed until the payout bank account is verified.",
        allowedActions: ["VERIFY_BANK_KYC"],
      }),
    );
  }

  if (snapshot.bank?.changeRequestPending === true) {
    findings.push(
      finding({
        code: "PENDING_BANK_CHANGE",
        severity: "BLOCKER",
        owner: "BANK",
        title: "Pending bank change",
        explanation: "A pending bank change must finish before a final settlement claim is filed.",
        allowedActions: ["TRACK_BANK_CHANGE"],
      }),
    );
  }

  const exitDate = snapshot.employment?.exitDate;
  const unemploymentAsOf = snapshot.employment?.unemploymentAsOf;
  const parsedExitDate = parseIsoCalendarDate(exitDate);
  const parsedUnemploymentAsOf = parseIsoCalendarDate(unemploymentAsOf);

  if (!exitDate) {
    findings.push(
      finding({
        code: "MISSING_EXIT_DATE",
        severity: "BLOCKER",
        owner: "EMPLOYER",
        title: "Exit date missing",
        explanation: "The employer must record the member exit date before final settlement.",
        allowedActions: ["REQUEST_EMPLOYER_EXIT_DATE"],
      }),
    );
  } else if (!parsedExitDate) {
    findings.push(
      finding({
        code: "INVALID_EXIT_DATE",
        severity: "BLOCKER",
        owner: "EMPLOYER",
        title: "Exit date is invalid",
        explanation: "The employer exit date must be a valid YYYY-MM-DD calendar date.",
        allowedActions: ["REQUEST_EMPLOYER_EXIT_DATE"],
      }),
    );
  }

  if (!parsedUnemploymentAsOf) {
    findings.push(
      finding({
        code: "INVALID_UNEMPLOYMENT_REFERENCE_DATE",
        severity: "BLOCKER",
        owner: "EPFO",
        title: "Unemployment reference date is invalid",
        explanation:
          "Claim readiness requires EPFO snapshot data to include a valid YYYY-MM-DD reference date.",
        allowedActions: ["REFRESH_MEMBER_SNAPSHOT"],
      }),
    );
  }

  if (
    parsedExitDate &&
    parsedUnemploymentAsOf &&
    toDate(parsedUnemploymentAsOf) < addCalendarMonthsClamped(parsedExitDate, 2)
  ) {
    findings.push(
      finding({
        code: "TWO_MONTH_UNEMPLOYMENT_NOT_MET",
        severity: "BLOCKER",
        owner: "MEMBER",
        title: "Two months of unemployment not completed",
        explanation:
          "Final settlement requires two months from the exit date as of the supplied reference date.",
        allowedActions: ["WAIT_UNTIL_ELIGIBLE"],
      }),
    );
  }

  if (
    (snapshot.claims ?? []).some(
      (claim) =>
        claim.type === "FINAL_SETTLEMENT" &&
        activeFinalSettlementStatuses.includes(claim.status),
    )
  ) {
    findings.push(
      finding({
        code: "ACTIVE_FINAL_SETTLEMENT_CLAIM_EXISTS",
        severity: "BLOCKER",
        owner: "EPFO",
        title: "Active final settlement claim exists",
        explanation:
          "A duplicate final settlement claim cannot be filed while another final settlement claim is active.",
        allowedActions: ["TRACK_EXISTING_CLAIM"],
      }),
    );
  }

  return findings;
}
