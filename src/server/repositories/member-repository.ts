import { desc, eq } from "drizzle-orm";
import { cache } from "react";

import { evaluateClaimReadiness } from "@/domain/claim-rules";
import { evaluateContributions } from "@/domain/contribution-rules";
import type { MemberSnapshot as RuleSnapshot } from "@/domain/types";
import { evaluateOnboarding } from "@/domain/onboarding-rules";
import type { MemberSnapshot } from "@/domain/member-snapshot";
import { ensureDatabaseReady, getDb } from "@/db/client";
import {
  claimEvents,
  claims,
  contributions,
  demoRuns,
  employments,
  kycRecords,
  memberProfiles,
  scenarioRuns,
  serviceRequests,
  simulationEvents,
} from "@/db/schema";

const activeClaimStatuses = new Set([
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "APPROVED",
  "PAYMENT_SENT",
  "PAYMENT_RETURNED",
]);

function lastCharacters(value: string, count = 4) {
  return value.replace(/[^a-zA-Z0-9]/g, "").slice(-count);
}

function maskUan(value: string) {
  return `XXXX XXXX ${lastCharacters(value)}`;
}

function maskMemberId(value: string) {
  const compact = value.replace(/\s/g, "");
  return `${"*".repeat(Math.max(0, compact.length - 4))}${compact.slice(-4)}`;
}

function uniqueFindings(findings: RuleSnapshot["findings"]) {
  return Array.from(new Map(findings.map((item) => [item.code, item])).values());
}

function chooseNextAction(
  snapshot: Pick<MemberSnapshot, "persona" | "profile" | "findings" | "activeClaim">,
) {
  if (snapshot.persona === "NEW_MEMBER" && !snapshot.profile.onboardingComplete) {
    return { label: "Complete new-member setup", href: "/onboarding" };
  }

  if (snapshot.findings.some((finding) => finding.code === "MISSING_EXIT_DATE")) {
    return { label: "Resolve missing exit date", href: "/employment" };
  }

  if (
    snapshot.findings.some((finding) =>
      ["BANK_NAME_MISMATCH", "BANK_NOT_VERIFIED", "PENDING_BANK_CHANGE"].includes(
        finding.code,
      ),
    )
  ) {
    return { label: "Resolve bank verification", href: "/profile" };
  }

  if (snapshot.activeClaim) {
    return { label: "Track your claim", href: "/claims" };
  }

  return { label: "Review contribution history", href: "/passbook" };
}

