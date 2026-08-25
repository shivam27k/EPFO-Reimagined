"use client";
/* eslint-disable react-hooks/refs */

import { useCallback, useEffect, useRef, useState } from "react";

import { containsForbiddenScript } from "./assistant-language";

export type AssistantVoiceState = "CONNECTING" | "LISTENING" | "SPEAKING" | "RECONNECTING" | "ERROR" | "IDLE";
export type AssistantVoiceCaption = { role: "member" | "assistant"; text: string };

const UNSUPPORTED_SCRIPT_NOTICE = "Speech received in an unsupported script. Please speak in English or Hindi.";
const IDLE_SESSION_MS = 10 * 60 * 1_000;
const MAX_SESSION_MS = 30 * 60 * 1_000;

type RealtimeEvent = {
  type?: unknown;
  delta?: unknown;
  transcript?: unknown;
  item_id?: unknown;
};

type VoiceResources = {
  peer: RTCPeerConnection;
  channel: RTCDataChannel;
  microphone: MediaStream;
  remoteStream: MediaStream | null;
  audio: HTMLAudioElement;
  negotiation: AbortController;
};

function safeCaption(text: string): string {
  return containsForbiddenScript(text) ? UNSUPPORTED_SCRIPT_NOTICE : text;
}

function appendCaption(current: string, delta: string): string {
  if (current === UNSUPPORTED_SCRIPT_NOTICE) return current;
  return safeCaption(`${current}${delta}`);
}

function isPermissionDenied(error: unknown): boolean {
  return error instanceof DOMException && error.name === "NotAllowedError";
}

