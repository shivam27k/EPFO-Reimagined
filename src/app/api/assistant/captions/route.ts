import { z } from "zod";
import { conversationMessages } from "@/db/schema";
import { actionTransaction, hash, nowIso } from "@/server/assistant/action-contracts";
import { assistantHttpError, assistantJson, opaqueReference, requireAssistantRequest } from "@/server/assistant/http";
import { redactModelText } from "@/server/assistant/model-text";

export const runtime = "nodejs";
// Assistant conversation content only. User turns use /turns, never this route.
const schema = z.object({ sessionId: opaqueReference, itemId: opaqueReference,
  text: z.string().min(1).max(2000), interrupted: z.boolean() }).strict();
export async function POST(request: Request) {
  try {
    const current = await requireAssistantRequest(request);
    const input = schema.parse(await request.json());
    const runId = current.demoRun.id;
    await actionTransaction(runId, async (tx) => {
      await tx.insert(conversationMessages).values({
        id: "voice-caption-" + hash({ runId, sessionId: input.sessionId, itemId: input.itemId }),
        demoRunId: runId, role: "assistant", createdAt: nowIso(),
        content: "ASSISTANT_JSON:" + JSON.stringify({
          text: "[Voice conversation caption; client-reported, not authorization" +
            (input.interrupted ? "; interrupted, playback not established" : "; playback not verified") +
            "] " + redactModelText(input.text, runId),
          source: "openai", actions: [],
        }),
      }).onConflictDoNothing();
    });
    return assistantJson({ stored: true });
  } catch (error) { return assistantHttpError(error); }
}
