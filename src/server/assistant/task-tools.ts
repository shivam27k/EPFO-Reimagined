import "server-only";
import {
  assistantToolCallSchema, isReadTool, toolResultSchema,
  type AssistantToolCall, type ExecutionContext, type ToolResult,
} from "@/domain/assistant-tools";
import type { MemberSnapshot } from "@/domain/member-snapshot";
import type { Finding } from "@/domain/types";
import { workflowRoutes } from "@/domain/portal-actions";
import { calculatePostedEpfBalance } from "@/domain/epf-balance";
import { formatRupees } from "@/domain/service-readiness";
import { getMemberSnapshotWithVersion } from "@/server/repositories/member-repository";
import { redactModelText } from "./model-text";

type Workflow = keyof typeof workflowRoutes;

function safeRecordText(value: string) {
  // Onboarding accepts 8–18 digit bank accounts, including 8, 9 and 11 digits.
  return redactModelText(value).slice(0, 1000);
}

function maskedIdentifier(value: string) {
  return `****${value.replace(/[^a-zA-Z0-9]/g, "").slice(-4)}`;
}

function projectClaim(claim: MemberSnapshot["activeClaim"] | undefined) {
  return claim ? {
    type: claim.type, status: claim.status, submittedAt: claim.submittedAt,
    amountDisplayed: formatRupees(claim.amount), currency: "INR",
  } : null;
}

function projectFinding(finding: Finding) {
  return {
    code: finding.code, severity: finding.severity, owner: finding.owner,
    title: finding.title, explanation: finding.explanation,
    allowedActions: finding.allowedActions.map((action) => action),
  };
}

function workflowAction(workflow: Workflow) {
  const route = workflowRoutes[workflow];
  return { label: `Review ${workflow.replaceAll("_", " ")}`, href: route.route,
    ...(route.target ? { target: route.target } : {}) };
}

function findingAction(finding: Finding) {
  if (finding.code === "ONBOARDING_INCOMPLETE") return { label: "Complete your profile", href: "/onboarding" };
  if (finding.code === "NO_WITHDRAWABLE_EPF_BALANCE") return { label: "Review contribution history", href: "/passbook" };
  if (["EMPLOYMENT_RECORD_REQUIRED", "ACTIVE_EMPLOYMENT_EXISTS"].includes(finding.code)) return { label: "Review employment records", href: "/employment" };
  if (finding.code.startsWith("CONTRIBUTION_GAP_")) return { label: "Review recorded contributions", href: "/passbook" };
  if (["MISSING_EXIT_DATE", "INVALID_EXIT_DATE"].includes(finding.code)) return { label: "Review employment exit", href: "/employment" };
  if (["BANK_NAME_MISMATCH", "BANK_NOT_VERIFIED", "PENDING_BANK_CHANGE", "PAN_NAME_MISMATCH", "IDENTITY_NOT_ACTIVATED"].includes(finding.code)) {
    return { label: "Review profile and KYC", href: "/profile" };
  }
  return { label: "Review recorded claim requirements", href: "/claims" };
}

function contributionData(rows: MemberSnapshot["contributions"]) {
  return {
    currency: "INR", displayUnit: "whole rupees",
    postedEpfBalanceDisplayed: formatRupees(calculatePostedEpfBalance(rows)),
    counts: {
      posted: rows.filter((row) => row.postingStatus === "POSTED").length,
      missing: rows.filter((row) => row.postingStatus === "MISSING").length,
      delayed: rows.filter((row) => row.postingStatus === "DELAYED").length,
    },
    contributions: rows.map((row) => ({
      establishmentName: safeRecordText(row.establishmentName),
      wageMonth: row.wageMonth, postingStatus: row.postingStatus,
      employeeEpfDisplayed: formatRupees(row.employeeEpf),
      employerEpfDisplayed: formatRupees(row.employerEpf),
      employerEpsDisplayed: formatRupees(row.employerEps),
      explanation: row.postingStatus === "POSTED"
        ? "Recorded as posted; only the employee and employer EPF shares count toward posted EPF balance."
        : row.postingStatus === "DELAYED"
          ? "Recorded as delayed; excluded from posted EPF balance until posting is recorded."
          : "Recorded as missing; excluded from posted EPF balance. Ask the employer about this month.",
    })),
  };
}

