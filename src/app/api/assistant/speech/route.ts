import { AuthenticationError, requireCurrentRun } from "@/server/auth/session";
import { synthesizeAssistantSpeech } from "@/server/assistant/voice";

export async function POST(request: Request) {
  try {
    await requireCurrentRun();
    let body: unknown;
    try {
      body = await request.json();
    } catch (error) {
      if (error instanceof SyntaxError) {
        return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
      }
      throw error;
    }
    const text = typeof body === "object" && body !== null && "text" in body
      ? (body as { text?: unknown }).text
      : undefined;
    if (typeof text !== "string" || !text.trim() || text.length > 1_000) {
      return Response.json({ error: "Speech text must be between 1 and 1,000 characters." }, { status: 422 });
    }
    const audio = await synthesizeAssistantSpeech(text);
    return new Response(audio, {
      headers: {
        "content-type": "audio/mpeg",
        "cache-control": "no-store",
        "content-disposition": 'inline; filename="assistant-speech.mp3"',
      },
    });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return Response.json({ error: "Authentication required." }, { status: 401 });
    }
    return Response.json({ error: "Voice speech is temporarily unavailable. Text chat remains available." }, { status: 503 });
  }
}
