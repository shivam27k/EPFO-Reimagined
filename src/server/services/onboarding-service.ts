import { eq } from "drizzle-orm";

import { ensureDatabaseReady, getDb } from "@/db/client";
import { employments, kycRecords, memberProfiles, onboardingDrafts } from "@/db/schema";
import {
  onboardingDraftRequestSchema,
  onboardingRequestSchema,
  type OnboardingDraftInput,
  type OnboardingDraftDto,
  type OnboardingInput,
} from "@/domain/onboarding-schema";
import { evaluateOnboarding } from "@/domain/onboarding-rules";
import type { MemberSnapshot as RuleSnapshot } from "@/domain/types";
import { getMemberSnapshot } from "@/server/repositories/member-repository";
import { assertNewMemberRun } from "@/server/services/persona-guard";
import type { FormFieldProposal, FormPatchScope } from "@/server/assistant/form-copilot";
import { onboardingSteps, processDefinitions, type OnboardingQuestionKey } from "@/domain/process-definitions";

export { onboardingRequestSchema } from "@/domain/onboarding-schema";

type OnboardingTransaction = Parameters<
  Parameters<ReturnType<typeof getDb>["transaction"]>[0]
>[0];

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

function maskPan(value: string) {
  return `******${lastCharacters(value, 5)}`;
}

function maskBankAccount(value: string) {
  return `BANK ****${lastCharacters(value)}`;
}

export const CANONICAL_DEMO_AADHAAR_MASK = "XXXX-XXXX-9087";

function onboardingFindings(input: OnboardingInput) {
  const ruleSnapshot: RuleSnapshot = {
    demoRunId: "validated-onboarding-input",
    persona: "NEW_MEMBER",
    profile: {
      uan: input.uan,
      aadhaarName: input.aadhaarName,
      bankName: input.bankName,
      panName: input.panName,
      dateOfBirth: input.dateOfBirth,
      mobileMasked: `+91 ******${lastCharacters(input.mobileNumber)}`,
      onboardingComplete: false,
    },
    findings: [],
  };

  return evaluateOnboarding(ruleSnapshot);
}

export async function persistOnboarding(
  tx: OnboardingTransaction,
  demoRunId: string,
  input: OnboardingInput,
) {
  await assertNewMemberRun(tx, demoRunId);
  const now = new Date().toISOString();
  const findings = onboardingFindings(input);
  const onboardingComplete = !findings.some((finding) => finding.severity === "BLOCKER");

  await tx
    .insert(memberProfiles)
    .values({
      demoRunId,
      uan: maskUan(input.uan),
      aadhaarName: input.aadhaarName,
      bankName: input.bankName,
      panName: input.panName,
      dateOfBirth: input.dateOfBirth,
      mobileMasked: `+91 ******${lastCharacters(input.mobileNumber)}`,
      onboardingComplete,
    })
    .onConflictDoUpdate({
      target: memberProfiles.demoRunId,
      set: {
        uan: maskUan(input.uan),
        aadhaarName: input.aadhaarName,
        bankName: input.bankName,
        panName: input.panName,
        dateOfBirth: input.dateOfBirth,
        mobileMasked: `+91 ******${lastCharacters(input.mobileNumber)}`,
        onboardingComplete,
      },
    });

  const employmentId = `${demoRunId}:employment:onboarding`;
  await tx
    .insert(employments)
    .values({
      id: employmentId,
      demoRunId,
      memberId: maskMemberId(input.memberId),
      establishmentName: input.establishmentName,
      joinedAt: input.joinedAt,
      exitedAt: null,
      epfMember: input.epfMember,
      epsMember: input.epsMember,
    })
    .onConflictDoUpdate({
      target: employments.id,
      set: {
        memberId: maskMemberId(input.memberId),
        establishmentName: input.establishmentName,
        joinedAt: input.joinedAt,
        epfMember: input.epfMember,
        epsMember: input.epsMember,
      },
    });

  const records = [
    {
      id: `${demoRunId}:kyc:aadhaar`,
      demoRunId,
      type: "AADHAAR" as const,
      valueMasked: CANONICAL_DEMO_AADHAAR_MASK,
      status: "VERIFIED" as const,
      updatedAt: now,
    },
    {
      id: `${demoRunId}:kyc:pan`,
      demoRunId,
      type: "PAN" as const,
      valueMasked: maskPan(input.panNumber),
      status: findings.some((finding) => finding.code === "PAN_NAME_MISMATCH")
        ? ("MISMATCH" as const)
        : ("VERIFIED" as const),
      updatedAt: now,
    },
    {
      id: `${demoRunId}:kyc:bank`,
      demoRunId,
      type: "BANK" as const,
      valueMasked: `${maskBankAccount(input.bankAccountNumber)} · IFSC ${input.bankIfsc}`,
      status: findings.some((finding) => finding.code === "BANK_NAME_MISMATCH")
        ? ("MISMATCH" as const)
        : ("VERIFIED" as const),
      updatedAt: now,
    },
  ];

  for (const record of records) {
    await tx.insert(kycRecords).values(record).onConflictDoUpdate({
      target: kycRecords.id,
      set: {
        valueMasked: record.valueMasked,
        status: record.status,
        updatedAt: record.updatedAt,
      },
    });
  }
}

