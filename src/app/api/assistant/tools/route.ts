import { z } from "zod";
import { actionTransaction, ActionError } from "@/server/assistant/action-contracts";
import { currentTurnRoute, requireTrustedTurn } from "@/server/assistant/action-store";
import { executeServerTool } from "@/server/assistant/tool-executor";
import { assistantHttpError, assistantJson, opaqueReference, requireAssistantRequest } from "@/server/assistant/http";

export const runtime = "nodejs";
const schema = z.object({
  turnId: opaqueReference, callId: opaqueReference, name: z.string().min(1).max(100),
  arguments: z.union([z.string().max(12000), z.record(z.string(), z.unknown())]),
}).strict();
export async function POST(request: Request) {
  try {
    const current = await requireAssistantRequest(request);
    const input = schema.parse(await request.json());
    const turn = await actionTransaction(current.demoRun.id, (tx) => requireTrustedTurn(tx, { demoRunId: current.demoRun.id, turnId: input.turnId }));
    if (turn.mode !== "voice") throw new ActionError("VOICE_TURN_REQUIRED", "Register the actual voice user transcript separately before executing voice tools.");
    const call = { name: input.name, arguments: input.arguments };
    const context = { demoRunId: current.demoRun.id, turnId: turn.id, callId: input.callId, route: currentTurnRoute(turn) };
    let result = await executeServerTool(call, context, { signal: request.signal });
    if (result.status === "failed" && result.error?.code === "TRANSIENT_READ_FAILURE" && result.error.retryable && !request.signal.aborted) {
      result = await executeServerTool(call, context, { signal: request.signal, readRetry: true });
    }
    return assistantJson(result);
  } catch (error) { return assistantHttpError(error); }
}
