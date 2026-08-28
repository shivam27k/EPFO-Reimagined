import { beforeEach, describe, expect, it, vi } from "vitest";

const { openAiMock } = vi.hoisted(() => ({ openAiMock: vi.fn() }));

vi.mock("openai", () => ({ default: openAiMock }));

import {
  VOICE_AUDIO_MAX_BYTES,
  toSpeechText,
  validateAssistantAudio,
  synthesizeAssistantSpeech,
  transcribeAssistantAudio,
} from "./voice";

type AssistantTtsConfig = { model: string; voice: string };

async function getTtsConfigReader(): Promise<(env: Record<string, string | undefined>) => AssistantTtsConfig> {
  const voiceModule = await import("./voice") as unknown as Record<string, unknown>;
  const reader = voiceModule.readAssistantTtsConfig;
  expect(reader).toBeTypeOf("function");
  return reader as (env: Record<string, string | undefined>) => AssistantTtsConfig;
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_TRANSCRIBE_MODEL;
  delete process.env.OPENAI_TTS_MODEL;
  delete process.env.OPENAI_TTS_VOICE;
});

describe("assistant voice validation", () => {
  it("accepts a supported browser audio type with codec parameters", () => {
    const file = new File([new Uint8Array([1])], "voice.webm", {
      type: "audio/webm;codecs=opus",
    });

    expect(() => validateAssistantAudio(file)).not.toThrow();
  });

  it("rejects unsupported audio types", () => {
    const file = new File([new Uint8Array([1])], "voice.ogg", { type: "audio/ogg" });

    expect(() => validateAssistantAudio(file)).toThrow(/unsupported audio/i);
  });

  it("rejects audio larger than the maximum size", () => {
    const file = new File([new Uint8Array(VOICE_AUDIO_MAX_BYTES + 1)], "voice.webm", {
      type: "audio/webm",
    });

    expect(() => validateAssistantAudio(file)).toThrow(/8,000,000|maximum|size/i);
  });
});

describe("assistant speech text", () => {
  it("converts supported markdown to concise plain speech", () => {
    expect(toSpeechText("**Next step:** [Open Claims](/claims)\n- Review bank details")).toBe(
      "Next step: Open Claims. Review bank details",
    );
  });
});

describe("recorded TTS configuration", () => {
  it("defaults to cedar on gpt-4o-mini-tts without reading Realtime settings", async () => {
    const readAssistantTtsConfig = await getTtsConfigReader();

    expect(readAssistantTtsConfig({
      OPENAI_REALTIME_VOICE: "not-a-realtime-voice",
      OPENAI_REALTIME_VAD: "client_vad",
    })).toEqual({ model: "gpt-4o-mini-tts", voice: "cedar" });
  });

  it("preserves supported explicit current and legacy voice overrides", async () => {
    const readAssistantTtsConfig = await getTtsConfigReader();

    expect(readAssistantTtsConfig({ OPENAI_TTS_VOICE: "marin" })).toEqual({
      model: "gpt-4o-mini-tts",
      voice: "marin",
    });
    expect(readAssistantTtsConfig({
      OPENAI_TTS_MODEL: "tts-1",
      OPENAI_TTS_VOICE: "coral",
    })).toEqual({ model: "tts-1", voice: "coral" });
  });

  it("uses onyx when an explicit legacy TTS model has no voice override", async () => {
    const readAssistantTtsConfig = await getTtsConfigReader();

    expect(readAssistantTtsConfig({ OPENAI_TTS_MODEL: "tts-1-hd" })).toEqual({
      model: "tts-1-hd",
      voice: "onyx",
    });
  });

  it("uses onyx when a copied example leaves the voice blank for a legacy model", async () => {
    const readAssistantTtsConfig = await getTtsConfigReader();

    expect(readAssistantTtsConfig({
      OPENAI_TTS_MODEL: "tts-1",
      OPENAI_TTS_VOICE: "",
    })).toEqual({ model: "tts-1", voice: "onyx" });
  });

  it("rejects unsupported presets and voices that legacy TTS models cannot use", async () => {
    const readAssistantTtsConfig = await getTtsConfigReader();

    expect(() => readAssistantTtsConfig({ OPENAI_TTS_VOICE: "not-a-voice" })).toThrow(/voice/i);
    expect(() => readAssistantTtsConfig({
      OPENAI_TTS_MODEL: "tts-1",
      OPENAI_TTS_VOICE: "cedar",
    })).toThrow(/tts-1|voice/i);
  });
});

