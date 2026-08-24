import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AssistantVoiceControl } from "./assistant-voice-control";

class FakeMediaRecorder {
  static instances: FakeMediaRecorder[] = [];
  static isTypeSupported = vi.fn<(mime: string) => boolean>();
  state: "inactive" | "recording" = "inactive";
  mimeType: string;
  ondataavailable: ((event: BlobEvent) => void) | null = null;
  onstop: (() => void) | null = null;
  constructor(readonly stream: MediaStream, options?: MediaRecorderOptions) { this.mimeType = options?.mimeType ?? ""; FakeMediaRecorder.instances.push(this); }
  start() { this.state = "recording"; }
  stop() { if (this.state === "inactive") return; this.state = "inactive"; this.ondataavailable?.({ data: new Blob(["voice"], { type: this.mimeType }) } as BlobEvent); this.onstop?.(); }
}

class FakeAudio {
  static instances: FakeAudio[] = [];
  static rejectNextPlay = false;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  pause = vi.fn();
  play: ReturnType<typeof vi.fn>;
  constructor(readonly src: string) { const rejectPlay = FakeAudio.rejectNextPlay; this.play = vi.fn(() => rejectPlay ? Promise.reject(new Error("Playback blocked")) : Promise.resolve()); FakeAudio.rejectNextPlay = false; FakeAudio.instances.push(this); }
  finish() { this.onended?.(); }
}

class FakeAnalyser {
  fftSize = 0;
  level = 128;
  getByteTimeDomainData(values: Uint8Array) { values.fill(this.level); }
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  analyser = new FakeAnalyser();
  close = vi.fn(() => Promise.resolve());
  constructor() { FakeAudioContext.instances.push(this); }
  createAnalyser() { return this.analyser as unknown as AnalyserNode; }
  createMediaStreamSource() { return { connect: vi.fn() } as unknown as MediaStreamAudioSourceNode; }
}

const microphoneTrack = { stop: vi.fn() };
const microphoneStream = { getTracks: () => [microphoneTrack] } as unknown as MediaStream;
const getUserMedia = vi.fn();
const fetchMock = vi.fn();
const rafCallbacks = new Map<number, FrameRequestCallback>();
let rafId = 0;

function voiceResponse() { return new Response(new Blob(["speech"], { type: "audio/mpeg" }), { status: 200, headers: { "content-type": "audio/mpeg" } }); }
function runAnimationFrame() { const entry = rafCallbacks.entries().next().value as [number, FrameRequestCallback] | undefined; if (!entry) throw new Error("No animation frame was scheduled"); rafCallbacks.delete(entry[0]); entry[1](Date.now()); }
async function flushMicrotasks() { await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); }); }
function useControlledTimers() {
  vi.useFakeTimers();
  Object.defineProperty(window, "requestAnimationFrame", { configurable: true, value: (callback: FrameRequestCallback) => { const id = ++rafId; rafCallbacks.set(id, callback); return id; } });
  Object.defineProperty(window, "cancelAnimationFrame", { configurable: true, value: (id: number) => rafCallbacks.delete(id) });
}

function renderControl(overrides: Partial<React.ComponentProps<typeof AssistantVoiceControl>> = {}) {
  const props = { active: true, onExit: vi.fn(), onReturnToText: vi.fn(), submitTranscript: vi.fn().mockResolvedValue({ text: "Your passbook lists monthly contributions." }), ...overrides };
  return { ...render(<AssistantVoiceControl {...props} />), props };
}

async function beginListening(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Start listening" }));
  expect(await screen.findByText("Speaking")).toBeVisible();
  expect(screen.getByRole("button", { name: "Stop playback" })).toBeVisible();
  await waitFor(() => expect(FakeAudio.instances).toHaveLength(1));
  FakeAudio.instances[0]?.finish();
  expect(await screen.findByText("Listening")).toBeVisible();
}

