import { finding } from "./findings";
import type { Finding, MemberSnapshot } from "./types";

export function normalizeName(name: string): string {
  return name
    .normalize("NFKC")
    .toLocaleLowerCase("en-IN")
    .replace(/[\p{P}\p{S}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function evaluateOnboarding(snapshot: MemberSnapshot): Finding[] {
  const aadhaarName = normalizeName(snapshot.profile.aadhaarName);
  const bankName = normalizeName(snapshot.profile.bankName);
  const panName = normalizeName(snapshot.profile.panName);
  const findings: Finding[] = [];

  if (aadhaarName !== bankName) {
    findings.push(
      finding({
        code: "BANK_NAME_MISMATCH",
        severity: "BLOCKER",
        owner: "BANK",
        title: "Bank name does not match Aadhaar",
        explanation:
          "The bank account holder name must match the member identity after deterministic normalization.",
        allowedActions: ["UPDATE_BANK_DETAILS", "VERIFY_BANK_KYC"],
      }),
    );
  }

  if (aadhaarName !== panName) {
    findings.push(
      finding({
        code: "PAN_NAME_MISMATCH",
        severity: "BLOCKER",
        owner: "MEMBER",
        title: "PAN name does not match Aadhaar",
        explanation:
          "The name entered for PAN must match the Aadhaar-linked member identity for KYC to complete.",
        allowedActions: ["UPDATE_PAN_DETAILS", "REQUEST_BASIC_DETAILS_CORRECTION"],
      }),
    );
  }

  return findings;
}
