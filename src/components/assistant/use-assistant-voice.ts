"use client";
/* eslint-disable react-hooks/immutability, react-hooks/preserve-manual-memoization */

import { useCallback, useEffect, useRef, useState } from "react";

export type AssistantVoiceState = "REQUESTING_PERMISSION" | "LISTENING" | "TRANSCRIBING" | "THINKING" | "SPEAKING" | "ERROR" | "IDLE";
type SubmitTranscript = (transcript: string, signal?: AbortSignal) => Promise<{ text: string } | null>;

const GREETING = "Hi, I’m EPF Sahayak. What would you like help with?";
const SILENCE_MS = 1_200;
const MAX_TURN_MS = 30_000;

function messageFor(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function extensionFor(mimeType: string) {
  return mimeType.includes("mp4") ? "mp4" : "webm";
}

export function useAssistantVoice({ active, submitTranscript }: { active: boolean; submitTranscript: SubmitTranscript }) {
  const [state, setState] = useState<AssistantVoiceState>("IDLE");
  const [transcript, setTranscript] = useState("");
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  const activeRef = useRef(active);
  const submitTranscriptRef = useRef(submitTranscript);
  const greetedRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const requestsRef = useRef(new Set<AbortController>());
  const maxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animationRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const operationRef = useRef(0);
  const afterSpeechRef = useRef<(() => void) | null>(null);
  const lastAnswerRef = useRef("");
  const errorKindRef = useRef<"recording" | "speech" | null>(null);
  useEffect(() => {
    activeRef.current = active;
  }, [active]);
  useEffect(() => {
    submitTranscriptRef.current = submitTranscript;
  }, [submitTranscript]);

  const clearAnalysis = useCallback(() => {
    if (maxTimerRef.current) clearTimeout(maxTimerRef.current);
    maxTimerRef.current = null;
    if (animationRef.current !== null) window.cancelAnimationFrame(animationRef.current);
    animationRef.current = null;
    if (audioContextRef.current) void audioContextRef.current.close();
    audioContextRef.current = null;
  }, []);

  const stopPlayback = useCallback(() => {
    afterSpeechRef.current = null;
    if (audioRef.current) {
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
  }, []);

  const stopCapture = useCallback((stopRecorder: boolean) => {
    clearAnalysis();
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (stopRecorder && recorder && recorder.state !== "inactive") recorder.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, [clearAnalysis]);

  const cancelActiveWork = useCallback(() => {
    operationRef.current += 1;
    requestsRef.current.forEach((controller) => controller.abort());
    requestsRef.current.clear();
    stopCapture(true);
    stopPlayback();
  }, [stopCapture, stopPlayback]);

  const fail = useCallback((text: string, kind: "recording" | "speech") => {
    errorKindRef.current = kind;
    setError(text);
    setState("ERROR");
  }, []);

  const startRecorder = useCallback((stream: MediaStream, mimeType: string, token: number) => {
    if (!activeRef.current || token !== operationRef.current) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    try {
      const recorder = new MediaRecorder(stream, { mimeType });
      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = () => {
        recorderRef.current = null;
        const recording = new Blob(chunksRef.current, { type: recorder.mimeType });
        chunksRef.current = [];
        void processRecording(recording, token);
      };
      recorder.start();
      setState("LISTENING");
      maxTimerRef.current = setTimeout(() => finishRecording(), MAX_TURN_MS);
      watchForSilence(stream);
    } catch (caught) {
      stream.getTracks().forEach((track) => track.stop());
      fail(messageFor(caught, "I could not start voice recording. Please use text chat."), "recording");
    }
  // Declarations below are stable callbacks; this function is invoked after they initialise.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fail]);

  const finishRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    clearAnalysis();
    recorder.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, [clearAnalysis]);

  const watchForSilence = useCallback((stream: MediaStream) => {
    if (!window.AudioContext) return;
    try {
      const context = new AudioContext();
      const analyser = context.createAnalyser();
      analyser.fftSize = 512;
      context.createMediaStreamSource(stream).connect(analyser);
      audioContextRef.current = context;
      const samples = new Uint8Array(analyser.fftSize);
      let heardSpeech = false;
      let silenceStartedAt = 0;
      const sample = () => {
        analyser.getByteTimeDomainData(samples);
        const energy = samples.reduce((sum, value) => sum + Math.abs(value - 128), 0) / samples.length;
        if (energy > 7) {
          heardSpeech = true;
          silenceStartedAt = 0;
        } else if (heardSpeech) {
          silenceStartedAt ||= Date.now();
          if (Date.now() - silenceStartedAt >= SILENCE_MS) {
            finishRecording();
            return;
          }
        }
        animationRef.current = window.requestAnimationFrame(sample);
      };
      animationRef.current = window.requestAnimationFrame(sample);
    } catch {
      // A visible manual stop and the maximum recording timer remain available.
    }
  }, [finishRecording]);

  const processRecording = useCallback(async (recording: Blob, token: number) => {
    if (!activeRef.current || token !== operationRef.current) return;
    if (!recording.size) {
      setTranscript("");
      setError("I didn’t catch that—please try again.");
      setState("IDLE");
      return;
    }
    setState("TRANSCRIBING");
    const transcriptionController = new AbortController();
    requestsRef.current.add(transcriptionController);
    try {
      const mimeType = recording.type || "audio/webm";
      const body = new FormData();
      body.set("audio", new File([recording], `voice-turn.${extensionFor(mimeType)}`, { type: mimeType }));
      const response = await fetch("/api/assistant/transcribe", { method: "POST", body, signal: transcriptionController.signal });
      const payload = await response.json().catch(() => ({})) as { transcript?: unknown; error?: unknown };
      const recognised = typeof payload.transcript === "string" ? payload.transcript.trim() : "";
      if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "I could not transcribe that recording. Please try again.");
      if (!recognised) {
        setTranscript("");
        setError("I didn’t catch that—please try again.");
        setState("IDLE");
        return;
      }
      if (!activeRef.current || token !== operationRef.current) return;
      setTranscript(recognised);
      setState("THINKING");
      const assistantController = new AbortController();
      requestsRef.current.add(assistantController);
      let result: { text: string } | null;
      try {
        result = await submitTranscriptRef.current(recognised, assistantController.signal);
      } finally {
        requestsRef.current.delete(assistantController);
      }
      const text = result?.text?.trim();
      if (!text) throw new Error("I could not get an answer right now. You can try again or use text chat.");
      if (!activeRef.current || token !== operationRef.current) return;
      setAnswer(text);
      lastAnswerRef.current = text;
      await playSpeech(text, token);
    } catch (caught) {
      if (transcriptionController.signal.aborted || token !== operationRef.current || !activeRef.current) return;
      fail(messageFor(caught, "Voice processing failed. Please try again or use text chat."), "recording");
    } finally {
      requestsRef.current.delete(transcriptionController);
    }
  // Declarations below are stable callbacks; this function is invoked after they initialise.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fail]);

  const finishSpeech = useCallback((token: number) => {
    if (!activeRef.current || token !== operationRef.current) return;
    const after = afterSpeechRef.current;
    stopPlayback();
    if (after) after();
    else setState("IDLE");
  }, [stopPlayback]);

  const playSpeech = useCallback(async (text: string, token: number, after?: () => void, greeting = false) => {
    const controller = new AbortController();
    requestsRef.current.add(controller);
    afterSpeechRef.current = after ?? null;
    setState("SPEAKING");
    try {
      const response = await fetch("/api/assistant/speech", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }), signal: controller.signal });
      if (!response.ok) throw new Error("I could not prepare spoken audio. You can still read the answer.");
      const blob = await response.blob();
      if (!blob.size) throw new Error("I could not prepare spoken audio. You can still read the answer.");
      if (!activeRef.current || token !== operationRef.current) return;
      const objectUrl = URL.createObjectURL(blob);
      objectUrlRef.current = objectUrl;
      const audio = new Audio(objectUrl);
      audioRef.current = audio;
      audio.onended = () => finishSpeech(token);
      audio.onerror = () => {
        if (!activeRef.current || token !== operationRef.current) return;
        const afterGreeting = afterSpeechRef.current;
        stopPlayback();
        if (greeting && afterGreeting) {
          setError("I could not play the greeting. You can start speaking when you are ready.");
          afterGreeting();
          return;
        }
        fail("I could not play the spoken answer. You can still read it and try again.", "speech");
      };
      await audio.play();
    } catch (caught) {
      if (controller.signal.aborted || token !== operationRef.current || !activeRef.current) return;
      const afterGreeting = afterSpeechRef.current;
      stopPlayback();
      if (greeting && afterGreeting) {
        setError("I could not play the greeting. You can start speaking when you are ready.");
        afterGreeting();
        return;
      }
      fail(messageFor(caught, "I could not play the spoken answer. You can still read it and try again."), "speech");
    } finally {
      requestsRef.current.delete(controller);
    }
  }, [fail, finishSpeech, stopPlayback]);

  const supportedMime = useCallback(() => {
    if (typeof MediaRecorder === "undefined") return null;
    if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) return "audio/webm;codecs=opus";
    if (MediaRecorder.isTypeSupported("audio/mp4")) return "audio/mp4";
    return null;
  }, []);

  const startListening = useCallback(async () => {
    if (!activeRef.current) return;
    cancelActiveWork();
    setError("");
    errorKindRef.current = null;
    if (!navigator.mediaDevices?.getUserMedia) {
      fail("Voice recording is not supported in this browser. Please use text chat.", "recording");
      return;
    }
    const mimeType = supportedMime();
    if (!mimeType) {
      fail("Voice recording is not supported in this browser. Please use text chat.", "recording");
      return;
    }
    const token = operationRef.current;
    setState("REQUESTING_PERMISSION");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!activeRef.current || token !== operationRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      if (!greetedRef.current) {
        greetedRef.current = true;
        setAnswer(GREETING);
        await playSpeech(GREETING, token, () => startRecorder(stream, mimeType, token), true);
      } else {
        startRecorder(stream, mimeType, token);
      }
    } catch (caught) {
      if (token !== operationRef.current || !activeRef.current) return;
      const denied = caught instanceof DOMException && caught.name === "NotAllowedError";
      fail(denied ? "Microphone permission was denied. Allow it in your browser settings, then retry." : messageFor(caught, "I could not start the microphone. Please try again or use text chat."), "recording");
    }
  }, [cancelActiveWork, fail, playSpeech, startRecorder, supportedMime]);

  const stopListening = useCallback(() => finishRecording(), [finishRecording]);

  const stopSpeaking = useCallback(() => {
    cancelActiveWork();
    setState("IDLE");
  }, [cancelActiveWork]);

  const retry = useCallback(() => {
    if (errorKindRef.current === "speech" && lastAnswerRef.current) {
      operationRef.current += 1;
      const token = operationRef.current;
      setError("");
      void playSpeech(lastAnswerRef.current, token);
      return;
    }
    void startListening();
  }, [playSpeech, startListening]);

  const stop = useCallback(() => {
    cancelActiveWork();
    setState("IDLE");
  }, [cancelActiveWork]);

  useEffect(() => {
    if (active) return cancelActiveWork;
    cancelActiveWork();
    queueMicrotask(() => {
      if (!activeRef.current) {
        setState("IDLE");
        setError("");
      }
    });
    return cancelActiveWork;
  }, [active, cancelActiveWork]);

  return { state: active ? state : "IDLE" as AssistantVoiceState, transcript, answer, error, startListening, stopListening, stopSpeaking, retry, stop };
}
