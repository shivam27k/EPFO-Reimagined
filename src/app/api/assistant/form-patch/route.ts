import { assistantHttpError, assistantJson, requireAssistantRequest } from "@/server/assistant/http";

/** Old cards contained caller-authored values and a boolean, not exact consent. */
export async function POST(request: Request) {
  try {
    await requireAssistantRequest(request);
    return assistantJson({
      code: "FRESH_REVIEW_REQUIRED",
      error: "This legacy form proposal cannot be applied. Prepare a fresh stored onboarding proposal, review it, then confirm through /api/assistant/actions.",
    }, 409);
  } catch (error) { return assistantHttpError(error); }
}
