"use client";
/* eslint-disable react-hooks/refs */

import { useCallback, useEffect, useRef, useState } from "react";

import { parsePortalToolCall, type PortalAction, type PortalActionResult } from "@/domain/portal-actions";
import { containsForbiddenScript } from "./assistant-language";
import { captureVisibleScreenText, visibleScreenFingerprint } from "./visible-screen-context";

export type AssistantVoiceState = "CONNECTING" | "LISTENING" | "SPEAKING" | "RECONNECTING" | "ERROR" | "IDLE";
export type AssistantVoiceCaption = { role: "member" | "assistant"; text: string };

const UNSUPPORTED_SCRIPT_NOTICE = "Speech received in an unsupported script. Please speak in English or Hindi.";
const VOICE_RECEIVED_NOTICE = "Voice received. आवाज़ मिली।";
const SETUP_TIMEOUT_MS = 15_000;
const IDLE_SESSION_MS = 10 * 60 * 1_000;
const MAX_SESSION_MS = 30 * 60 * 1_000;

type CaptionRole = AssistantVoiceCaption["role"];

type RealtimeEvent = {
  type?: unknown;
  delta?: unknown;
  transcript?: unknown;
  item_id?: unknown;
  previous_item_id?: unknown;
  item?: unknown;
  response?: unknown;
};

type CaptionItem = {
  id: string;
  role: CaptionRole | null;
  text: string;
  completed: boolean;
  previousItemId?: string | null;
  firstSeen: number;
};

type VoiceResources = {
  peer: RTCPeerConnection;
  channel: RTCDataChannel;
  microphone: MediaStream;
  remoteStream: MediaStream | null;
  audio: HTMLAudioElement;
  negotiation: AbortController;
  contextRefresh: AbortController | null;
};

function safeCaption(text: string, role: CaptionRole): string {
  if (!containsForbiddenScript(text)) return text;
  return role === "member" ? VOICE_RECEIVED_NOTICE : UNSUPPORTED_SCRIPT_NOTICE;
}

function appendCaption(current: string, delta: string, role: CaptionRole): string {
  if (current === UNSUPPORTED_SCRIPT_NOTICE || current === VOICE_RECEIVED_NOTICE) return current;
  return safeCaption(`${current}${delta}`, role);
}

function isPermissionDenied(error: unknown): boolean {
  return error instanceof DOMException && error.name === "NotAllowedError";
}

function isCompleteRealtimeInstructions(value: unknown): value is string {
  return typeof value === "string"
    && value.includes("Current masked portal context (synthetic data only):")
    && /English or Hindi/i.test(value)
    && /Never invent/i.test(value)
    && /explicit confirmation/i.test(value);
}

function contextKey(route: string, contextVersion: string): string {
  return JSON.stringify([route, contextVersion]);
}

function contextVersionWithVisibleScreen(contextVersion: string, visibleVersion: string): string {
  return visibleVersion ? `${contextVersion}:${visibleVersion}` : contextVersion;
}

function roleFromRealtimeItem(item: unknown): CaptionRole | null {
  if (typeof item !== "object" || item === null) return null;
  const role = (item as Record<string, unknown>).role;
  if (role === "user") return "member";
  if (role === "assistant") return "assistant";
  return null;
}

function idFromRealtimeItem(item: unknown): string {
  if (typeof item !== "object" || item === null) return "";
  const id = (item as Record<string, unknown>).id;
  return typeof id === "string" ? id : "";
}

function orderCaptionItems(items: CaptionItem[]): CaptionItem[] {
  const remaining = [...items].sort((left, right) => left.firstSeen - right.firstSeen);
  const allIds = new Set(remaining.map(({ id }) => id));
  const placedIds = new Set<string>();
  const ordered: CaptionItem[] = [];

  while (remaining.length > 0) {
    const readyIndex = remaining.findIndex(({ previousItemId }) => (
      previousItemId === undefined
      || previousItemId === null
      || !allIds.has(previousItemId)
      || placedIds.has(previousItemId)
    ));
    const [next] = remaining.splice(readyIndex >= 0 ? readyIndex : 0, 1);
    if (!next) break;
    ordered.push(next);
    placedIds.add(next.id);
  }

  return ordered;
}

