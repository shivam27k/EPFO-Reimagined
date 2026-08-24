import { z, ZodError } from "zod";

import { AuthenticationError, requireCurrentRun } from "@/server/auth/session";
import { ClaimBlockedError, advanceFinalSettlementClaim, createFinalSettlementClaim } from "@/server/repositories/claim-repository";

const claimRequestSchema = z.object({
  idempotencyKey: z.string().min(8).max(120),
});

export async function POST(request: Request) {
  try {
    const current = await requireCurrentRun();
    const input = claimRequestSchema.parse(await request.json());
    return Response.json(await createFinalSettlementClaim(current.demoRun.id, input.idempotencyKey));
  } catch (error) {
    if (error instanceof ClaimBlockedError) {
      return Response.json({ error: error.message, blockers: error.blockers }, { status: 409 });
    }
    if (error instanceof AuthenticationError) {
      return Response.json({ error: "Authentication required." }, { status: 401 });
    }
    if (error instanceof ZodError) {
      return Response.json({ error: "Use a valid claim request." }, { status: 422 });
    }
    if (error instanceof SyntaxError) {
      return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }
    throw error;
  }
}

const claimAdvanceSchema = z.object({
  command: z.enum([
    "SIMULATE_TWO_MONTH_WAIT",
    "SIMULATE_CRYPTIC_STATUS",
    "SIMULATE_EPFO_APPROVAL",
    "SIMULATE_PAYMENT_RETURNED",
    "SIMULATE_BANK_PAYMENT",
  ]),
});

export async function PATCH(request: Request) {
  try {
    const current = await requireCurrentRun();
    const input = claimAdvanceSchema.parse(await request.json());
    return Response.json(await advanceFinalSettlementClaim(current.demoRun.id, input.command));
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return Response.json({ error: "Authentication required." }, { status: 401 });
    }
    if (error instanceof ZodError) {
      return Response.json({ error: "Use a supported claim simulation." }, { status: 422 });
    }
    if (error instanceof SyntaxError) {
      return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }
    throw error;
  }
}