describe("OpenAI voice adapters", () => {
  it("uses the default transcription model and keeps configuration server-side", async () => {
    process.env.OPENAI_API_KEY = "server-only-key";
    const create = vi.fn().mockResolvedValue({ text: "  Where is my claim?  " });
    openAiMock.mockImplementation(function () {
      return { audio: { transcriptions: { create } } };
    });

    await expect(
      transcribeAssistantAudio(new File([new Uint8Array([1])], "voice.webm", { type: "audio/webm" })),
    ).resolves.toBe("Where is my claim?");

    expect(openAiMock).toHaveBeenCalledWith({ apiKey: "server-only-key" });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ model: "gpt-4o-mini-transcribe" }));
  });

  it("uses configurable transcription and speech models and voice", async () => {
    process.env.OPENAI_API_KEY = "server-only-key";
    process.env.OPENAI_TRANSCRIBE_MODEL = "custom-transcribe";
    process.env.OPENAI_TTS_MODEL = "custom-tts";
    process.env.OPENAI_TTS_VOICE = "sage";
    const transcriptionCreate = vi.fn().mockResolvedValue({ text: "Question" });
    const speechCreate = vi.fn().mockResolvedValue({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(2)) });
    openAiMock.mockImplementation(function () {
      return {
        audio: { transcriptions: { create: transcriptionCreate }, speech: { create: speechCreate } },
      };
    });

    await transcribeAssistantAudio(new File([new Uint8Array([1])], "voice.mp4", { type: "audio/mp4" }));
    await expect(synthesizeAssistantSpeech("**Answer**")).resolves.toBeInstanceOf(ArrayBuffer);

    expect(transcriptionCreate).toHaveBeenCalledWith(expect.objectContaining({ model: "custom-transcribe" }));
    expect(speechCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: "custom-tts", voice: "sage", input: "Answer" }),
    );
  });

  it("uses the cedar default without upgrading the recorded TTS model", async () => {
    process.env.OPENAI_API_KEY = "server-only-key";
    const speechCreate = vi.fn().mockResolvedValue({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(2)) });
    openAiMock.mockImplementation(function () {
      return { audio: { speech: { create: speechCreate } } };
    });

    await synthesizeAssistantSpeech("Answer");

    expect(speechCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: "gpt-4o-mini-tts", voice: "cedar" }),
    );
  });

  it("uses the compatible onyx fallback for an explicit legacy TTS model", async () => {
    process.env.OPENAI_API_KEY = "server-only-key";
    process.env.OPENAI_TTS_MODEL = "tts-1";
    const speechCreate = vi.fn().mockResolvedValue({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(2)) });
    openAiMock.mockImplementation(function () {
      return { audio: { speech: { create: speechCreate } } };
    });

    await synthesizeAssistantSpeech("Answer");

    expect(speechCreate).toHaveBeenCalledWith(
      expect.objectContaining({ model: "tts-1", voice: "onyx" }),
    );
  });

  it("clamps speech input and fails safely when the key is absent", async () => {
    process.env.OPENAI_API_KEY = "server-only-key";
    const speechCreate = vi.fn().mockResolvedValue({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(1)) });
    openAiMock.mockImplementation(function () {
      return { audio: { speech: { create: speechCreate } } };
    });
    await synthesizeAssistantSpeech("x".repeat(2_000));
    expect((speechCreate.mock.calls[0][0] as { input: string }).input).toHaveLength(1_500);

    delete process.env.OPENAI_API_KEY;
    await expect(synthesizeAssistantSpeech("hello")).rejects.toThrow("Voice service is not configured.");
  });
});
