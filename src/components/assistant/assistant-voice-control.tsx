"use client";

import { Mic } from "lucide-react";

import { useAssistantVoice, type AssistantVoiceState } from "./use-assistant-voice";

const statusLabel: Record<AssistantVoiceState, string> = {
  REQUESTING_PERMISSION: "Requesting microphone permission",
  LISTENING: "Listening",
  TRANSCRIBING: "Transcribing",
  THINKING: "Thinking",
  SPEAKING: "Speaking",
  ERROR: "Voice needs attention",
  IDLE: "Ready to listen",
};

export function AssistantVoiceControl({
  active,
  onExit,
  onReturnToText,
  submitTranscript,
}: {
  active: boolean;
  onExit(): void;
  onReturnToText(): void;
  submitTranscript(transcript: string, signal?: AbortSignal): Promise<{ text: string } | null>;
}) {
  const voice = useAssistantVoice({ active, submitTranscript });
  const isListening = voice.state === "LISTENING";
  const isSpeaking = voice.state === "SPEAKING";
  const unavailable = voice.state === "REQUESTING_PERMISSION" || voice.state === "TRANSCRIBING" || voice.state === "THINKING";

  function exit() {
    voice.stop();
    onExit();
  }

  function returnToText() {
    voice.stop();
    onReturnToText();
  }

  return (
    <section aria-label="EPF Sahayak voice mode" className="assistant-voice-control" data-state={voice.state}>
      <header className="assistant-voice-hud-header">
        <p>EPF Sahayak <span>Voice</span></p>
      </header>
      <div className="assistant-voice-presence">
        <div aria-label="EPF Sahayak microphone" className="assistant-voice-orb" role="img"><Mic aria-hidden="true" size={30} /></div>
        <strong aria-live="polite" className="assistant-voice-status" role="status">{statusLabel[voice.state]}</strong>
      </div>
      <div aria-label="Voice caption" className="assistant-voice-caption" role="group">
        {!voice.transcript && !voice.answer && !voice.error ? <p>Speak a question about this page. Your answer will stay visible in text.</p> : null}
        {voice.transcript ? <p><strong>You said:</strong> {voice.transcript}</p> : null}
        {voice.answer ? <p><strong>EPF Sahayak:</strong> {voice.answer}</p> : null}
        {voice.error ? <p role="alert">{voice.error}</p> : null}
      </div>
      <div aria-label="Voice controls" className="assistant-voice-controls" role="group">
        {isListening ? <button className="assistant-voice-state-action" disabled={!active} onClick={voice.stopListening} type="button">Stop listening</button> : null}
        {isSpeaking ? <button className="assistant-voice-state-action" disabled={!active} onClick={voice.stopSpeaking} type="button">Stop playback</button> : null}
        {!isListening && !isSpeaking && !unavailable && voice.state !== "ERROR" ? <button className="assistant-voice-state-action" disabled={!active} onClick={() => void voice.startListening()} type="button">Start listening</button> : null}
        {voice.state === "ERROR" ? <button className="assistant-voice-state-action" disabled={!active} onClick={voice.retry} type="button">Retry voice</button> : null}
        <button disabled={!active} onClick={returnToText} type="button">Open text chat</button>
        <button disabled={!active} onClick={exit} type="button">End voice mode</button>
      </div>
    </section>
  );
}
