import type {
  ClaimStatus,
  ClaimType,
  DemoPersona,
  Finding,
  ScenarioKey,
  ScenarioStage,
  VerificationStatus,
} from "./types";

export interface MemberSnapshot {
  persona: DemoPersona;
  profile: {
    displayName: string;
    uanMasked: string;
    aadhaarName: string;
    bankName: string;
    panName: string;
    dateOfBirth: string;
    mobileMasked: string;
    onboardingComplete: boolean;
  };
  kyc: Array<{
    type: "AADHAAR" | "PAN" | "BANK";
    valueMasked: string;
    status: VerificationStatus;
    statusLabel?: string;
    updatedAt: string;
  }>;
  employments: Array<{
    employmentKey: string;
    memberIdMasked: string;
    establishmentName: string;
    joinedAt: string;
    exitedAt: string | null;
    epfMember: boolean;
    epsMember: boolean;
  }>;
  contributions: Array<{
    establishmentName: string;
    wageMonth: string;
    employeeEpf: number;
    employerEpf: number;
    employerEps: number;
    postingStatus: "POSTED" | "MISSING" | "DELAYED";
  }>;
  activeClaim: {
    type: ClaimType;
    amount: number;
    status: ClaimStatus;
    submittedAt: string | null;
  } | null;
  latestClaim?: {
    type: ClaimType;
    amount: number;
    status: ClaimStatus;
    submittedAt: string | null;
  } | null;
  claimEvents: Array<{
    status: ClaimStatus;
    actor: "MEMBER" | "EMPLOYER" | "EPFO" | "BANK" | "AADHAAR";
    explanation: string;
    occurredAt: string;
  }>;
  scenarioRuns: Array<{
    scenarioKey: ScenarioKey;
    stage: ScenarioStage;
    updatedAt: string;
  }>;
  simulations: Array<{
    kind: "TIME_ADVANCE";
    intervalStart: string;
    intervalEnd: string;
    intervalLabel: string;
    months: number;
    recordedAt: string;
  }>;
  findings: Finding[];
  nextAction: {
    label: string;
    href: string;
  };
}

export type JourneyMilestoneStatus = "completed" | "current" | "upcoming" | "blocked";

export interface JourneyMilestone {
  key: "account" | "kyc" | "contributions" | "exit" | "claim";
  label: string;
  description: string;
  status: JourneyMilestoneStatus;
  owner?: string;
}

export function buildJourneyMilestones(snapshot: MemberSnapshot): JourneyMilestone[] {
  const hasMissingExitDate = snapshot.findings.some(
    (finding) => finding.code === "MISSING_EXIT_DATE",
  );
  const hasEmployment = snapshot.employments.length > 0;
  const hasExitedEmployment = snapshot.employments.some(
    (employment) => employment.exitedAt !== null,
  );
  const allKycVerified =
    snapshot.kyc.length > 0 && snapshot.kyc.every((record) => record.status === "VERIFIED");
  const kycBlocker = snapshot.findings.some(
    (finding) =>
      finding.severity === "BLOCKER" &&
      (finding.owner === "BANK" || finding.owner === "AADHAAR"),
  );
  const contributionFindings = snapshot.findings.filter((finding) =>
    finding.code.startsWith("CONTRIBUTION_"),
  );
  const contributionBlocker = contributionFindings.some(
    (finding) => finding.severity === "BLOCKER",
  );
  const hasPostedContribution = snapshot.contributions.some(
    (contribution) => contribution.postingStatus === "POSTED",
  );
  const journeyClaim = snapshot.activeClaim ?? snapshot.latestClaim ?? null;
  const contributionStatus: JourneyMilestoneStatus = contributionBlocker
    ? "blocked"
    : contributionFindings.length > 0 || snapshot.contributions.length > 0
      ? hasPostedContribution && contributionFindings.length === 0
        ? "completed"
        : "current"
      : "upcoming";

  return [
    {
      key: "account",
      label: "UAN available",
      description: "Official activation occurs outside this prototype; this demo uses a seeded UAN returned from simulated UMANG.",
      status: "completed",
    },
    {
      key: "kyc",
      label: "Verify identity and bank",
      description: allKycVerified
        ? "Identity, PAN and bank checks are recorded."
        : "Complete identity, PAN and bank checks before making a claim.",
      status: kycBlocker ? "blocked" : allKycVerified ? "completed" : "current",
      owner: kycBlocker ? "Bank or identity provider" : allKycVerified ? undefined : "You",
    },
    {
      key: "contributions",
      label: "Build contribution history",
      description:
        contributionFindings.length > 0
          ? "Your ledger has a missing or delayed contribution that needs attention."
          : hasPostedContribution
            ? "Posted contributions are present with no detected gaps."
            : "Monthly deposits will appear after employment begins.",
      status: contributionStatus,
      owner: contributionFindings.length > 0 ? "Employer" : undefined,
    },
    {
      key: "exit",
      label: "Record employment exit",
      description: hasMissingExitDate
        ? "Your previous employer must record the exit date."
        : hasExitedEmployment
          ? "An employment exit date is on record."
          : "This becomes relevant when an employment ends.",
      status: hasMissingExitDate
        ? "blocked"
        : hasExitedEmployment
          ? "completed"
          : hasEmployment
            ? "current"
            : "upcoming",
      owner: hasMissingExitDate ? "Previous employer" : undefined,
    },
    {
      key: "claim",
      label: "File and track a claim",
      description: snapshot.activeClaim
        ? "A claim is in progress; follow each recorded status event."
        : journeyClaim?.status === "SETTLED"
          ? "The latest fictional claim reached settlement."
          : journeyClaim?.status === "REJECTED"
            ? "The latest fictional claim was rejected; review the recorded reason before choosing another service."
            : "Claim options appear after eligibility checks are complete.",
      status: snapshot.activeClaim
        ? "current"
        : journeyClaim?.status === "SETTLED"
          ? "completed"
          : journeyClaim?.status === "REJECTED"
            ? "blocked"
            : "upcoming",
      owner: journeyClaim?.status === "REJECTED" ? "You and EPFO" : undefined,
    },
  ];
}
