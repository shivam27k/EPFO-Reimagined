import { buildAssistantContext } from "./context";
import { assistantInstructions } from "./instructions";

const REALTIME_CALLS_URL = "https://api.openai.com/v1/realtime/calls";
const DEFAULT_REALTIME_MODEL = "gpt-realtime-2.1-mini";
const DEFAULT_TRANSCRIPTION_MODEL = "gpt-4o-mini-transcribe";
const REALTIME_CONFIGURATION_ERROR = "Realtime voice service is not configured.";
const REALTIME_NEGOTIATION_ERROR = "Realtime call negotiation failed.";

function requireApiKey(): string {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error(REALTIME_CONFIGURATION_ERROR);
  return apiKey;
}

function extractCallId(location: string | null): string | undefined {
  if (!location) return undefined;
  try {
    const match = new URL(location, REALTIME_CALLS_URL).pathname.match(/\/realtime\/calls\/([^/]+)\/?$/);
    return match?.[1];
  } catch {
    return undefined;
  }
}

export async function buildRealtimeSessionConfig({
  demoRunId,
  route,
}: {
  demoRunId: string;
  route: string;
}): Promise<Record<string, unknown>> {
  const context = await buildAssistantContext({ demoRunId, route });
  const maskedScreenContext = {
    route: context.route,
    screen: context.screen,
    member: context.maskedModelSnapshot,
    findings: context.findings,
    activeProcess: context.activeProcess,
    recentConversation: context.recentConversation,
  };

  return {
    type: "realtime",
    model: process.env.OPENAI_REALTIME_MODEL?.trim() || DEFAULT_REALTIME_MODEL,
    output_modalities: ["audio"],
    audio: {
      input: {
        noise_reduction: { type: "near_field" },
        transcription: {
          model: process.env.OPENAI_TRANSCRIBE_MODEL?.trim() || DEFAULT_TRANSCRIPTION_MODEL,
        },
        turn_detection: {
          type: "server_vad",
          create_response: true,
          interrupt_response: true,
          prefix_padding_ms: 300,
          silence_duration_ms: 500,
        },
      },
      output: { voice: "coral" },
    },
    instructions: [
      assistantInstructions,
      "Current masked portal context (synthetic data only):",
      JSON.stringify(maskedScreenContext),
    ].join("\n\n"),
  };
}

export async function createRealtimeCall({
  sdp,
  config,
}: {
  sdp: string;
  config: Record<string, unknown>;
}): Promise<{ sdp: string; callId?: string }> {
  const form = new FormData();
  form.set("sdp", sdp);
  form.set("session", JSON.stringify(config));

  const response = await fetch(REALTIME_CALLS_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${requireApiKey()}` },
    body: form,
  });

  if (!response.ok) throw new Error(REALTIME_NEGOTIATION_ERROR);
  const answerSdp = await response.text();
  if (!answerSdp.trim()) throw new Error(REALTIME_NEGOTIATION_ERROR);

  const callId = extractCallId(response.headers.get("location"));
  return callId ? { sdp: answerSdp, callId } : { sdp: answerSdp };
}
