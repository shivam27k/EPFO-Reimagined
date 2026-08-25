import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AssistantVoiceControl } from "./assistant-voice-control";

vi.mock("next/navigation", () => ({
  usePathname: () => "/overview",
}));

class FakeDataChannel {
  static instances: FakeDataChannel[] = [];
  readonly label: string;
  readyState: RTCDataChannelState = "connecting";
  onclose: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent<string>) => void) | null = null;
  onopen: ((event: Event) => void) | null = null;
  send = vi.fn();
  close = vi.fn(() => {
    this.readyState = "closed";
  });

  constructor(label: string) {
    this.label = label;
    FakeDataChannel.instances.push(this);
  }

  open() {
    this.readyState = "open";
    this.onopen?.(new Event("open"));
  }

  receive(event: Record<string, unknown>) {
    this.onmessage?.({ data: JSON.stringify(event) } as MessageEvent<string>);
  }
}

class FakePeerConnection {
  static instances: FakePeerConnection[] = [];
  static throwOnDataChannelCreate = false;
  connectionState: RTCPeerConnectionState = "new";
  localDescription: RTCSessionDescriptionInit | null = null;
  onconnectionstatechange: ((event: Event) => void) | null = null;
  ontrack: ((event: RTCTrackEvent) => void) | null = null;
  readonly channel: FakeDataChannel;
  addTrack = vi.fn();
  close = vi.fn(() => {
    this.connectionState = "closed";
  });
  createOffer = vi.fn(async () => ({ type: "offer" as const, sdp: "offer-sdp" }));
  setLocalDescription = vi.fn(async (description: RTCSessionDescriptionInit) => {
    this.localDescription = description;
  });
  setRemoteDescription = vi.fn(async () => undefined);

  constructor() {
    this.channel = new FakeDataChannel("oai-events");
    FakePeerConnection.instances.push(this);
  }

  createDataChannel = vi.fn((label: string) => {
    if (FakePeerConnection.throwOnDataChannelCreate) throw new Error("channel setup failed");
    expect(label).toBe("oai-events");
    return this.channel as unknown as RTCDataChannel;
  });

  connect() {
    this.connectionState = "connected";
    this.onconnectionstatechange?.(new Event("connectionstatechange"));
  }

  fail() {
    this.connectionState = "failed";
    this.onconnectionstatechange?.(new Event("connectionstatechange"));
  }

  receiveTrack(stream: MediaStream) {
    this.ontrack?.({ streams: [stream] } as unknown as RTCTrackEvent);
  }
}

class FakeSessionDescription {
  readonly type: RTCSdpType;
  readonly sdp: string;

  constructor(description: RTCSessionDescriptionInit) {
    this.type = description.type;
    this.sdp = description.sdp ?? "";
  }
}

class FakeRemoteAudio {
  static instances: FakeRemoteAudio[] = [];
  autoplay = false;
  srcObject: MediaProvider | null = null;
  pause = vi.fn();
  play = vi.fn(async () => undefined);

  constructor() {
    FakeRemoteAudio.instances.push(this);
  }
}

const fetchMock = vi.fn();
const getUserMedia = vi.fn();
const localTracks: Array<{ stop: ReturnType<typeof vi.fn> }> = [];
const remoteTrack = { stop: vi.fn() };
const remoteStream = { getTracks: () => [remoteTrack] } as unknown as MediaStream;
const fullClaimsInstructions = [
  "You are EPF Sahayak. Never invent member facts and require explicit confirmation for actions.",
  "Respond only in English or Hindi. Write Hindi in Devanagari and never Urdu or Arabic script.",
  "Current masked portal context (synthetic data only):",
  JSON.stringify({
    route: "/claims",
    screen: { name: "Final settlement", purpose: "Check claim readiness", officialTerm: "Form 19" },
    member: { profile: { uanMasked: "XXXX XXXX 7890" } },
    findings: [{ code: "MISSING_EXIT_DATE" }],
    activeProcess: { key: "FINAL_CLAIM" },
    recentConversation: [{ role: "member", text: "Can I claim?" }],
  }),
].join("\n\n");

function createMicrophoneStream() {
  const track = { stop: vi.fn() };
  const stream = { getTracks: () => [track] } as unknown as MediaStream;
  localTracks.push(track);
  return stream;
}

function renderControl(overrides: Partial<React.ComponentProps<typeof AssistantVoiceControl>> = {}) {
  const props = {
    active: true,
    contextVersion: "snapshot-v1",
    route: "/overview",
    onExit: vi.fn(),
    onReturnToText: vi.fn(),
    ...overrides,
  };
  return { ...render(<AssistantVoiceControl {...props} />), props };
}

