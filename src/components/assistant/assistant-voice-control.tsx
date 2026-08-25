"use client";

import { Mic } from "lucide-react";

import { SafeBilingualText } from "./assistant-language";
import { useAssistantVoice, type AssistantVoiceCaption, type AssistantVoiceState } from "./use-assistant-voice";

export type { AssistantVoiceCaption } from "./use-assistant-voice";

const statusLabel: Record<AssistantVoiceState, string> = {
  CONNECTING: "Connecting",
  LISTENING: "Listening",
  SPEAKING: "Speaking",
  RECONNECTING: "Reconnecting",
  ERROR: "Voice needs attention",
  IDLE: "Ready for voice",
};

type AssistantVoiceControlProps = {
  active: boolean;
  contextVersion: string;
  route: string;
  onExit(): void;
  onReturnToText(captions: AssistantVoiceCaption[]): void;
};

export function AssistantVoiceControl(props: AssistantVoiceControlProps) {
  const { active, contextVersion, onExit, onReturnToText, route } = props;
  const voice = useAssistantVoice({ active, contextVersion, route });
  const isSpeaking = voice.state === "SPEAKING";

  function exit() {
    voice.stop();
    onExit();
  }

  function returnToText() {
    voice.stop();
    onReturnToText(voice.handoffCaptions);
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
        {!voice.transcript && !voice.answer && !voice.error ? <p>Speak naturally about this page. You can interrupt while EPF Sahayak is speaking.</p> : null}
        {voice.transcript ? <p><strong>You said:</strong> <SafeBilingualText text={voice.transcript} /></p> : null}
        {voice.answer ? <p><strong>EPF Sahayak:</strong> <SafeBilingualText text={voice.answer} /></p> : null}
        {voice.error ? <p role="alert">{voice.error}</p> : null}
      </div>
      <div aria-label="Voice controls" className="assistant-voice-controls" role="group">
        {isSpeaking ? <button className="assistant-voice-state-action" disabled={!active} onClick={voice.stopSpeaking} type="button">Stop playback</button> : null}
        {voice.state === "IDLE" ? <button className="assistant-voice-state-action" disabled={!active} onClick={voice.startListening} type="button">Start voice</button> : null}
        {voice.state === "ERROR" ? <button className="assistant-voice-state-action" disabled={!active} onClick={voice.retry} type="button">Retry voice</button> : null}
        <button disabled={!active} onClick={returnToText} type="button">Open text chat</button>
        <button disabled={!active} onClick={exit} type="button">End voice mode</button>
      </div>
    </section>
  );
}