export function useAssistantVoice({ active, route }: { active: boolean; route: string }) {
  const [state, setState] = useState<AssistantVoiceState>("IDLE");
  const [transcript, setTranscript] = useState("");
  const [answer, setAnswer] = useState("");
  const [completedCaptions, setCompletedCaptions] = useState<AssistantVoiceCaption[]>([]);
  const [error, setError] = useState("");
  const activeRef = useRef(active);
  const routeRef = useRef(route);
  const negotiatedRouteRef = useRef("");
  const resourcesRef = useRef<VoiceResources | null>(null);
  const generationRef = useRef(0);
  const reconnectUsedRef = useRef(false);
  const connectRef = useRef<(reconnecting: boolean) => void>(() => undefined);
  const inputItemRef = useRef("");
  const outputItemRef = useRef("");
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const totalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (totalTimerRef.current) clearTimeout(totalTimerRef.current);
    idleTimerRef.current = null;
    totalTimerRef.current = null;
  }, []);

  const closeResources = useCallback(() => {
    const resources = resourcesRef.current;
    resourcesRef.current = null;
    if (!resources) return;

    resources.negotiation.abort();
    resources.channel.onopen = null;
    resources.channel.onmessage = null;
    resources.channel.onerror = null;
    resources.channel.onclose = null;
    resources.peer.ontrack = null;
    resources.peer.onconnectionstatechange = null;
    resources.channel.close();
    resources.peer.close();

    const tracks = new Set<MediaStreamTrack>(resources.microphone.getTracks());
    resources.remoteStream?.getTracks().forEach((track) => tracks.add(track));
    tracks.forEach((track) => track.stop());

    resources.audio.pause();
    resources.audio.srcObject = null;
  }, []);

  const fail = useCallback((message: string) => {
    generationRef.current += 1;
    closeResources();
    clearTimers();
    setError(message);
    setState("ERROR");
  }, [clearTimers, closeResources]);

  const resetIdleTimer = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      if (!activeRef.current) return;
      fail("Voice mode ended after 10 minutes without activity. Retry voice or use text chat.");
    }, IDLE_SESSION_MS);
  }, [fail]);

  const sendClientEvent = useCallback((event: Record<string, unknown>): boolean => {
    const channel = resourcesRef.current?.channel;
    if (!channel || channel.readyState !== "open") return false;
    channel.send(JSON.stringify(event));
    resetIdleTimer();
    return true;
  }, [resetIdleTimer]);

  const handleRealtimeEvent = useCallback((event: RealtimeEvent) => {
    if (!activeRef.current || typeof event.type !== "string") return;
    resetIdleTimer();

    const itemId = typeof event.item_id === "string" ? event.item_id : "";
    switch (event.type) {
      case "conversation.item.input_audio_transcription.delta": {
        if (typeof event.delta !== "string") return;
        const isNewItem = Boolean(itemId) && itemId !== inputItemRef.current;
        if (itemId) inputItemRef.current = itemId;
        setTranscript((current) => isNewItem ? safeCaption(event.delta as string) : appendCaption(current, event.delta as string));
        break;
      }
      case "conversation.item.input_audio_transcription.completed":
        if (itemId) inputItemRef.current = itemId;
        if (typeof event.transcript === "string") {
          const completedTranscript = safeCaption(event.transcript);
          setTranscript(completedTranscript);
          if (completedTranscript.trim()) setCompletedCaptions((current) => [...current, { role: "member", text: completedTranscript }]);
        }
        break;
      case "response.output_audio_transcript.delta": {
        if (typeof event.delta !== "string") return;
        const isNewItem = Boolean(itemId) && itemId !== outputItemRef.current;
        if (itemId) outputItemRef.current = itemId;
        setAnswer((current) => isNewItem ? safeCaption(event.delta as string) : appendCaption(current, event.delta as string));
        break;
      }
      case "response.output_audio_transcript.done":
        if (itemId) outputItemRef.current = itemId;
        if (typeof event.transcript === "string") {
          const completedAnswer = safeCaption(event.transcript);
          setAnswer(completedAnswer);
          if (completedAnswer.trim()) setCompletedCaptions((current) => [...current, { role: "assistant", text: completedAnswer }]);
        }
        break;
      case "output_audio_buffer.started":
        setState("SPEAKING");
        break;
      case "output_audio_buffer.stopped":
        setState("LISTENING");
        break;
      case "input_audio_buffer.speech_started":
        inputItemRef.current = "";
        setTranscript("");
        setState("LISTENING");
        break;
      case "error":
        fail("Realtime voice needs attention. Retry voice or use text chat.");
        break;
      default:
        break;
    }
  }, [fail, resetIdleTimer]);

  const startTotalTimer = useCallback(() => {
    if (totalTimerRef.current) clearTimeout(totalTimerRef.current);
    totalTimerRef.current = setTimeout(() => {
      if (!activeRef.current) return;
      fail("Voice mode reached its 30-minute limit. Start a new voice session or use text chat.");
    }, MAX_SESSION_MS);
  }, [fail]);

  const connect = useCallback(async (reconnecting: boolean) => {
    if (!activeRef.current) return;
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    closeResources();
    if (!reconnecting) {
      reconnectUsedRef.current = false;
      clearTimers();
      setTranscript("");
      setAnswer("");
      setCompletedCaptions([]);
      startTotalTimer();
    }
    setError("");
    setState(reconnecting ? "RECONNECTING" : "CONNECTING");

    if (typeof RTCPeerConnection === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      fail("Realtime voice is not supported in this browser. Please use text chat.");
      return;
    }

    let microphone: MediaStream | null = null;
    try {
      microphone = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!activeRef.current || generation !== generationRef.current) {
        microphone.getTracks().forEach((track) => track.stop());
        return;
      }

      const peer = new RTCPeerConnection();
      const audio = new Audio();
      audio.autoplay = true;
      const channel = peer.createDataChannel("oai-events");
      const negotiation = new AbortController();
      const resources: VoiceResources = {
        peer,
        channel,
        microphone,
        remoteStream: null,
        audio,
        negotiation,
      };
      resourcesRef.current = resources;

      microphone.getTracks().forEach((track) => peer.addTrack(track, microphone as MediaStream));

      const requestReconnect = () => {
        if (!activeRef.current || generation !== generationRef.current) return;
        if (!reconnectUsedRef.current) {
          reconnectUsedRef.current = true;
          setState("RECONNECTING");
          connectRef.current(true);
          return;
        }
        fail("Voice could not reconnect. Open text chat or retry voice.");
      };

      peer.ontrack = (event) => {
        if (generation !== generationRef.current) return;
        const stream = event.streams[0] ?? new MediaStream([event.track]);
        resources.remoteStream = stream;
        audio.srcObject = stream;
      };
      peer.onconnectionstatechange = () => {
        if (peer.connectionState === "failed" || peer.connectionState === "disconnected") requestReconnect();
      };
      channel.onmessage = (message) => {
        if (generation !== generationRef.current || typeof message.data !== "string") return;
        try {
          handleRealtimeEvent(JSON.parse(message.data) as RealtimeEvent);
        } catch {
          fail("Realtime voice sent an unreadable update. Retry voice or use text chat.");
        }
      };
      channel.onerror = requestReconnect;
      channel.onclose = requestReconnect;
      channel.onopen = () => {
        if (!activeRef.current || generation !== generationRef.current) return;
        setState("LISTENING");
        resetIdleTimer();
        if (routeRef.current !== negotiatedRouteRef.current) {
          const currentRoute = routeRef.current;
          if (sendClientEvent({
            type: "session.update",
            session: {
              type: "realtime",
              instructions: `The member is now viewing portal route ${currentRoute}. Keep responses grounded in this screen.`,
            },
          })) negotiatedRouteRef.current = currentRoute;
        }
      };

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      const offerSdp = offer.sdp?.trim();
      if (!offerSdp) throw new Error("EMPTY_OFFER");
      const negotiatedRoute = routeRef.current;
      const response = await fetch(`/api/assistant/realtime?route=${encodeURIComponent(negotiatedRoute)}`, {
        method: "POST",
        headers: { "content-type": "application/sdp" },
        body: offer.sdp,
        signal: negotiation.signal,
      });
      if (!response.ok) throw new Error(response.status === 401 ? "AUTHENTICATION_REQUIRED" : "NEGOTIATION_FAILED");
      const answerSdp = await response.text();
      if (!answerSdp.trim()) throw new Error("EMPTY_ANSWER");
      if (!activeRef.current || generation !== generationRef.current) return;
      await peer.setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp: answerSdp }));
      negotiatedRouteRef.current = negotiatedRoute;
    } catch (caught) {
      if (!activeRef.current || generation !== generationRef.current) {
        if (microphone && resourcesRef.current?.microphone !== microphone) {
          microphone.getTracks().forEach((track) => track.stop());
        }
        return;
      }
      if (isPermissionDenied(caught)) {
        fail("Microphone permission was denied. Allow it in your browser settings, then retry.");
      } else if (caught instanceof Error && caught.message === "AUTHENTICATION_REQUIRED") {
        fail("Voice session could not authenticate. Please sign in again or use text chat.");
      } else if (reconnecting) {
        fail("Voice could not reconnect. Open text chat or retry voice.");
      } else {
        fail("Realtime voice could not connect. Retry voice or use text chat.");
      }
    }
  }, [clearTimers, closeResources, fail, handleRealtimeEvent, resetIdleTimer, sendClientEvent, startTotalTimer]);

  connectRef.current = (reconnecting) => {
    void connect(reconnecting);
  };

  const stopSpeaking = useCallback(() => {
    sendClientEvent({ type: "response.cancel" });
    sendClientEvent({ type: "output_audio_buffer.clear" });
    setState("LISTENING");
  }, [sendClientEvent]);

  const start = useCallback(() => {
    if (!active) return;
    activeRef.current = true;
    reconnectUsedRef.current = false;
    void connect(false);
  }, [active, connect]);

  const stop = useCallback(() => {
    activeRef.current = false;
    generationRef.current += 1;
    closeResources();
    clearTimers();
    setError("");
    setState("IDLE");
  }, [clearTimers, closeResources]);

  useEffect(() => {
    routeRef.current = route;
    if (!active || route === negotiatedRouteRef.current) return;
    if (sendClientEvent({
      type: "session.update",
      session: {
        type: "realtime",
        instructions: `The member is now viewing portal route ${route}. Keep responses grounded in this screen.`,
      },
    })) negotiatedRouteRef.current = route;
  }, [active, route, sendClientEvent]);

  useEffect(() => {
    activeRef.current = active;
    if (!active) {
      generationRef.current += 1;
      closeResources();
      clearTimers();
      queueMicrotask(() => {
        if (!activeRef.current) {
          setError("");
          setState("IDLE");
        }
      });
      return;
    }

    queueMicrotask(() => {
      if (activeRef.current) void connect(false);
    });
    return () => {
      activeRef.current = false;
      generationRef.current += 1;
      closeResources();
      clearTimers();
    };
  }, [active, clearTimers, closeResources, connect]);

  return {
    state: active ? state : "IDLE" as AssistantVoiceState,
    transcript,
    answer,
    completedCaptions,
    error,
    startListening: start,
    stopListening: stop,
    stopSpeaking,
    retry: start,
    stop,
  };
}
