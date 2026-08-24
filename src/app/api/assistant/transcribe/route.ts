import { AuthenticationError, requireCurrentRun } from "@/server/auth/session";
import { transcribeAssistantAudio, validateAssistantAudio } from "@/server/assistant/voice";

export async function POST(request: Request) {
  try {
    await requireCurrentRun();
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (error) {
      if (error instanceof TypeError) {
        return Response.json({ error: "Upload audio as multipart form data." }, { status: 400 });
      }
      throw error;
    }
    const audio = formData.get("audio");
    if (!(audio instanceof File)) {
      return Response.json({ error: "Choose an audio recording to transcribe." }, { status: 422 });
    }
    try {
      validateAssistantAudio(audio);
    } catch (error) {
      if (error instanceof Error) {
        return Response.json({ error: "Use a supported audio file no larger than 8 MB." }, { status: 422 });
      }
      throw error;
    }
    const transcript = (await transcribeAssistantAudio(audio)).trim();
    if (!transcript) {
      return Response.json({ error: "No speech was detected. Try recording again." }, { status: 422 });
    }
    return Response.json({ transcript });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return Response.json({ error: "Authentication required." }, { status: 401 });
    }
    return Response.json({ error: "Voice transcription is temporarily unavailable. Text chat remains available." }, { status: 503 });
  }
}
