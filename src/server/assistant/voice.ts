import "server-only";

import OpenAI from "openai";

export const VOICE_AUDIO_MAX_BYTES = 8_000_000;

export const VOICE_AUDIO_TYPES = [
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
] as const;

const VOICE_CONFIGURATION_ERROR = "Voice service is not configured.";
const DEFAULT_TTS_MODEL = "gpt-4o-mini-tts";
const DEFAULT_TTS_VOICE = "cedar";
const LEGACY_TTS_DEFAULT_VOICE = "onyx";
const LEGACY_TTS_MODELS = new Set(["tts-1", "tts-1-hd"]);
const TTS_VOICES = new Set([
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "fable",
  "nova",
  "onyx",
  "sage",
  "shimmer",
  "verse",
  "marin",
  "cedar",
]);
const LEGACY_TTS_VOICES = new Set([
  "alloy",
  "ash",
  "coral",
  "echo",
  "fable",
  "nova",
  "onyx",
  "sage",
  "shimmer",
]);

function readSetting(env: Record<string, string | undefined>, name: string, fallback: string): string {
  return env[name]?.trim() || fallback;
}

export function readAssistantTtsConfig(env: Record<string, string | undefined>): { model: string; voice: string } {
  const model = readSetting(env, "OPENAI_TTS_MODEL", DEFAULT_TTS_MODEL);
  const voice = readSetting(
    env,
    "OPENAI_TTS_VOICE",
    LEGACY_TTS_MODELS.has(model) ? LEGACY_TTS_DEFAULT_VOICE : DEFAULT_TTS_VOICE,
  );

  if (!TTS_VOICES.has(voice)) throw new Error(`Unsupported TTS voice: ${voice}`);
  if (LEGACY_TTS_MODELS.has(model) && !LEGACY_TTS_VOICES.has(voice)) {
    throw new Error(`TTS voice ${voice} is not supported by ${model}.`);
  }

  return { model, voice };
}

export function validateAssistantAudio(file: File): void {
  const mediaType = file.type.split(";", 1)[0]?.trim().toLowerCase();
  if (!VOICE_AUDIO_TYPES.includes(mediaType as (typeof VOICE_AUDIO_TYPES)[number])) {
    throw new Error("Unsupported audio type.");
  }
  if (file.size > VOICE_AUDIO_MAX_BYTES) {
    throw new Error("Audio exceeds the maximum size of 8,000,000 bytes.");
  }
}

export function toSpeechText(markdown: string): string {
  return markdown
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_~`]/g, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*#{1,6}\s+/gm, "")
    .replace(/\n+/g, ". ")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.!?;:])/g, "$1")
    .trim()
    .slice(0, 1_500);
}

function requireApiKey(): string {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error(VOICE_CONFIGURATION_ERROR);
  return apiKey;
}

export async function transcribeAssistantAudio(file: File): Promise<string> {
  validateAssistantAudio(file);
  const client = new OpenAI({ apiKey: requireApiKey() });
  const response = await client.audio.transcriptions.create({
    file,
    model: process.env.OPENAI_TRANSCRIBE_MODEL?.trim() || "gpt-4o-mini-transcribe",
  });
  return response.text.trim();
}

export async function synthesizeAssistantSpeech(text: string): Promise<ArrayBuffer> {
  const apiKey = requireApiKey();
  const { model, voice } = readAssistantTtsConfig(process.env);
  const client = new OpenAI({ apiKey });
  const response = await client.audio.speech.create({
    input: toSpeechText(text),
    model,
    voice,
    response_format: "mp3",
  });
  return response.arrayBuffer();
}