function claimHistory(snapshot: MemberSnapshot) {
  return {
    activeClaim: projectClaim(snapshot.activeClaim), latestClaim: projectClaim(snapshot.latestClaim),
    events: snapshot.claimEvents.map((event) => ({
      status: event.status, actor: event.actor, occurredAt: event.occurredAt,
      explanation: safeRecordText(event.explanation),
    })),
  };
}

function summary(snapshot: MemberSnapshot) {
  // Never spread repository rows: runtime simulation rows contain hidden IDs.
  return {
    persona: snapshot.persona,
    profile: { uanMasked: snapshot.profile.uanMasked, onboardingComplete: snapshot.profile.onboardingComplete },
    kyc: snapshot.kyc.map((record) => ({ type: record.type, status: record.status, valueMasked: maskedIdentifier(record.valueMasked) })),
    employments: snapshot.employments.map((record) => ({
      memberIdMasked: record.memberIdMasked, establishmentName: safeRecordText(record.establishmentName),
      joinedAt: record.joinedAt, exitedAt: record.exitedAt, epfMember: record.epfMember, epsMember: record.epsMember,
    })),
    activeClaim: projectClaim(snapshot.activeClaim), latestClaim: projectClaim(snapshot.latestClaim),
    contributionSummary: {
      currency: "INR", displayUnit: "whole rupees",
      postedEpfBalanceDisplayed: formatRupees(calculatePostedEpfBalance(snapshot.contributions)),
    },
    findings: snapshot.findings.map(projectFinding),
    simulations: snapshot.simulations.map((record) => ({
      kind: record.kind, intervalStart: record.intervalStart, intervalEnd: record.intervalEnd,
      months: record.months, recordedAt: record.recordedAt,
    })),
    nextAction: { label: snapshot.nextAction.label, href: snapshot.nextAction.href },
  };
}

function readiness(snapshot: MemberSnapshot, workflow: Workflow) {
  const nextAction = workflowAction(workflow);
  const unknown = (reason: string, message: string) => ({
    workflow, readiness: "unknown" as const, reason, message,
    missingRequirements: [], owners: [], nextAction, existingClaim: null,
  });

  // getMemberSnapshot builds its separate RuleSnapshot from authoritative run data.
  // Reuse its findings; never cast this presentation snapshot to the rule-input type.
  if (workflow === "new_member_setup") {
    const findings = snapshot.findings.filter((finding) => ["BANK_NAME_MISMATCH", "PAN_NAME_MISMATCH"].includes(finding.code));
    if (!findings.length) return unknown("PARTIAL_READINESS_EVALUATOR", "The existing onboarding rules check name consistency only; complete setup readiness is unknown. Review the normal form.");
    return {
      workflow, readiness: "blocked" as const, reason: "CURRENT_FINDINGS",
      message: "Recorded onboarding name checks need attention; review the normal setup form.",
      missingRequirements: findings.map(projectFinding), owners: [...new Set(findings.map((finding) => finding.owner))],
      nextAction: findingAction(findings[0]), existingClaim: null,
    };
  }
  if (workflow !== "final_settlement") return unknown("NO_READINESS_EVALUATOR", "This workflow has no existing readiness evaluator. Review its manual workflow; eligibility is unknown.");

  const blockers = snapshot.findings.filter((finding) => finding.severity === "BLOCKER");
  const existingClaim = projectClaim(snapshot.activeClaim);
  const draft = snapshot.activeClaim?.status === "DRAFT";
  const message = draft
    ? "A recorded draft already exists. Review or continue that draft and its remaining requirements in Claims; this does not mean submission is ready."
    : existingClaim
      ? "A recorded claim is active. Track it and resolve any current requirements before considering another claim."
      : blockers.length
        ? "Recorded final-settlement checks have unmet requirements."
        : "The existing demo checks report no blockers. Review the normal claim form and declarations; no claim has been submitted by this tool.";
  const firstRequirement = blockers.find((finding) => finding.code !== "ACTIVE_FINAL_SETTLEMENT_CLAIM_EXISTS");
  return {
    workflow, readiness: blockers.length ? "blocked" as const : "ready" as const,
    reason: "CURRENT_FINDINGS", message,
    missingRequirements: blockers.map(projectFinding), owners: [...new Set(blockers.map((finding) => finding.owner))],
    nextAction: firstRequirement ? findingAction(firstRequirement) : nextAction,
    existingClaim,
  };
}

