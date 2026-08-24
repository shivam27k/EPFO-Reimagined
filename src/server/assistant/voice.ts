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
  const client = new OpenAI({ apiKey: requireApiKey() });
  const response = await client.audio.speech.create({
    input: toSpeechText(text),
    model: process.env.OPENAI_TTS_MODEL?.trim() || "gpt-4o-mini-tts",
    voice: process.env.OPENAI_TTS_VOICE?.trim() || "coral",
    response_format: "mp3",
  });
  return response.arrayBuffer();
}
