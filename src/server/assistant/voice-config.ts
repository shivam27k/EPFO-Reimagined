import "server-only";

const REALTIME_VOICES = new Set([
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "sage",
  "shimmer",
  "verse",
  "marin",
  "cedar",
]);

const REALTIME_VADS = new Set(["semantic_vad", "server_vad"]);

function readSetting(env: Record<string, string | undefined>, name: string, fallback: string): string {
  return env[name]?.trim() || fallback;
}

export function readRealtimeVoiceConfig(env: Record<string, string | undefined>): {
  voice: string;
  turnDetection: Record<string, unknown>;
} {
  const voice = readSetting(env, "OPENAI_REALTIME_VOICE", "cedar");
  if (!REALTIME_VOICES.has(voice)) throw new Error(`Unsupported Realtime voice: ${voice}`);

  const vad = readSetting(env, "OPENAI_REALTIME_VAD", "semantic_vad");
  if (!REALTIME_VADS.has(vad)) throw new Error(`Unsupported Realtime VAD: ${vad}`);

  if (vad === "server_vad") {
    return {
      voice,
      turnDetection: {
        type: "server_vad",
        create_response: false,
        interrupt_response: false,
        prefix_padding_ms: 300,
        silence_duration_ms: 1500,
      },
    };
  }

  return {
    voice,
    turnDetection: {
      type: "semantic_vad",
      eagerness: "medium",
      create_response: false,
      interrupt_response: false,
    },
  };
}