function transientReadFailure(error: unknown): boolean {
  for (let depth = 0; depth < 4 && error && typeof error === "object"; depth += 1) {
    if ("code" in error && ["SQLITE_BUSY", "SQLITE_LOCKED", "ETIMEDOUT", "ECONNRESET"].includes(String(error.code))) return true;
    error = "cause" in error ? error.cause : null;
  }
  return false;
}

/** Internal server boundary. The transport must supply context from its authenticated
 * session, never from model arguments. No provider calls, retries, or writes happen here. */
export async function executeReadTool(call: AssistantToolCall, context: ExecutionContext): Promise<ToolResult> {
  const result = (value: Omit<ToolResult, "callId" | "contextVersion">, contextVersion = "unavailable") => toolResultSchema.parse({
    callId: context.callId, contextVersion, ...value,
  });
  const parsed = assistantToolCallSchema.safeParse(call);
  if (!parsed.success) return result({ status: "failed", message: "Tool arguments are invalid.", error: { code: "INVALID_ARGUMENTS", retryable: false } });
  const validated = parsed.data;
  if (!isReadTool(validated.name)) return result({ status: "unavailable", message: "This tool is not implemented by the read service.", error: { code: "READ_TOOL_NOT_IMPLEMENTED", retryable: false } });

  let snapshot: MemberSnapshot;
  let contextVersion: string;
  try {
    ({ snapshot, contextVersion } = await getMemberSnapshotWithVersion(context.demoRunId));
  } catch (error) {
    const retryable = transientReadFailure(error);
    return result({
      status: retryable ? "failed" : "unavailable", message: "Current demo records could not be read.",
      error: { code: retryable ? "TRANSIENT_READ_FAILURE" : "MEMBER_RECORDS_UNAVAILABLE", retryable },
    });
  }
  const completed = (message: string, data: Record<string, unknown>, record: string) => result({
    status: "completed", message, data, evidence: [{ kind: "record", value: record }],
  }, contextVersion);

  switch (validated.name) {
    case "get_member_summary": return completed("Current recorded demo member summary.", summary(snapshot), "Current demo member records");
    case "get_claim_history": return completed("Current/latest demo claim and recorded events, not live provider status.", claimHistory(snapshot), "Recorded demo claims and claim events");
    case "inspect_contributions": {
      const { fromMonth, toMonth } = validated.arguments;
      const rows = snapshot.contributions.filter((row) => (!fromMonth || row.wageMonth >= fromMonth) && (!toMonth || row.wageMonth <= toMonth));
      return completed("Only recorded contribution rows are shown. Missing and delayed amounts are not posted balance; unrecorded months are not inferred.", contributionData(rows), "Recorded demo contribution ledger");
    }
    case "check_workflow_readiness": {
      const data = readiness(snapshot, validated.arguments.workflow);
      return completed(data.message, data, "Existing domain findings for current demo records");
    }
    case "explain_blocker": {
      const finding = snapshot.findings.find((item) => item.code === validated.arguments.code);
      if (!finding) return result({ status: "unavailable", message: "That finding is not present in the current records. Refresh the summary before choosing another action.", error: { code: "FINDING_NOT_CURRENT", retryable: false } }, contextVersion);
      return completed(finding.explanation, { finding: projectFinding(finding), nextAction: findingAction(finding) }, "Current domain finding");
    }
    case "compare_claim_options": return completed("Comparison of recorded demo checks only. Unknown is not eligible or ineligible; no legal or live-provider assurance is made.", {
      options: validated.arguments.workflows.map((workflow) => readiness(snapshot, workflow)),
    }, "Existing domain findings and allowlisted workflow entries");
    default: return result({ status: "unavailable", message: "This tool has no read handler.", error: { code: "READ_TOOL_NOT_IMPLEMENTED", retryable: false } }, contextVersion);
  }
}
