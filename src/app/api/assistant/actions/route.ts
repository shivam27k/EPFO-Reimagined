import { z } from "zod";
import { getActionStatus, getPendingAction, markProposalDisplayed } from "@/server/assistant/action-store";
import { registerUiDecision } from "@/server/assistant/trusted-turns";
import { executeServerTool } from "@/server/assistant/tool-executor";
import { assistantHttpError, assistantJson, assistantRouteSchema, opaqueReference, payloadHashSchema, requireAssistantRequest } from "@/server/assistant/http";
import { requireCurrentRun } from "@/server/auth/session";

export const runtime = "nodejs";
const schema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("displayed"), proposalId: opaqueReference, payloadHash: payloadHashSchema }).strict(),
  z.object({ kind: z.literal("decision"), requestKey: opaqueReference, callId: opaqueReference,
    route: assistantRouteSchema, proposalId: opaqueReference, payloadHash: payloadHashSchema, decision: z.enum(["confirm", "cancel"]) }).strict(),
]);
export async function POST(request: Request) {
  try {
    const current = await requireAssistantRequest(request);
    const input = schema.parse(await request.json());
    if (input.kind === "displayed") return assistantJson({ proposal: await markProposalDisplayed(current.demoRun.id, input.proposalId, input.payloadHash) });
    const turn = await registerUiDecision(current.demoRun.id, {
      requestKey: input.requestKey, route: input.route, proposalId: input.proposalId, payloadHash: input.payloadHash, decision: input.decision,
    });
    const result = await executeServerTool({
      name: input.decision === "confirm" ? "confirm_pending_action" : "cancel_pending_action",
      arguments: { proposalId: input.proposalId, payloadHash: input.payloadHash },
    }, { demoRunId: current.demoRun.id, turnId: turn.turnId, callId: input.callId, route: input.route }, { signal: request.signal });
    return assistantJson({ turnId: turn.turnId, result });
  } catch (error) { return assistantHttpError(error); }
}
// Recovery reads do not spend a model tool turn or create a consent event.
export async function GET(request: Request) {
  try {
    const current = await requireCurrentRun();
    const callId = new URL(request.url).searchParams.get("callId");
    const context = { demoRunId: current.demoRun.id, turnId: "status", callId: "status", route: "/" };
    return assistantJson(callId ? await getActionStatus(context, opaqueReference.parse(callId)) : await getPendingAction(context));
  } catch (error) { return assistantHttpError(error); }
}
