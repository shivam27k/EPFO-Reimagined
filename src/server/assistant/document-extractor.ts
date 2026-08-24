import type { MemberSnapshot } from "@/domain/member-snapshot";
import { processDefinitions } from "@/domain/process-definitions";
import type { FormFieldProposal } from "./form-copilot";

export type SyntheticDocumentKind = "IDENTITY_RETURN" | "JOINING_LETTER" | "PAN_CARD" | "BANK_STATEMENT";

const syntheticValues: Record<SyntheticDocumentKind, Record<string, string>> = {
  IDENTITY_RETURN: { uan: "100000004321", aadhaarName: "Rohan Mehta", dateOfBirth: "1998-03-14" },
  JOINING_LETTER: {
    establishmentName: "Sahyadri Demo Components Pvt Ltd",
    memberId: "PYBOM00424890000054321",
    joinedAt: "2026-07-01",
    epfMember: "true",
    epsMember: "true",
  },
  PAN_CARD: { panName: "Rohan Mehta", panNumber: "DEMOP4321F" },
  BANK_STATEMENT: {
    bankName: "Rohan Mehta",
    bankAccountNumber: "000000001188",
    bankIfsc: "DEMO0001188",
  },
};

function existingValue(snapshot: MemberSnapshot, field: string) {
  if (field === "uan") return snapshot.profile.uanMasked;
  if (field === "memberId") return snapshot.employments[0]?.memberIdMasked ?? "Not saved";
  if (field === "panNumber") return snapshot.kyc.find((item) => item.type === "PAN")?.valueMasked ?? "Not saved";
  if (field === "bankAccountNumber" || field === "bankIfsc") {
    return snapshot.kyc.find((item) => item.type === "BANK")?.valueMasked ?? "Not saved";
  }
  const profile = snapshot.profile as unknown as Record<string, unknown>;
  return typeof profile[field] === "string" && profile[field] ? String(profile[field]) : "Not saved";
}

export function deterministicSyntheticExtraction(
  kind: SyntheticDocumentKind,
  sourceName: string,
  snapshot: MemberSnapshot,
): FormFieldProposal[] {
  const values = syntheticValues[kind];
  return Object.entries(values).map(([field, proposedValue]) => {
    const question = processDefinitions.ONBOARDING.questions.find((item) => item.key === field);
    if (!question) throw new Error(`Unsupported synthetic extraction field: ${field}`);
    return {
      field,
      label: question.label,
      existingValue: existingValue(snapshot, field),
      proposedValue,
      source: `${sourceName} · local synthetic demo extraction`,
      confidence: kind === "BANK_STATEMENT" ? 0.94 : 0.97,
      validation: "VALID",
      section: question.step,
      sensitive: ["uan", "memberId", "panNumber", "bankAccountNumber"].includes(field),
    };
  });
}