export function useAssistantVoice({
  active,
  contextVersion,
  onToolCall,
  route,
}: {
  active: boolean;
  contextVersion: string;
  onToolCall?: (action: PortalAction) => Promise<PortalActionResult>;
  route: string;
}) {
  const [state, setState] = useState<AssistantVoiceState>("IDLE");
  const [transcript, setTranscript] = useState("");
  const [answer, setAnswer] = useState("");
  const [captionItems, setCaptionItems] = useState<CaptionItem[]>([]);
  const [error, setError] = useState("");
  const [visibleScreenVersion, setVisibleScreenVersion] = useState("");
  const activeRef = useRef(active);
  const routeRef = useRef(route);
  const contextVersionRef = useRef(contextVersion);
  const appliedContextKeyRef = useRef("");
  const resourcesRef = useRef<VoiceResources | null>(null);
  const generationRef = useRef(0);
  const reconnectUsedRef = useRef(false);
  const connectRef = useRef<(reconnecting: boolean) => void>(() => undefined);
  const inputItemRef = useRef("");
  const outputItemRef = useRef("");
  const captionSequenceRef = useRef(0);
  const fallbackItemSequenceRef = useRef(0);
  const captionStoreRef = useRef(new Map<string, CaptionItem>());
  const contextRefreshSequenceRef = useRef(0);
  const setupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const totalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handledToolCallsRef = useRef(new Set<string>());
  const onToolCallRef = useRef(onToolCall);
  onToolCallRef.current = onToolCall;

  const clearSetupTimer = useCallback(() => {
    if (setupTimerRef.current) clearTimeout(setupTimerRef.current);
    setupTimerRef.current = null;
  }, []);

  const clearTimers = useCallback(() => {
    clearSetupTimer();
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (totalTimerRef.current) clearTimeout(totalTimerRef.current);
    idleTimerRef.current = null;
    totalTimerRef.current = null;
  }, [clearSetupTimer]);

  const closeResources = useCallback(() => {
    const resources = resourcesRef.current;
    resourcesRef.current = null;
    if (!resources) return;

    resources.negotiation.abort();
    resources.contextRefresh?.abort();
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

  const handleToolCalls = useCallback(async (event: RealtimeEvent) => {
    const response = typeof event.response === "object" && event.response !== null
      ? event.response as Record<string, unknown>
      : {};
    const output = Array.isArray(response.output) ? response.output : [];
    for (const candidate of output) {
      if (typeof candidate !== "object" || candidate === null) continue;
      const item = candidate as Record<string, unknown>;
      if (item.type !== "function_call" || typeof item.call_id !== "string" || typeof item.name !== "string") continue;
      if (handledToolCallsRef.current.has(item.call_id)) continue;
      handledToolCallsRef.current.add(item.call_id);
      let result: PortalActionResult;
      try {
        const action = parsePortalToolCall(item.name, typeof item.arguments === "string" ? item.arguments : "{}");
        result = onToolCallRef.current
          ? await onToolCallRef.current(action)
          : { status: "unavailable", message: "Portal actions are not available in this session." };
      } catch {
        result = { status: "failed", message: "That portal action was not valid or supported." };
      }
      sendClientEvent({
        type: "conversation.item.create",
        item: { type: "function_call_output", call_id: item.call_id, output: JSON.stringify(result) },
      });
      sendClientEvent({ type: "response.create" });
    }
  }, [sendClientEvent]);

  const publishCaptions = useCallback(() => {
    const ordered = orderCaptionItems([...captionStoreRef.current.values()]);
    const latestMember = [...ordered].reverse().find(({ role }) => role === "member");
    const latestAssistant = [...ordered].reverse().find(({ role }) => role === "assistant");
    setCaptionItems(ordered.map((item) => ({ ...item })));
    setTranscript(latestMember?.text ?? "");
    setAnswer(latestAssistant?.text ?? "");
  }, []);

  const upsertCaptionItem = useCallback((id: string, role: CaptionRole | null): CaptionItem => {
    const current = captionStoreRef.current.get(id);
    if (current) {
      if (role) current.role = role;
      return current;
    }
    const created: CaptionItem = {
      id,
      role,
      text: "",
      completed: false,
      firstSeen: captionSequenceRef.current,
    };
    captionSequenceRef.current += 1;
    captionStoreRef.current.set(id, created);
    return created;
  }, []);

  const eventItemId = useCallback((event: RealtimeEvent, role: CaptionRole): string => {
    const supplied = typeof event.item_id === "string" ? event.item_id : "";
    const current = role === "member" ? inputItemRef : outputItemRef;
    if (supplied) current.current = supplied;
    if (current.current) return current.current;
    fallbackItemSequenceRef.current += 1;
    current.current = `${role}-fallback-${fallbackItemSequenceRef.current}`;
    return current.current;
  }, []);

  const handleRealtimeEvent = useCallback((event: RealtimeEvent) => {
    if (!activeRef.current || typeof event.type !== "string") return;
    resetIdleTimer();

    switch (event.type) {
      case "conversation.item.created": {
        const id = idFromRealtimeItem(event.item);
        if (!id) return;
        const item = upsertCaptionItem(id, roleFromRealtimeItem(event.item));
        if (typeof event.previous_item_id === "string") item.previousItemId = event.previous_item_id;
        else if (event.previous_item_id === null) item.previousItemId = null;
        publishCaptions();
        break;
      }
      case "conversation.item.input_audio_transcription.delta": {
        if (typeof event.delta !== "string") return;
        const item = upsertCaptionItem(eventItemId(event, "member"), "member");
        if (!item.completed) item.text = appendCaption(item.text, event.delta, "member");
        publishCaptions();
        break;
      }
      case "conversation.item.input_audio_transcription.completed": {
        if (typeof event.transcript !== "string") return;
        const item = upsertCaptionItem(eventItemId(event, "member"), "member");
        item.text = safeCaption(event.transcript, "member");
        item.completed = true;
        publishCaptions();
        break;
      }
      case "response.output_audio_transcript.delta": {
        if (typeof event.delta !== "string") return;
        const item = upsertCaptionItem(eventItemId(event, "assistant"), "assistant");
        if (!item.completed) item.text = appendCaption(item.text, event.delta, "assistant");
        publishCaptions();
        break;
      }
      case "response.output_audio_transcript.done": {
        if (typeof event.transcript !== "string") return;
        const item = upsertCaptionItem(eventItemId(event, "assistant"), "assistant");
        item.text = safeCaption(event.transcript, "assistant");
        item.completed = true;
        publishCaptions();
        break;
      }
      case "output_audio_buffer.started":
        setState("SPEAKING");
        break;
      case "output_audio_buffer.stopped":
        setState("LISTENING");
        break;
      case "response.done":
        void handleToolCalls(event);
        break;
      case "input_audio_buffer.speech_started":
        inputItemRef.current = typeof event.item_id === "string" ? event.item_id : "";
        setTranscript("");
        setState("LISTENING");
        break;
      case "error":
        fail("Realtime voice needs attention. Retry voice or use text chat.");
        break;
      default:
        break;
    }
  }, [eventItemId, fail, handleToolCalls, publishCaptions, resetIdleTimer, upsertCaptionItem]);

  const refreshContext = useCallback(async (nextRoute: string, nextContextKey: string) => {
    const resources = resourcesRef.current;
    if (!resources || resources.channel.readyState !== "open") return;

    resources.contextRefresh?.abort();
    const controller = new AbortController();
    resources.contextRefresh = controller;
    const refreshSequence = contextRefreshSequenceRef.current + 1;
    contextRefreshSequenceRef.current = refreshSequence;
    const generation = generationRef.current;

    try {
      const response = await fetch("/api/assistant/realtime", {
        method: "PUT",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify({
          route: nextRoute,
          visibleScreenText: captureVisibleScreenText(),
        }),
        signal: controller.signal,
      });
      if (response.status === 401) throw new Error("AUTHENTICATION_REQUIRED");
      if (!response.ok) return;
      const body = await response.json() as Record<string, unknown>;
      if (
        controller.signal.aborted
        || refreshSequence !== contextRefreshSequenceRef.current
        || generation !== generationRef.current
        || resourcesRef.current !== resources
        || !isCompleteRealtimeInstructions(body.instructions)
      ) return;

      if (sendClientEvent({
        type: "session.update",
        session: { type: "realtime", instructions: body.instructions },
      })) appliedContextKeyRef.current = nextContextKey;
    } catch (caught) {
      if (controller.signal.aborted || refreshSequence !== contextRefreshSequenceRef.current) return;
      if (caught instanceof Error && caught.message === "AUTHENTICATION_REQUIRED") {
        fail("Voice session could not authenticate. Please sign in again or use text chat.");
      }
    } finally {
      if (resources.contextRefresh === controller) resources.contextRefresh = null;
    }
  }, [fail, sendClientEvent]);

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
    clearSetupTimer();
    appliedContextKeyRef.current = "";
    if (!reconnecting) {
      reconnectUsedRef.current = false;
      clearTimers();
      setTranscript("");
      setAnswer("");
      setCaptionItems([]);
      captionStoreRef.current.clear();
      captionSequenceRef.current = 0;
      fallbackItemSequenceRef.current = 0;
      inputItemRef.current = "";
      outputItemRef.current = "";
      handledToolCallsRef.current.clear();
      startTotalTimer();
    }
    setError("");
    setState(reconnecting ? "RECONNECTING" : "CONNECTING");

    if (typeof RTCPeerConnection === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      fail("Realtime voice is not supported in this browser. Please use text chat.");
      return;
    }

    setupTimerRef.current = setTimeout(() => {
      if (!activeRef.current || generation !== generationRef.current) return;
      fail("Voice connection did not finish within 15 seconds. Open text chat or retry voice.");
    }, SETUP_TIMEOUT_MS);

    let microphone: MediaStream | null = null;
    let peer: RTCPeerConnection | null = null;
    let channel: RTCDataChannel | null = null;
    let audio: HTMLAudioElement | null = null;
    let negotiation: AbortController | null = null;
    let resourcesRegistered = false;
    const closeUnregisteredResources = () => {
      if (resourcesRegistered) return;

      negotiation?.abort();
      if (channel) {
        channel.onopen = null;
        channel.onmessage = null;
        channel.onerror = null;
        channel.onclose = null;
        channel.close();
      }
      if (peer) {
        peer.ontrack = null;
        peer.onconnectionstatechange = null;
        peer.close();
      }
      microphone?.getTracks().forEach((track) => track.stop());
      if (audio) {
        audio.pause();
        audio.srcObject = null;
      }
    };

    try {
      microphone = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!activeRef.current || generation !== generationRef.current) {
        microphone.getTracks().forEach((track) => track.stop());
        return;
      }

      peer = new RTCPeerConnection();
      audio = new Audio();
      audio.autoplay = true;
      channel = peer.createDataChannel("oai-events");
      negotiation = new AbortController();
      const resources: VoiceResources = {
        peer,
        channel,
        microphone,
        remoteStream: null,
        audio,
        negotiation,
        contextRefresh: null,
      };
      resourcesRef.current = resources;
      resourcesRegistered = true;
      const registeredPeer = peer;
      const registeredAudio = audio;
      const registeredChannel = channel;

      microphone.getTracks().forEach((track) => registeredPeer.addTrack(track, microphone as MediaStream));

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

      registeredPeer.ontrack = (event) => {
        if (generation !== generationRef.current) return;
        const stream = event.streams[0] ?? new MediaStream([event.track]);
        resources.remoteStream = stream;
        registeredAudio.srcObject = stream;
      };
      registeredPeer.onconnectionstatechange = () => {
        if (registeredPeer.connectionState === "failed" || registeredPeer.connectionState === "disconnected") requestReconnect();
      };
      registeredChannel.onmessage = (message) => {
        if (generation !== generationRef.current || typeof message.data !== "string") return;
        try {
          handleRealtimeEvent(JSON.parse(message.data) as RealtimeEvent);
        } catch {
          fail("Realtime voice sent an unreadable update. Retry voice or use text chat.");
        }
      };
      registeredChannel.onerror = requestReconnect;
      registeredChannel.onclose = requestReconnect;
      registeredChannel.onopen = () => {
        if (!activeRef.current || generation !== generationRef.current) return;
        clearSetupTimer();
        setState("LISTENING");
        resetIdleTimer();
        const visibleText = captureVisibleScreenText();
        const currentKey = contextKey(routeRef.current, contextVersionWithVisibleScreen(
          contextVersionRef.current,
          visibleText ? visibleScreenFingerprint(visibleText) : "",
        ));
        if (currentKey !== appliedContextKeyRef.current) {
          void refreshContext(routeRef.current, currentKey);
        }
      };

      const offer = await registeredPeer.createOffer();
      await registeredPeer.setLocalDescription(offer);
      const offerSdp = offer.sdp?.trim();
      if (!offerSdp) throw new Error("EMPTY_OFFER");
      const negotiatedRoute = routeRef.current;
      const negotiatedContextKey = contextKey(negotiatedRoute, contextVersionRef.current);
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
      await registeredPeer.setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp: answerSdp }));
      if (!appliedContextKeyRef.current) appliedContextKeyRef.current = negotiatedContextKey;
    } catch (caught) {
      closeUnregisteredResources();
      if (!activeRef.current || generation !== generationRef.current) return;
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
  }, [
    clearSetupTimer,
    clearTimers,
    closeResources,
    fail,
    handleRealtimeEvent,
    refreshContext,
    resetIdleTimer,
    startTotalTimer,
  ]);

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
    contextVersionRef.current = contextVersion;
    const nextContextKey = contextKey(
      route,
      contextVersionWithVisibleScreen(contextVersion, visibleScreenVersion),
    );
    if (!active || nextContextKey === appliedContextKeyRef.current) return;
    void refreshContext(route, nextContextKey);
  }, [active, contextVersion, refreshContext, route, visibleScreenVersion]);

  useEffect(() => {
    if (!active) return;
    const root = document.getElementById("portal-content");
    if (!root) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const updateVersion = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        setVisibleScreenVersion(visibleScreenFingerprint(captureVisibleScreenText()));
      }, 120);
    };
    updateVersion();
    const observer = new MutationObserver(updateVersion);
    observer.observe(root, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["open", "hidden", "aria-expanded", "aria-invalid"],
    });
    return () => {
      observer.disconnect();
      if (timer) clearTimeout(timer);
    };
  }, [active, route]);

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

  const completedCaptions = captionItems.flatMap((item) => (
    item.completed && item.role && item.text.trim()
      ? [{ role: item.role, text: item.text }]
      : []
  ));
  const latestMemberId = [...captionItems].reverse().find(({ role }) => role === "member")?.id;
  const latestAssistantId = [...captionItems].reverse().find(({ role }) => role === "assistant")?.id;
  const handoffCaptions = captionItems.flatMap((item) => {
    const isVisiblePartial = !item.completed && (
      (item.role === "member" && item.id === latestMemberId)
      || (item.role === "assistant" && item.id === latestAssistantId)
    );
    return (item.completed || isVisiblePartial) && item.role && item.text.trim()
      ? [{ role: item.role, text: item.text }]
      : [];
  });

  return {
    state: active ? state : "IDLE" as AssistantVoiceState,
    transcript,
    answer,
    completedCaptions,
    handoffCaptions,
    error,
    startListening: start,
    stopListening: stop,
    stopSpeaking,
    retry: start,
    stop,
  };
}