export async function saveOnboarding(demoRunId: string, rawInput: unknown) {
  const input = onboardingRequestSchema.parse(rawInput);
  await ensureDatabaseReady();
  await getDb().transaction(async (tx) => {
    await persistOnboarding(tx, demoRunId, input);
    await persistOnboardingDraft(tx, demoRunId, {
      demoDisclosureAccepted: true,
      currentStep: 3,
      values: input,
    });
  });
  return getMemberSnapshot(demoRunId);
}

export async function saveOnboardingInTransaction(
  tx: OnboardingTransaction,
  demoRunId: string,
  rawInput: unknown,
) {
  const input = onboardingRequestSchema.parse(rawInput);
  await persistOnboarding(tx, demoRunId, input);
  return input;
}

function safeDraftValues(values: OnboardingDraftInput["values"]) {
  return {
    aadhaarName: values.aadhaarName,
    dateOfBirth: values.dateOfBirth,
    establishmentName: values.establishmentName,
    joinedAt: values.joinedAt,
    epfMember: values.epfMember,
    epsMember: values.epsMember,
    panName: values.panName,
    bankName: values.bankName,
    bankIfsc: values.bankIfsc,
  };
}

async function persistOnboardingDraft(
  tx: OnboardingTransaction,
  demoRunId: string,
  input: OnboardingDraftInput,
) {
  await assertNewMemberRun(tx, demoRunId);
  const values = input.values;
  const row = {
    demoRunId,
    currentStep: input.currentStep,
    disclosureAccepted: true,
    valuesJson: JSON.stringify(safeDraftValues(values)),
    uanMasked: values.uan ? maskUan(values.uan) : null,
    mobileMasked: values.mobileNumber
      ? `+91 ******${lastCharacters(values.mobileNumber)}`
      : null,
    memberIdMasked: values.memberId ? maskMemberId(values.memberId) : null,
    panMasked: values.panNumber ? maskPan(values.panNumber) : null,
    bankAccountMasked: values.bankAccountNumber
      ? maskBankAccount(values.bankAccountNumber)
      : null,
    updatedAt: new Date().toISOString(),
  };
  await tx.insert(onboardingDrafts).values(row).onConflictDoUpdate({
    target: onboardingDrafts.demoRunId,
    set: row,
  });
}

function draftDto(row: typeof onboardingDrafts.$inferSelect): OnboardingDraftDto {
  return {
    currentStep: row.currentStep,
    disclosureAccepted: row.disclosureAccepted,
    values: JSON.parse(row.valuesJson) as OnboardingDraftDto["values"],
    maskedValues: {
      uan: row.uanMasked,
      mobileNumber: row.mobileMasked,
      memberId: row.memberIdMasked,
      panNumber: row.panMasked,
      bankAccountNumber: row.bankAccountMasked,
    },
    updatedAt: row.updatedAt,
  };
}

