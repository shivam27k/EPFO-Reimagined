import { z } from "zod";
import { demoActions } from "./portal-actions";

export const persistedProposalSchema = z.object({
  proposalId: z.string(), callId: z.string(), sourceTurnId: z.string(), payloadHash: z.string(),
  contextVersion: z.string(), status: z.enum(["pending", "committed", "cancelled", "expired", "stale", "uncertain"]),
  createdAt: z.string(), expiresAt: z.string(), displayedAt: z.string().nullable(), message: z.string(),
  payload: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("simulation"), action: z.enum(demoActions),
      wageMonth: z.string().nullable(), employmentId: z.string().nullable(), exitDate: z.string().nullable(),
      bankName: z.string().nullable(), claimId: z.string().nullable(), previousClaimStatus: z.string().nullable(), synthetic: z.literal(true) }),
    z.object({ kind: z.literal("onboarding"), source: z.string(), fields: z.array(z.string()),
      values: z.record(z.string(), z.union([z.string(), z.boolean()])), maskedValues: z.record(z.string(), z.string()),
      synthetic: z.literal(true), scope: z.literal("onboarding_draft_only") }),
  ]),
});
export type PersistedProposal = z.infer<typeof persistedProposalSchema>;
