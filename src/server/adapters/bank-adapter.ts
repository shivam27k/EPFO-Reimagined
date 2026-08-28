import { and, eq } from "drizzle-orm";

import { ensureDatabaseReady, getDb } from "@/db/client";
import { kycRecords, memberProfiles, scenarioRuns } from "@/db/schema";
import { recordExternalEvent } from "./event-log";
import type { ExternalEventResult, VerifyBankAccountCommand } from "./types";
import type { ActionTransaction } from "@/server/assistant/action-contracts";

export const bankAdapter = {
  async execute(command: VerifyBankAccountCommand): Promise<ExternalEventResult> {
    await ensureDatabaseReady();
    return getDb().transaction((tx) => verifyBankInTransaction(tx, command));
  },
};

export async function verifyBankInTransaction(tx: ActionTransaction, command: VerifyBankAccountCommand): Promise<ExternalEventResult> {
    const recordedAt = "2026-08-02T10:35:00.000Z";
      const rows = await tx
        .select({ status: kycRecords.status, type: kycRecords.type })
        .from(kycRecords)
        .where(eq(kycRecords.demoRunId, command.demoRunId));
      const previousBank = rows.find((row) => row.type === "BANK");
      if (!previousBank) throw new Error("Bank record not found for this demo run.");
      const result: ExternalEventResult = {
        actor: "BANK",
        eventType: "VERIFY_BANK_ACCOUNT",
        previousState: { bankStatus: previousBank?.status ?? "UNKNOWN" },
        newState: { bankStatus: "VERIFIED" },
        explanation: "A simulated bank verification can update bank readiness, but it cannot resolve employer-owned exit-date records.",
        simulated: true,
      };

      await tx
        .update(kycRecords)
        .set({ status: "VERIFIED", updatedAt: recordedAt })
        .where(and(eq(kycRecords.demoRunId, command.demoRunId), eq(kycRecords.type, "BANK")));
      const [profile] = await tx
        .select({ aadhaarName: memberProfiles.aadhaarName })
        .from(memberProfiles)
        .where(eq(memberProfiles.demoRunId, command.demoRunId));
      if (!profile) {
        throw new Error("Member profile not found for this demo run.");
      }
      await tx
        .update(memberProfiles)
        .set({ bankName: profile.aadhaarName })
        .where(eq(memberProfiles.demoRunId, command.demoRunId));
      await tx
        .update(scenarioRuns)
        .set({ stage: "RESOLVED", updatedAt: recordedAt })
        .where(and(
          eq(scenarioRuns.demoRunId, command.demoRunId),
          eq(scenarioRuns.scenarioKey, "CLAIM_BANK_NAME_MISMATCH"),
        ));
      await recordExternalEvent(tx, command.demoRunId, result, recordedAt);
      return result;
}
