"use client";

import { Keyboard, Mic, Paperclip, X } from "lucide-react";
import { useEffect, useRef } from "react";

import type { ToolResult } from "@/domain/assistant-tools";
import type { ObserveUi } from "./assistant-transport";
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
  documentOpen?: boolean;
  onToggleDocument?(): void;
  onUiRequest: ObserveUi;
  onToolResult: (result: ToolResult, current?: boolean) => void;
  cancellationVersion: number;
  onExit(): void;
  onReturnToText(captions: AssistantVoiceCaption[]): void;
};

export function AssistantVoiceControl(props: AssistantVoiceControlProps) {
  const { active, contextVersion, documentOpen = false, onExit, onReturnToText, onToggleDocument, onUiRequest, onToolResult, cancellationVersion, route } = props;
  const voice = useAssistantVoice({ active, contextVersion, onUiRequest, onToolResult, cancellationVersion, route });
  const captionRef = useRef<HTMLDivElement>(null);
  const isSpeaking = voice.state === "SPEAKING";
  const isError = voice.state === "ERROR";
  const orbInteractive = isSpeaking || isError;

  useEffect(() => {
    const caption = captionRef.current;
    if (caption) caption.scrollTop = caption.scrollHeight;
  }, [voice.answer, voice.error, voice.transcript]);

  function exit() {
    voice.stop();
    onExit();
  }

  function returnToText() {
    voice.stop();
    onReturnToText(voice.handoffCaptions);
  }

  function activateOrb() {
    if (isSpeaking) voice.stopSpeaking();
    else if (isError) voice.retry();
  }

  return (
    <section aria-label="EPF Sahayak voice mode" className="assistant-voice-control" data-state={voice.state}>
      <div className="assistant-voice-stage">
        <p className="assistant-voice-eyebrow">EPF Sahayak <span>Voice</span></p>
        {orbInteractive ? (
          <button aria-label={isSpeaking ? "Stop playback" : "Retry voice"} className="assistant-voice-orb" disabled={!active} onClick={activateOrb} type="button">
            <Mic aria-hidden="true" size={34} />
          </button>
        ) : (
          <div aria-label="EPF Sahayak microphone" className="assistant-voice-orb" role="img"><Mic aria-hidden="true" size={34} /></div>
        )}
        <strong aria-live="polite" className="assistant-voice-status" role="status">{statusLabel[voice.state]}</strong>
        {orbInteractive ? <span className="assistant-voice-hint">Tap the mic to {isSpeaking ? "stop" : "retry"}</span> : null}
      </div>
      <div aria-label="Voice caption" className="assistant-voice-caption" ref={captionRef} role="group">
        {!voice.transcript && !voice.answer && !voice.error ? <p>Speak naturally about this page. You can interrupt while EPF Sahayak is speaking.</p> : null}
        {voice.transcript ? <p><strong>You said:</strong> <SafeBilingualText text={voice.transcript} /></p> : null}
        {voice.answer ? <p><strong>EPF Sahayak:</strong> <SafeBilingualText text={voice.answer} /></p> : null}
        {voice.error ? <p role="alert">{voice.error}</p> : null}
      </div>
      <div aria-label="Voice controls" className="assistant-voice-controls" role="group">
        {onToggleDocument ? <button aria-controls="assistant-document-review" aria-expanded={documentOpen} aria-label="Attach synthetic document" className="assistant-voice-icon-action" disabled={!active} onClick={onToggleDocument} title="Attach synthetic document" type="button"><Paperclip aria-hidden="true" size={19} /><span>Attach file</span></button> : null}
        <button aria-label="Continue in text chat" className="assistant-voice-icon-action" disabled={!active} onClick={returnToText} title="Continue in text chat" type="button"><Keyboard aria-hidden="true" size={19} /><span>Use text</span></button>
        <button aria-label="End voice mode" className="assistant-voice-icon-action assistant-voice-icon-end" disabled={!active} onClick={exit} title="End voice mode" type="button"><X aria-hidden="true" size={19} /><span>End</span></button>
      </div>
    </section>
  );
}