export async function getMemberSnapshot(demoRunId: string): Promise<MemberSnapshot> {
  await ensureDatabaseReady();
  const db = getDb();

  const [runRows, profileRows, kycRows, employmentRows, contributionRows, claimRows, eventRows, scenarioRows, requestRows, simulationRows] =
    await Promise.all([
      db.select().from(demoRuns).where(eq(demoRuns.id, demoRunId)),
      db.select().from(memberProfiles).where(eq(memberProfiles.demoRunId, demoRunId)),
      db
        .select()
        .from(kycRecords)
        .where(eq(kycRecords.demoRunId, demoRunId))
        .orderBy(kycRecords.type),
      db
        .select()
        .from(employments)
        .where(eq(employments.demoRunId, demoRunId))
        .orderBy(desc(employments.joinedAt)),
      db
        .select({
          establishmentName: employments.establishmentName,
          wageMonth: contributions.wageMonth,
          employeeEpf: contributions.employeeEpf,
          employerEpf: contributions.employerEpf,
          employerEps: contributions.employerEps,
          postingStatus: contributions.postingStatus,
        })
        .from(contributions)
        .innerJoin(employments, eq(contributions.employmentId, employments.id))
        .where(eq(employments.demoRunId, demoRunId))
        .orderBy(desc(contributions.wageMonth)),
      db
        .select()
        .from(claims)
        .where(eq(claims.demoRunId, demoRunId))
        .orderBy(desc(claims.submittedAt)),
      db
        .select({
          status: claimEvents.status,
          actor: claimEvents.actor,
          explanation: claimEvents.explanation,
          occurredAt: claimEvents.occurredAt,
        })
        .from(claimEvents)
        .innerJoin(claims, eq(claimEvents.claimId, claims.id))
        .where(eq(claims.demoRunId, demoRunId))
        .orderBy(desc(claimEvents.occurredAt)),
      db
        .select({
          scenarioKey: scenarioRuns.scenarioKey,
          stage: scenarioRuns.stage,
          updatedAt: scenarioRuns.updatedAt,
        })
        .from(scenarioRuns)
        .where(eq(scenarioRuns.demoRunId, demoRunId))
        .orderBy(desc(scenarioRuns.updatedAt)),
      db.select().from(serviceRequests).where(eq(serviceRequests.demoRunId, demoRunId)),
      db
        .select()
        .from(simulationEvents)
        .where(eq(simulationEvents.demoRunId, demoRunId))
        .orderBy(desc(simulationEvents.recordedAt)),
    ]);

  const run = runRows[0];
  const profile = profileRows[0];

  if (!run || !profile) {
    throw new Error("Member snapshot not found for the current demo run.");
  }

  const activeClaimRow = claimRows.find((claim) => activeClaimStatuses.has(claim.status));
  const latestClaimRow = claimRows[0];
  const currentEmployment = employmentRows.find((employment) => employment.exitedAt === null);
  const bankKyc = kycRows.find((record) => record.type === "BANK");
  const aadhaarKyc = kycRows.find((record) => record.type === "AADHAAR");

  const ruleSnapshot: RuleSnapshot = {
    demoRunId,
    persona: run.persona,
    profile: {
      uan: profile.uan,
      aadhaarName: profile.aadhaarName,
      bankName: profile.bankName,
      panName: profile.panName,
      dateOfBirth: profile.dateOfBirth,
      mobileMasked: profile.mobileMasked,
      onboardingComplete: profile.onboardingComplete,
    },
    identity: { activated: aadhaarKyc?.status === "VERIFIED" },
    bank: {
      verificationStatus: bankKyc?.status ?? "NOT_STARTED",
      changeRequestPending: requestRows.some(
        (request) => request.type === "BANK_CHANGE" && request.status !== "RESOLVED",
      ),
    },
    employment: {
      exitDate: currentEmployment?.exitedAt ?? employmentRows[0]?.exitedAt ?? null,
      unemploymentAsOf: simulationRows[0]?.recordedAt
        ? simulationRows[0].recordedAt.slice(0, 10)
        : run.createdAt.slice(0, 10),
    },
    contributions: contributionRows.map((contribution) => ({
      wageMonth: contribution.wageMonth,
      status: contribution.postingStatus === "POSTED" ? "POSTED" : "MISSING",
    })),
    claims: claimRows.map((claim) => ({ type: claim.type, status: claim.status })),
    findings: [],
  };

  const findings = uniqueFindings([
    ...evaluateOnboarding(ruleSnapshot),
    ...evaluateContributions(ruleSnapshot),
    ...(run.persona === "EXISTING_MEMBER" || profile.onboardingComplete || claimRows.length > 0
      ? evaluateClaimReadiness(ruleSnapshot)
      : []),
  ]);

  const snapshotWithoutAction: Omit<MemberSnapshot, "nextAction"> = {
    persona: run.persona,
    profile: {
      displayName: profile.aadhaarName,
      uanMasked: maskUan(profile.uan),
      aadhaarName: profile.aadhaarName,
      bankName: profile.bankName,
      panName: profile.panName,
      dateOfBirth: profile.dateOfBirth,
      mobileMasked: profile.mobileMasked,
      onboardingComplete: profile.onboardingComplete,
    },
    kyc: kycRows.map((record) => ({
      type: record.type,
      valueMasked: record.valueMasked,
      status: record.status,
      statusLabel:
        record.status === "VERIFIED"
          ? record.type === "AADHAAR"
            ? "Verified by UIDAI — simulated response"
            : "Digitally approved by employer — simulated response"
          : record.status === "PENDING"
            ? "Pending employer approval — simulated request"
            : record.status === "MISMATCH"
              ? "Deterministic name mismatch — action needed"
              : "Not submitted in this demo",
      updatedAt: record.updatedAt,
    })),
    employments: employmentRows.map((employment) => ({
      employmentKey: employment.id.startsWith(`${demoRunId}:`)
        ? employment.id.slice(`${demoRunId}:`.length)
        : "employment:record",
      memberIdMasked: maskMemberId(employment.memberId),
      establishmentName: employment.establishmentName,
      joinedAt: employment.joinedAt,
      exitedAt: employment.exitedAt,
      epfMember: employment.epfMember,
      epsMember: employment.epsMember,
    })),
    contributions: contributionRows,
    activeClaim: activeClaimRow
      ? {
          type: activeClaimRow.type,
          amount: activeClaimRow.amount,
          status: activeClaimRow.status,
          submittedAt: activeClaimRow.submittedAt,
        }
      : null,
    latestClaim: latestClaimRow
      ? {
          type: latestClaimRow.type,
          amount: latestClaimRow.amount,
          status: latestClaimRow.status,
          submittedAt: latestClaimRow.submittedAt,
        }
      : null,
    claimEvents: eventRows,
    scenarioRuns: scenarioRows,
    simulations: simulationRows,
    findings,
  };

  return {
    ...snapshotWithoutAction,
    nextAction: chooseNextAction(snapshotWithoutAction),
  };
}

export const getCachedMemberSnapshot = cache(getMemberSnapshot);