describe("AssistantVoiceControl", () => {
  beforeEach(() => {
    vi.stubGlobal("MediaRecorder", FakeMediaRecorder); vi.stubGlobal("Audio", FakeAudio); vi.stubGlobal("AudioContext", FakeAudioContext); vi.stubGlobal("fetch", fetchMock);
    const requestFrame = vi.fn((callback: FrameRequestCallback) => { const id = ++rafId; rafCallbacks.set(id, callback); return id; });
    const cancelFrame = vi.fn((id: number) => rafCallbacks.delete(id));
    vi.stubGlobal("requestAnimationFrame", requestFrame); vi.stubGlobal("cancelAnimationFrame", cancelFrame);
    Object.defineProperty(window, "requestAnimationFrame", { configurable: true, value: requestFrame });
    Object.defineProperty(window, "cancelAnimationFrame", { configurable: true, value: cancelFrame });
    vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:voice"), revokeObjectURL: vi.fn() });
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
    FakeMediaRecorder.instances = []; FakeMediaRecorder.isTypeSupported.mockReset().mockImplementation((mime) => mime === "audio/webm;codecs=opus"); FakeAudio.instances = []; FakeAudio.rejectNextPlay = false; FakeAudioContext.instances = []; rafCallbacks.clear(); rafId = 0;
    microphoneTrack.stop.mockReset(); getUserMedia.mockReset().mockResolvedValue(microphoneStream);
    fetchMock.mockReset().mockImplementation((url: string) => url === "/api/assistant/transcribe" ? Promise.resolve(Response.json({ transcript: "Explain my passbook" })) : Promise.resolve(voiceResponse()));
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("presents the current voice state and caption in a compact EPF voice HUD", () => {
    renderControl();
    const hud = screen.getByRole("region", { name: "EPF Sahayak voice mode" });

    expect(within(hud).getByRole("img", { name: "EPF Sahayak microphone" })).toBeInTheDocument();
    expect(within(hud).getByRole("status")).toHaveTextContent("Ready to listen");
    expect(within(hud).getByRole("group", { name: "Voice caption" })).toHaveTextContent("Speak a question about this page");
    expect(within(hud).getByRole("group", { name: "Voice controls" })).toBeInTheDocument();
  });

  it("requests permission before speaking the greeting and starts listening after greeting playback", async () => {
    const user = userEvent.setup(); renderControl();
    expect(fetchMock).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Start listening" }));
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true }); expect(await screen.findByText("Speaking")).toBeVisible(); expect(screen.getByRole("button", { name: "Stop playback" })).toBeVisible(); expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/assistant/speech");
    FakeAudio.instances[0]?.finish(); expect(await screen.findByText("Listening")).toBeVisible();
  });

  it("keeps listening available when greeting playback is rejected", async () => {
    FakeAudio.rejectNextPlay = true;
    const user = userEvent.setup(); renderControl();
    await user.click(screen.getByRole("button", { name: "Start listening" }));
    expect(await screen.findByText("Listening")).toBeVisible();
    expect(screen.getByText("I could not play the greeting. You can start speaking when you are ready.")).toBeVisible();
  });

  it("cleans greeting playback errors and continues to listening", async () => {
    const user = userEvent.setup(); renderControl(); await user.click(screen.getByRole("button", { name: "Start listening" }));
    expect(await screen.findByText("Speaking")).toBeVisible(); FakeAudio.instances[0]?.onerror?.();
    expect(await screen.findByText("Listening")).toBeVisible(); expect(FakeAudio.instances[0]?.pause).toHaveBeenCalled(); expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:voice");
  });

  it("stops a recorded turn after speech is followed by 1.2 seconds of silence", async () => {
    useControlledTimers(); renderControl(); fireEvent.click(screen.getByRole("button", { name: "Start listening" })); await flushMicrotasks(); expect(screen.getByText("Speaking")).toBeVisible(); await act(async () => { FakeAudio.instances[0]?.finish(); }); expect(screen.getByText("Listening")).toBeVisible();
    const recorder = FakeMediaRecorder.instances[0]!; const analyser = FakeAudioContext.instances[0]!.analyser; expect(rafCallbacks.size).toBeGreaterThan(0);
    analyser.level = 148; runAnimationFrame(); analyser.level = 128; runAnimationFrame(); expect(recorder.state).toBe("recording"); vi.advanceTimersByTime(1_200); runAnimationFrame();
    expect(recorder.state).toBe("inactive");
  });

  it("stops a listening turn at the 30 second maximum", async () => {
    useControlledTimers(); renderControl(); fireEvent.click(screen.getByRole("button", { name: "Start listening" })); await flushMicrotasks(); await act(async () => { FakeAudio.instances[0]?.finish(); }); const recorder = FakeMediaRecorder.instances[0]!;
    vi.advanceTimersByTime(30_000);
    expect(recorder.state).toBe("inactive");
  });

  it("transcribes the actual recording, submits its transcript with a signal, and plays one answer", async () => {
    const user = userEvent.setup(); const { props } = renderControl(); await beginListening(user); await user.click(screen.getByRole("button", { name: "Stop listening" }));
    expect(await screen.findByText("Explain my passbook")).toBeVisible(); expect(props.submitTranscript).toHaveBeenCalledWith("Explain my passbook", expect.any(AbortSignal)); expect(screen.getByText("Your passbook lists monthly contributions.")).toBeVisible(); expect(screen.getByText("Speaking")).toBeVisible(); expect(FakeAudio.instances).toHaveLength(2);
    const transcription = fetchMock.mock.calls.find(([url]) => url === "/api/assistant/transcribe"); const uploaded = (transcription?.[1] as RequestInit).body as FormData; const file = uploaded.get("audio") as File;
    expect(file.type).toBe("audio/webm;codecs=opus"); expect(file.name).toBe("voice-turn.webm"); const speech = fetchMock.mock.calls.at(-1)!; expect(speech[0]).toBe("/api/assistant/speech"); expect(JSON.parse((speech[1] as RequestInit).body as string)).toEqual({ text: "Your passbook lists monthly contributions." });
  });

  it("uses MP4 for the upload when it is the supported recording format", async () => {
    FakeMediaRecorder.isTypeSupported.mockImplementation((mime) => mime === "audio/mp4"); const user = userEvent.setup(); renderControl(); await beginListening(user); await user.click(screen.getByRole("button", { name: "Stop listening" })); await screen.findByText("Explain my passbook");
    const transcription = fetchMock.mock.calls.find(([url]) => url === "/api/assistant/transcribe"); const file = ((transcription?.[1] as RequestInit).body as FormData).get("audio") as File;
    expect(file.type).toBe("audio/mp4"); expect(file.name).toBe("voice-turn.mp4");
  });

  it("rejects a recorder with no supported WebM or MP4 MIME type", async () => {
    FakeMediaRecorder.isTypeSupported.mockReturnValue(false); const user = userEvent.setup(); renderControl(); await user.click(screen.getByRole("button", { name: "Start listening" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Voice recording is not supported"); expect(getUserMedia).not.toHaveBeenCalled();
  });

  it("aborts the assistant request and resets to idle when voice mode becomes inactive", async () => {
    let resolveAnswer: ((answer: { text: string }) => void) | undefined;
    const submitTranscript = vi.fn((_text: string, signal?: AbortSignal) => new Promise<{ text: string }>((resolve) => { resolveAnswer = resolve; signal?.addEventListener("abort", () => undefined); }));
    const user = userEvent.setup(); const { rerender } = render(<AssistantVoiceControl active onExit={vi.fn()} onReturnToText={vi.fn()} submitTranscript={submitTranscript} />); await beginListening(user); await user.click(screen.getByRole("button", { name: "Stop listening" })); expect(await screen.findByText("Thinking")).toBeVisible(); const signal = submitTranscript.mock.calls[0]?.[1] as AbortSignal;
    rerender(<AssistantVoiceControl active={false} onExit={vi.fn()} onReturnToText={vi.fn()} submitTranscript={submitTranscript} />); resolveAnswer?.({ text: "Late answer" });
    expect(signal.aborted).toBe(true); expect(screen.getByText("Ready to listen")).toBeVisible(); expect(screen.getByRole("button", { name: "Start listening" })).toBeDisabled(); await Promise.resolve(); expect(screen.queryByText("Late answer")).not.toBeInTheDocument();
  });

  it("aborts an in-flight transcription request when voice mode exits", async () => {
    let transcriptionSignal: AbortSignal | undefined;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => url === "/api/assistant/transcribe"
      ? new Promise(() => { transcriptionSignal = init?.signal as AbortSignal; })
      : Promise.resolve(voiceResponse()));
    const user = userEvent.setup(); renderControl(); await beginListening(user); await user.click(screen.getByRole("button", { name: "Stop listening" }));
    expect(await screen.findByText("Transcribing")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "End voice mode" }));
    expect(transcriptionSignal?.aborted).toBe(true);
  });

  it("lifecycle cleanup cancels listening resources on deactivation and unmount without manual stop", async () => {
    const clearTimer = vi.spyOn(globalThis, "clearTimeout");
    const user = userEvent.setup(); const { rerender, unmount } = renderControl(); await beginListening(user);
    rerender(<AssistantVoiceControl active={false} onExit={vi.fn()} onReturnToText={vi.fn()} submitTranscript={vi.fn()} />);
    expect(FakeMediaRecorder.instances[0]?.state).toBe("inactive"); expect(microphoneTrack.stop).toHaveBeenCalled(); expect(clearTimer).toHaveBeenCalled(); expect(rafCallbacks.size).toBe(0); expect(FakeAudioContext.instances[0]?.close).toHaveBeenCalled();
    unmount();
  });

  it("exit cancels listening resources without a preceding manual stop", async () => {
    const onExit = vi.fn(); const user = userEvent.setup(); renderControl({ onExit }); await beginListening(user);
    await user.click(screen.getByRole("button", { name: "End voice mode" }));
    expect(onExit).toHaveBeenCalledTimes(1); expect(FakeMediaRecorder.instances[0]?.state).toBe("inactive"); expect(microphoneTrack.stop).toHaveBeenCalled(); expect(rafCallbacks.size).toBe(0); expect(FakeAudioContext.instances[0]?.close).toHaveBeenCalled();
  });

  it("unmount cleanup cancels active listening without deactivation or exit", async () => {
    const clearTimer = vi.spyOn(globalThis, "clearTimeout");
    const user = userEvent.setup(); const { unmount } = renderControl(); await beginListening(user);
    unmount();
    expect(FakeMediaRecorder.instances[0]?.state).toBe("inactive"); expect(microphoneTrack.stop).toHaveBeenCalled(); expect(clearTimer).toHaveBeenCalled(); expect(rafCallbacks.size).toBe(0); expect(FakeAudioContext.instances[0]?.close).toHaveBeenCalled();
  });

  it("cancels the permission-acquired stream when voice mode exits during the greeting", async () => {
    const user = userEvent.setup(); renderControl(); await user.click(screen.getByRole("button", { name: "Start listening" }));
    expect(await screen.findByText("Speaking")).toBeVisible(); await user.click(screen.getByRole("button", { name: "End voice mode" }));
    expect(microphoneTrack.stop).toHaveBeenCalled(); expect(FakeMediaRecorder.instances).toHaveLength(0);
  });

  it("aborts pending speech when playback is stopped and ignores its late response", async () => {
    let pendingSpeechSignal: AbortSignal | undefined;
    let resolvePendingSpeech: ((response: Response) => void) | undefined;
    let speechCalls = 0;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/assistant/transcribe") return Promise.resolve(Response.json({ transcript: "Explain my passbook" }));
      speechCalls += 1;
      if (speechCalls === 1) return Promise.resolve(voiceResponse());
      return new Promise<Response>((resolve) => { pendingSpeechSignal = init?.signal as AbortSignal; resolvePendingSpeech = resolve; });
    });
    const user = userEvent.setup(); renderControl(); await beginListening(user); await user.click(screen.getByRole("button", { name: "Stop listening" })); expect(await screen.findByText("Speaking")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Stop playback" })); resolvePendingSpeech?.(voiceResponse()); await Promise.resolve(); await Promise.resolve();
    expect(pendingSpeechSignal?.aborted).toBe(true); expect(FakeAudio.instances).toHaveLength(1); expect(screen.getByText("Ready to listen")).toBeVisible();
  });

  it("exit aborts pending speech synthesis and ignores its late response", async () => {
    let pendingSpeechSignal: AbortSignal | undefined;
    let resolvePendingSpeech: ((response: Response) => void) | undefined;
    let speechCalls = 0;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/assistant/transcribe") return Promise.resolve(Response.json({ transcript: "Explain my passbook" }));
      speechCalls += 1;
      if (speechCalls === 1) return Promise.resolve(voiceResponse());
      return new Promise<Response>((resolve) => { pendingSpeechSignal = init?.signal as AbortSignal; resolvePendingSpeech = resolve; });
    });
    const user = userEvent.setup(); renderControl(); await beginListening(user); await user.click(screen.getByRole("button", { name: "Stop listening" })); expect(await screen.findByText("Speaking")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "End voice mode" })); resolvePendingSpeech?.(voiceResponse()); await Promise.resolve(); await Promise.resolve();
    expect(pendingSpeechSignal?.aborted).toBe(true); expect(FakeAudio.instances).toHaveLength(1);
  });

  it("unmount cleanup aborts pending speech synthesis before it can create playback", async () => {
    let pendingSpeechSignal: AbortSignal | undefined;
    let resolvePendingSpeech: ((response: Response) => void) | undefined;
    let speechCalls = 0;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === "/api/assistant/transcribe") return Promise.resolve(Response.json({ transcript: "Explain my passbook" }));
      speechCalls += 1;
      if (speechCalls === 1) return Promise.resolve(voiceResponse());
      return new Promise<Response>((resolve) => { pendingSpeechSignal = init?.signal as AbortSignal; resolvePendingSpeech = resolve; });
    });
    const user = userEvent.setup(); const { unmount } = renderControl(); await beginListening(user); await user.click(screen.getByRole("button", { name: "Stop listening" })); expect(await screen.findByText("Speaking")).toBeVisible();
    unmount(); resolvePendingSpeech?.(voiceResponse()); await Promise.resolve(); await Promise.resolve();
    expect(pendingSpeechSignal?.aborted).toBe(true); expect(FakeAudio.instances).toHaveLength(1); expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:voice");
  });

  it("uses the latest submit callback after a rerender without restarting the active recorder", async () => {
    const oldSubmit = vi.fn().mockResolvedValue({ text: "Old answer" });
    const latestSubmit = vi.fn().mockResolvedValue({ text: "Latest answer" });
    const user = userEvent.setup(); const { rerender } = render(<AssistantVoiceControl active onExit={vi.fn()} onReturnToText={vi.fn()} submitTranscript={oldSubmit} />); await beginListening(user);
    rerender(<AssistantVoiceControl active onExit={vi.fn()} onReturnToText={vi.fn()} submitTranscript={latestSubmit} />); await user.click(screen.getByRole("button", { name: "Stop listening" }));
    expect(await screen.findByText("Latest answer")).toBeVisible(); expect(latestSubmit).toHaveBeenCalledWith("Explain my passbook", expect.any(AbortSignal)); expect(oldSubmit).not.toHaveBeenCalled();
  });

  it("cleans playback, URLs, RAF, timers, and audio context on exit and unmount", async () => {
    const user = userEvent.setup(); const { unmount } = renderControl(); await beginListening(user); await user.click(screen.getByRole("button", { name: "Stop listening" })); await screen.findByText("Speaking"); const answerAudio = FakeAudio.instances[1]!;
    await user.click(screen.getByRole("button", { name: "End voice mode" }));
    expect(answerAudio.pause).toHaveBeenCalled(); expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:voice"); expect(cancelAnimationFrame).toHaveBeenCalled(); expect(FakeAudioContext.instances[0]?.close).toHaveBeenCalled(); expect(microphoneTrack.stop).toHaveBeenCalled(); unmount();
  });

  it("cleans audio before reporting a rejected playback", async () => {
    const user = userEvent.setup(); renderControl(); await beginListening(user); FakeAudio.rejectNextPlay = true; await user.click(screen.getByRole("button", { name: "Stop listening" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Playback blocked"); expect(FakeAudio.instances[1]?.pause).toHaveBeenCalled(); expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:voice");
  });
});