async function beginRealtimeSession(overrides: Partial<React.ComponentProps<typeof AssistantVoiceControl>> = {}) {
  const initialFetchCount = fetchMock.mock.calls.length;
  const view = renderControl(overrides);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(initialFetchCount + 1));
  const peer = FakePeerConnection.instances.at(-1)!;

  act(() => {
    peer.receiveTrack(remoteStream);
    peer.connect();
    peer.channel.open();
  });

  expect(await screen.findByText("Listening")).toBeVisible();
  return { ...view, peer, channel: peer.channel };
}

async function beginRealtimeSessionWithFakeTimers() {
  vi.useFakeTimers();
  const view = renderControl();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const peer = FakePeerConnection.instances.at(-1)!;
  act(() => {
    peer.receiveTrack(remoteStream);
    peer.connect();
    peer.channel.open();
  });
  expect(screen.getByRole("status")).toHaveTextContent("Listening");
  return { ...view, peer, channel: peer.channel };
}

function sentEvents(channel: FakeDataChannel) {
  return channel.send.mock.calls.map(([payload]) => JSON.parse(payload as string) as Record<string, unknown>);
}

describe("AssistantVoiceControl Realtime WebRTC mode", () => {
  beforeEach(() => {
    FakeDataChannel.instances = [];
    FakePeerConnection.instances = [];
    FakePeerConnection.throwOnDataChannelCreate = false;
    FakeRemoteAudio.instances = [];
    localTracks.length = 0;
    remoteTrack.stop.mockReset();
    fetchMock.mockReset().mockImplementation(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "GET") return Response.json({ instructions: fullClaimsInstructions });
      return new Response("answer-sdp", {
        status: 200,
        headers: { "content-type": "application/sdp" },
      });
    });
    getUserMedia.mockReset().mockImplementation(async () => createMicrophoneStream());
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("RTCPeerConnection", FakePeerConnection);
    vi.stubGlobal("RTCSessionDescription", FakeSessionDescription);
    vi.stubGlobal("Audio", FakeRemoteAudio);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("keeps text chat and explicit exit available while the session connects", async () => {
    getUserMedia.mockImplementation(() => new Promise(() => undefined));
    renderControl();

    expect(await screen.findByText("Connecting")).toBeVisible();
    expect(screen.getByRole("button", { name: "Open text chat" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "End voice mode" })).toBeEnabled();
  });

  it("starts one persistent SDP session and attaches streamed remote audio", async () => {
    const { peer } = await beginRealtimeSession();

    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(peer.addTrack).toHaveBeenCalledWith(expect.anything(), expect.anything());
    expect(fetchMock).toHaveBeenCalledWith("/api/assistant/realtime?route=%2Foverview", {
      method: "POST",
      headers: { "content-type": "application/sdp" },
      body: "offer-sdp",
      signal: expect.any(AbortSignal),
    });
    expect(peer.setRemoteDescription).toHaveBeenCalledWith(expect.objectContaining({
      type: "answer",
      sdp: "answer-sdp",
    }));
    expect(FakeRemoteAudio.instances[0]).toMatchObject({ autoplay: true, srcObject: remoteStream });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls.every(([url]) => !String(url).match(/\/(transcribe|speech)$/))).toBe(true);
  });

  it("renders incremental user and assistant captions only after script sanitization", async () => {
    const { channel } = await beginRealtimeSession();
    const caption = screen.getByRole("group", { name: "Voice caption" });

    act(() => {
      channel.receive({ type: "conversation.item.input_audio_transcription.delta", item_id: "member-1", delta: "मेरा " });
      channel.receive({ type: "conversation.item.input_audio_transcription.delta", item_id: "member-1", delta: "passbook" });
      channel.receive({ type: "response.output_audio_transcript.delta", item_id: "assistant-1", delta: "Your balance " });
      channel.receive({ type: "response.output_audio_transcript.delta", item_id: "assistant-1", delta: "is ready." });
    });

    expect(caption).toHaveTextContent("मेरा passbook");
    expect(caption).toHaveTextContent("Your balance is ready.");
    expect(caption.querySelector(".assistant-text-hindi")).toHaveTextContent("मेरा");
    expect(caption.querySelector(".assistant-text-english")).toHaveTextContent("passbook");

    act(() => {
      channel.receive({ type: "conversation.item.input_audio_transcription.completed", item_id: "member-1", transcript: "میرا پاس بک" });
      channel.receive({ type: "response.output_audio_transcript.done", item_id: "assistant-1", transcript: "سلام" });
    });

    expect(caption).toHaveTextContent("Voice received. आवाज़ मिली।");
    expect(caption).toHaveTextContent("Speech received in an unsupported script. Please speak in English or Hindi.");
    expect(caption).not.toHaveTextContent("میرا پاس بک");
    expect(caption).not.toHaveTextContent("سلام");
    expect(within(caption).queryByRole("alert")).not.toBeInTheDocument();
  });

  it("returns out-of-order completions in conversation item order", async () => {
    const onReturnToText = vi.fn();
    const { channel } = await beginRealtimeSession({ onReturnToText });

    act(() => {
      channel.receive({ type: "conversation.item.created", previous_item_id: "member-2", item: { id: "assistant-2", role: "assistant" } });
      channel.receive({ type: "conversation.item.created", previous_item_id: null, item: { id: "member-1", role: "user" } });
      channel.receive({ type: "conversation.item.created", previous_item_id: "assistant-1", item: { id: "member-2", role: "user" } });
      channel.receive({ type: "conversation.item.created", previous_item_id: "member-1", item: { id: "assistant-1", role: "assistant" } });
      channel.receive({ type: "response.output_audio_transcript.done", item_id: "assistant-2", transcript: "Review your contributions." });
      channel.receive({ type: "conversation.item.input_audio_transcription.completed", item_id: "member-2", transcript: "What next?" });
      channel.receive({ type: "response.output_audio_transcript.done", item_id: "assistant-1", transcript: "आपका passbook तैयार है" });
      channel.receive({ type: "conversation.item.input_audio_transcription.completed", item_id: "member-1", transcript: "मेरा passbook" });
    });

    const liveCaption = screen.getByRole("group", { name: "Voice caption" });
    expect(liveCaption).toHaveTextContent("What next?");
    expect(liveCaption).toHaveTextContent("Review your contributions.");
    expect(liveCaption).not.toHaveTextContent("मेरा passbook");
    expect(liveCaption).not.toHaveTextContent("आपका passbook तैयार है");
    fireEvent.click(screen.getByRole("button", { name: "Open text chat" }));

    expect(onReturnToText).toHaveBeenCalledWith([
      { role: "member", text: "मेरा passbook" },
      { role: "assistant", text: "आपका passbook तैयार है" },
      { role: "member", text: "What next?" },
      { role: "assistant", text: "Review your contributions." },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("hands off completed captions and visible partial items exactly once", async () => {
    const onReturnToText = vi.fn();
    const { channel } = await beginRealtimeSession({ onReturnToText });

    act(() => {
      channel.receive({ type: "conversation.item.created", previous_item_id: null, item: { id: "member-1", role: "user" } });
      channel.receive({ type: "conversation.item.created", previous_item_id: "member-1", item: { id: "assistant-1", role: "assistant" } });
      channel.receive({ type: "conversation.item.created", previous_item_id: "assistant-1", item: { id: "member-2", role: "user" } });
      channel.receive({ type: "conversation.item.input_audio_transcription.delta", item_id: "member-1", delta: "Show my passbook" });
      channel.receive({ type: "conversation.item.input_audio_transcription.completed", item_id: "member-1", transcript: "Show my passbook" });
      channel.receive({ type: "response.output_audio_transcript.delta", item_id: "assistant-1", delta: "Your posted balance is " });
      channel.receive({ type: "response.output_audio_transcript.delta", item_id: "assistant-1", delta: "visible." });
      channel.receive({ type: "conversation.item.input_audio_transcription.delta", item_id: "member-2", delta: "Which month?" });
      channel.receive({ type: "conversation.item.input_audio_transcription.completed", item_id: "member-1", transcript: "Show my passbook" });
    });
    fireEvent.click(screen.getByRole("button", { name: "Open text chat" }));

    expect(onReturnToText).toHaveBeenCalledWith([
      { role: "member", text: "Show my passbook" },
      { role: "assistant", text: "Your posted balance is visible." },
      { role: "member", text: "Which month?" },
    ]);
  });

  it("maps streamed audio lifecycle events and allows speech or a control to interrupt output", async () => {
    const { channel } = await beginRealtimeSession();

    act(() => channel.receive({ type: "output_audio_buffer.started", response_id: "response-1" }));
    expect(screen.getByRole("status")).toHaveTextContent("Speaking");

    act(() => channel.receive({ type: "input_audio_buffer.speech_started", item_id: "member-2" }));
    expect(screen.getByRole("status")).toHaveTextContent("Listening");

    act(() => channel.receive({ type: "output_audio_buffer.started", response_id: "response-2" }));
    fireEvent.click(screen.getByRole("button", { name: "Stop playback" }));

    expect(sentEvents(channel)).toEqual(expect.arrayContaining([
      { type: "response.cancel" },
      { type: "output_audio_buffer.clear" },
    ]));
    expect(screen.getByRole("status")).toHaveTextContent("Listening");

    act(() => channel.receive({ type: "output_audio_buffer.stopped", response_id: "response-2" }));
    expect(screen.getByRole("status")).toHaveTextContent("Listening");
  });

  it("fetches and sends complete fresh instructions when the pathname changes", async () => {
    const { channel, props, rerender } = await beginRealtimeSession();
    expect(channel.send).not.toHaveBeenCalled();

    rerender(<AssistantVoiceControl {...props} route="/claims" />);

    await waitFor(() => expect(channel.send).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith("/api/assistant/realtime?route=%2Fclaims", {
      method: "GET",
      headers: { accept: "application/json" },
      signal: expect.any(AbortSignal),
    });
    expect(sentEvents(channel)).toEqual([{
      type: "session.update",
      session: {
        type: "realtime",
        instructions: fullClaimsInstructions,
      },
    }]);
    expect(String((sentEvents(channel)[0]?.session as Record<string, unknown>).instructions)).toContain("Final settlement");
    expect(String((sentEvents(channel)[0]?.session as Record<string, unknown>).instructions)).toContain("explicit confirmation");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("refreshes complete instructions when the member snapshot changes on the same pathname", async () => {
    const updatedInstructions = fullClaimsInstructions.replace("MISSING_EXIT_DATE", "EXIT_DATE_RECORDED");
    const { channel, props, rerender } = await beginRealtimeSession({ route: "/claims" });
    fetchMock.mockResolvedValueOnce(Response.json({ instructions: updatedInstructions }));

    rerender(<AssistantVoiceControl {...props} contextVersion="snapshot-v2" route="/claims" />);

    await waitFor(() => expect(channel.send).toHaveBeenCalledTimes(1));
    expect(sentEvents(channel)).toEqual([{
      type: "session.update",
      session: { type: "realtime", instructions: updatedInstructions },
    }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("ignores stale context responses that complete after a newer refresh", async () => {
    let resolveOlder: ((response: Response) => void) | undefined;
    let resolveNewer: ((response: Response) => void) | undefined;
    const older = new Promise<Response>((resolve) => { resolveOlder = resolve; });
    const newer = new Promise<Response>((resolve) => { resolveNewer = resolve; });
    const { channel, props, rerender } = await beginRealtimeSession();
    fetchMock.mockImplementationOnce(() => older).mockImplementationOnce(() => newer);

    rerender(<AssistantVoiceControl {...props} contextVersion="snapshot-v2" route="/claims" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    rerender(<AssistantVoiceControl {...props} contextVersion="snapshot-v3" route="/passbook" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));

    const newestInstructions = fullClaimsInstructions.replaceAll("claims", "passbook").replace("Final settlement", "Contributions and passbook");
    resolveNewer?.(Response.json({ instructions: newestInstructions }));
    await waitFor(() => expect(channel.send).toHaveBeenCalledTimes(1));
    resolveOlder?.(Response.json({ instructions: fullClaimsInstructions }));
    await act(async () => { await older; });

    expect(sentEvents(channel)).toEqual([{
      type: "session.update",
      session: { type: "realtime", instructions: newestInstructions },
    }]);
  });

  it("keeps the last complete context when a refresh fails", async () => {
    const { channel, props, rerender } = await beginRealtimeSession();
    fetchMock.mockResolvedValueOnce(Response.json({ error: "unavailable" }, { status: 503 }));

    rerender(<AssistantVoiceControl {...props} route="/claims" />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(channel.send).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("Listening");
  });

  it("uses one fresh SDP reconnect and exposes text fallback after the second peer failure", async () => {
    const { peer } = await beginRealtimeSession();

    act(() => peer.fail());
    expect(await screen.findByText("Reconnecting")).toBeVisible();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    const replacement = FakePeerConnection.instances[1]!;
    act(() => {
      replacement.connect();
      replacement.channel.open();
    });
    expect(await screen.findByText("Listening")).toBeVisible();

    act(() => replacement.fail());
    expect(await screen.findByRole("alert")).toHaveTextContent("reconnect");
    expect(screen.getByRole("status")).toHaveTextContent("Voice needs attention");
    expect(screen.getByRole("button", { name: "Open text chat" })).toBeEnabled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not negotiate when microphone permission is denied", async () => {
    getUserMedia.mockRejectedValue(new DOMException("Denied", "NotAllowedError"));
    renderControl();

    expect(await screen.findByRole("alert")).toHaveTextContent("Microphone permission was denied");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Open text chat" })).toBeEnabled();
  });

  it("releases the microphone and peer if setup fails before resources are registered", async () => {
    FakePeerConnection.throwOnDataChannelCreate = true;
    renderControl();

    expect(await screen.findByRole("alert")).toHaveTextContent("could not connect");
    expect(localTracks[0]?.stop).toHaveBeenCalledTimes(1);
    expect(FakePeerConnection.instances[0]?.close).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("bounds connection setup at fifteen seconds and cleans partial resources", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation((_input: RequestInfo | URL, init?: RequestInit) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    }));
    renderControl();
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    const peer = FakePeerConnection.instances[0]!;

    await act(async () => { await vi.advanceTimersByTimeAsync(15_000); });

    expect(screen.getByRole("alert")).toHaveTextContent("15 seconds");
    expect(screen.getByRole("button", { name: "Open text chat" })).toBeEnabled();
    expect(localTracks[0]?.stop).toHaveBeenCalledTimes(1);
    expect(peer.channel.close).toHaveBeenCalledTimes(1);
    expect(peer.close).toHaveBeenCalledTimes(1);
  });

  it("closes local and remote tracks, data channel, audio, and peer on exit", async () => {
    const onExit = vi.fn();
    const { peer } = await beginRealtimeSession({ onExit });

    fireEvent.click(screen.getByRole("button", { name: "End voice mode" }));

    expect(onExit).toHaveBeenCalledTimes(1);
    expect(localTracks[0]?.stop).toHaveBeenCalledTimes(1);
    expect(remoteTrack.stop).toHaveBeenCalledTimes(1);
    expect(peer.channel.close).toHaveBeenCalledTimes(1);
    expect(peer.close).toHaveBeenCalledTimes(1);
    expect(FakeRemoteAudio.instances[0]?.pause).toHaveBeenCalledTimes(1);
    expect(FakeRemoteAudio.instances[0]?.srcObject).toBeNull();
  });

  it("tears down the session on logout-style deactivation and unmount", async () => {
    const first = await beginRealtimeSession();
    first.rerender(<AssistantVoiceControl {...first.props} active={false} />);

    await waitFor(() => expect(first.peer.close).toHaveBeenCalledTimes(1));
    expect(first.peer.channel.close).toHaveBeenCalledTimes(1);
    expect(localTracks[0]?.stop).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toHaveTextContent("Ready for voice");

    first.unmount();
    const second = await beginRealtimeSession();
    second.unmount();
    expect(second.peer.close).toHaveBeenCalledTimes(1);
    expect(second.peer.channel.close).toHaveBeenCalledTimes(1);
    expect(localTracks[1]?.stop).toHaveBeenCalledTimes(1);
  });

  it("closes an inactive Realtime session after ten minutes", async () => {
    const { peer } = await beginRealtimeSessionWithFakeTimers();

    act(() => vi.advanceTimersByTime(10 * 60 * 1_000));

    expect(screen.getByRole("alert")).toHaveTextContent("10 minutes without activity");
    expect(peer.channel.close).toHaveBeenCalledTimes(1);
    expect(peer.close).toHaveBeenCalledTimes(1);
  });

  it("closes an active Realtime session at the thirty-minute total limit", async () => {
    const { channel, peer } = await beginRealtimeSessionWithFakeTimers();

    for (let interval = 0; interval < 3; interval += 1) {
      act(() => vi.advanceTimersByTime(9 * 60 * 1_000));
      act(() => channel.receive({ type: "session.updated" }));
    }
    act(() => vi.advanceTimersByTime(3 * 60 * 1_000));

    expect(screen.getByRole("alert")).toHaveTextContent("30-minute limit");
    expect(peer.channel.close).toHaveBeenCalledTimes(1);
    expect(peer.close).toHaveBeenCalledTimes(1);
  });

  it("surfaces protocol errors without hiding the text-chat exit", async () => {
    const { channel } = await beginRealtimeSession();

    act(() => channel.receive({
      type: "error",
      error: { type: "server_error", message: "Internal Realtime failure" },
    }));

    const hud = screen.getByRole("region", { name: "EPF Sahayak voice mode" });
    expect(within(hud).getByRole("status")).toHaveTextContent("Voice needs attention");
    expect(within(hud).getByRole("alert")).toHaveTextContent("Realtime voice needs attention");
    expect(within(hud).getByRole("button", { name: "Open text chat" })).toBeEnabled();
    expect(within(hud).getByRole("button", { name: "End voice mode" })).toBeEnabled();
  });
});
