import { z } from "zod";
import { assistantHttpError, assistantJson, assistantRouteSchema, opaqueReference, requireAssistantRequest } from "@/server/assistant/http";
import { registerDocumentReview } from "@/server/assistant/onboarding-sources";
import { executeServerTool } from "@/server/assistant/tool-executor";

export const runtime = "nodejs";
const schema = z.object({ requestKey: opaqueReference, callId: opaqueReference, route: assistantRouteSchema,
  documentProposalId: opaqueReference, fields: z.array(z.string().min(1).max(80)).min(1).max(30) }).strict();
export async function POST(request: Request) {
  try {
    const current = await requireAssistantRequest(request);
    const input = schema.parse(await request.json());
    const registered = await registerDocumentReview(current.demoRun.id, input);
    return assistantJson(await executeServerTool({ name: "prepare_onboarding_patch",
      arguments: { patch: null, documentProposalId: registered.documentProposalId, demoDisclosureAccepted: true } },
    { demoRunId: current.demoRun.id, turnId: registered.turnId, callId: input.callId, route: input.route }, { signal: request.signal }));
  } catch (error) { return assistantHttpError(error); }
}
