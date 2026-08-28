import { describe, expect, it } from "vitest";

type RealtimeVoiceConfig = {
  voice: string;
  turnDetection: Record<string, unknown>;
};

async function getVoiceConfigReader(): Promise<(env: Record<string, string | undefined>) => RealtimeVoiceConfig> {
  const voiceConfigModule = await import("./voice-config") as unknown as Record<string, unknown>;
  const reader = voiceConfigModule.readRealtimeVoiceConfig;
  expect(reader).toBeTypeOf("function");
  return reader as (env: Record<string, string | undefined>) => RealtimeVoiceConfig;
}

describe("Realtime voice configuration", () => {
  it("defaults to cedar with medium semantic VAD and interruption enabled", async () => {
    const readRealtimeVoiceConfig = await getVoiceConfigReader();

    expect(readRealtimeVoiceConfig({})).toEqual({
      voice: "cedar",
      turnDetection: {
        type: "semantic_vad",
        eagerness: "medium",
        create_response: true,
        interrupt_response: true,
      },
    });
  });

  it("accepts supported voice and server VAD overrides while retaining interruption settings", async () => {
    const readRealtimeVoiceConfig = await getVoiceConfigReader();

    expect(readRealtimeVoiceConfig({
      OPENAI_REALTIME_VOICE: "marin",
      OPENAI_REALTIME_VAD: "server_vad",
    })).toEqual({
      voice: "marin",
      turnDetection: {
        type: "server_vad",
        create_response: true,
        interrupt_response: true,
        prefix_padding_ms: 300,
        silence_duration_ms: 1500,
      },
    });
  });

  it("rejects invalid voice and VAD overrides", async () => {
    const readRealtimeVoiceConfig = await getVoiceConfigReader();

    expect(() => readRealtimeVoiceConfig({ OPENAI_REALTIME_VOICE: "not-a-voice" })).toThrow(/voice/i);
    expect(() => readRealtimeVoiceConfig({ OPENAI_REALTIME_VAD: "client_vad" })).toThrow(/vad|turn/i);
  });
});