export async function saveOnboardingDraft(demoRunId: string, rawInput: unknown) {
  const input = onboardingDraftRequestSchema.parse(rawInput);
  await ensureDatabaseReady();
  await getDb().transaction((tx) => persistOnboardingDraft(tx, demoRunId, input));
  const [row] = await getDb()
    .select()
    .from(onboardingDrafts)
    .where(eq(onboardingDrafts.demoRunId, demoRunId));
  if (!row) {
    throw new Error("Saved onboarding progress could not be read back.");
  }
  return draftDto(row);
}

export async function getOnboardingDraft(demoRunId: string) {
  await ensureDatabaseReady();
  const [row] = await getDb()
    .select()
    .from(onboardingDrafts)
    .where(eq(onboardingDrafts.demoRunId, demoRunId));
  return row ? draftDto(row) : null;
}

const sensitiveDraftColumns = {
  uan: "uanMasked",
  mobileNumber: "mobileMasked",
  memberId: "memberIdMasked",
  panNumber: "panMasked",
  bankAccountNumber: "bankAccountMasked",
} as const;

function maskedPatchValue(key: keyof typeof sensitiveDraftColumns, value: string) {
  if (key === "uan") return maskUan(value);
  if (key === "mobileNumber") return `+91 ******${lastCharacters(value)}`;
  if (key === "memberId") return maskMemberId(value);
  if (key === "panNumber") return maskPan(value);
  return maskBankAccount(value);
}

export async function applyConfirmedOnboardingPatch(
  demoRunId: string,
  input: { scope: FormPatchScope; section?: string; proposals: FormFieldProposal[] },
) {
  await ensureDatabaseReady();
  return getDb().transaction(async (tx) => {
    await assertNewMemberRun(tx, demoRunId);
    const [existing] = await tx.select().from(onboardingDrafts).where(eq(onboardingDrafts.demoRunId, demoRunId));
    const safeValues = existing ? JSON.parse(existing.valuesJson) as Record<string, unknown> : {};
    const maskedUpdates: Partial<Record<(typeof sensitiveDraftColumns)[keyof typeof sensitiveDraftColumns], string>> = {};

    for (const proposal of input.proposals) {
      const question = processDefinitions.ONBOARDING.questions.find((item) => item.key === proposal.field);
      if (!question) throw new Error(`Field “${proposal.field}” is not available in onboarding.`);
      if (input.scope === "SECTION" && question.step !== input.section) {
        throw new Error("A section patch can only contain fields from the selected section.");
      }
      const key = question.key as OnboardingQuestionKey;
      const rawValue: string | boolean = question.control === "checkbox"
        ? proposal.proposedValue === "true"
        : proposal.proposedValue;
      const parsed = onboardingRequestSchema.shape[key].safeParse(rawValue);
      if (!parsed.success) throw parsed.error;
      if (key in sensitiveDraftColumns) {
        const sensitiveKey = key as keyof typeof sensitiveDraftColumns;
        maskedUpdates[sensitiveDraftColumns[sensitiveKey]] = maskedPatchValue(sensitiveKey, String(parsed.data));
      } else {
        safeValues[key] = parsed.data;
      }
    }

    const now = new Date().toISOString();
    const furthestPatchedStep = Math.max(
      0,
      ...input.proposals.map((proposal) => {
        const question = processDefinitions.ONBOARDING.questions.find((item) => item.key === proposal.field);
        return question ? onboardingSteps.findIndex((step) => step.key === question.step) : 0;
      }),
    );
    const row = {
      demoRunId,
      currentStep: Math.max(existing?.currentStep ?? 0, furthestPatchedStep),
      disclosureAccepted: true,
      valuesJson: JSON.stringify(safeValues),
      uanMasked: maskedUpdates.uanMasked ?? existing?.uanMasked ?? null,
      mobileMasked: maskedUpdates.mobileMasked ?? existing?.mobileMasked ?? null,
      memberIdMasked: maskedUpdates.memberIdMasked ?? existing?.memberIdMasked ?? null,
      panMasked: maskedUpdates.panMasked ?? existing?.panMasked ?? null,
      bankAccountMasked: maskedUpdates.bankAccountMasked ?? existing?.bankAccountMasked ?? null,
      updatedAt: now,
    };
    await tx.insert(onboardingDrafts).values(row).onConflictDoUpdate({ target: onboardingDrafts.demoRunId, set: row });
    return draftDto(row);
  });
}
