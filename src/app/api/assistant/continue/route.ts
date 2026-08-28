import { z } from "zod";
import { uiObservationSchema } from "@/domain/assistant-ui";
import { assistantHttpError, assistantJson, opaqueReference, requireAssistantRequest } from "@/server/assistant/http";
import { cancelContinuation, consumeContinuation } from "@/server/assistant/continuation-store";
import { appendObservedOutput, runAssistantTurn } from "@/server/assistant/turn-orchestrator";
import { storeAssistantExchange } from "@/server/assistant/assistant-store";

export const runtime = "nodejs";
const schema = z.object({ continuationId: opaqueReference, observation: uiObservationSchema }).strict();
export async function POST(request: Request) {
  try {
    const current = await requireAssistantRequest(request);
    const input = schema.parse(await request.json());
    const { payload, result } = await consumeContinuation(current.demoRun.id, input.continuationId, input.observation);
    if (payload.kind === "voice") return assistantJson(result);
    appendObservedOutput(payload.state, result, payload.request);
    const reply = await runAssistantTurn({ demoRunId: current.demoRun.id, route: payload.state.route,
      turnId: payload.state.turnId, message: payload.state.message, signal: request.signal }, payload.state);
    if (!reply.continuationId) {
      try { await storeAssistantExchange(current.demoRun.id, payload.state.message, reply); }
      catch { return assistantJson({ ...reply, historyStored: false }); }
    }
    return assistantJson(reply);
  } catch (error) { return assistantHttpError(error); }
}
export async function DELETE(request: Request) {
  try {
    const current = await requireAssistantRequest(request);
    const input = z.object({ continuationId: opaqueReference }).strict().parse(await request.json());
    await cancelContinuation(current.demoRun.id, input.continuationId);
    return assistantJson({ cancelled: true });
  } catch (error) { return assistantHttpError(error); }
}
