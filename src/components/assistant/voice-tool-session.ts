import type { ToolResult } from "@/domain/assistant-tools";
import { AssistantRequestError, assistantRequest, executeVoiceTool, recoverCall, type ObserveUi } from "./assistant-transport";
import { rememberCall } from "./use-assistant-actions";

type Registration = { turnId: string; proposalId: string | null; decision: string | null;
  onboardingSourceId: string | null; expiresAt: string; fieldErrors?: Record<string, string>; exclusions?: string[] };
type Turn = {
  generation: number; itemId: string; route: string; controller: AbortController;
  registered: Promise<Registration | null>; resolve: (value: Registration | null) => void;
  registrationStarted: boolean; attempts: number;
  registrationFailure?: { code: string; message: string };
};
type Call = { call_id: string; name: string; arguments: string };
type ResponseEvent = { id?: unknown; status?: unknown; output?: unknown };

// Evidence for interruption only, never consent or tool authorization. Do not
// impose a word-count minimum: "stop", "no", and "रुको" must remain valid.
export function hasSpeechEvidence(text: string): boolean {
  const spoken = text.replace(/\[[^\]]*(?:\]|$)|\([^)]*(?:\)|$)|<[^>]*(?:>|$)/gu, " ").trim();
  if (!/\p{L}/u.test(spoken)) return false;
  return !/^(?:\s|[.,!…-]|cough(?:ing|s)?|sneez(?:e|ing|es)|sigh(?:ing|s)?|breath(?:ing)?|noise|silence|inaudible|unintelligible|achoo)+$/iu.test(spoken);
}
type Dependencies = {
  send: (event: Record<string, unknown>) => boolean;
  observe: ObserveUi; onResult: (result: ToolResult, current?: boolean) => void;
};

/** One serial queue for the entire WebRTC session. Response ownership is captured
 * at response.created, before delayed transcript/tool events can race new speech. */
export class VoiceToolSession {
  readonly sessionId = crypto.randomUUID();
  private generation = 0;
  private turn: Turn | null = null;
  private responses = new Map<string, Turn | null>();
  private completedBatches = new Set<string>();
  private calls = new Map<string, { fingerprint: string; result: Promise<ToolResult> }>();
  private outputs = new Set<string>();
  private captions = new Set<string>();
  private queue: Promise<void> = Promise.resolve();
  private activeResponse: string | null = null;
  private transcriptTimer: ReturnType<typeof setTimeout> | null = null;
  private candidate: { itemId: string; route: string; stopped?: boolean } | null = null;
  private candidateTimer: ReturnType<typeof setTimeout> | null = null;
  private greetingRequested = false;
  private greetingGeneration: number | null = null;
  private greetingResponse: string | null = null;
  constructor(private deps: Dependencies) {}

  greet() {
    if (this.greetingRequested || this.turn || this.candidate) return;
    this.greetingRequested = true;
    this.greetingGeneration = this.generation;
    // An isolated, tools-disabled response: never manufacture a user turn or
    // consent just to announce readiness. Use the negotiated session voice.
    this.deps.send({ type: "response.create", response: {
      conversation: "none", input: [], tools: [], tool_choice: "none",
      metadata: { portal_greeting: this.sessionId + "_" + this.generation },
      instructions: 'Say only this short greeting, warmly: "नमस्ते! Sahayak तैयार है। बताइए, क्या मदद करूँ?" Do not add anything else.',
    } });
  }

  private current(turn: Turn | null): turn is Turn {
    return !!turn && turn === this.turn && turn.generation === this.generation && !turn.controller.signal.aborted;
  }
  interrupt() {
    this.greetingGeneration = null;
    this.greetingResponse = null;
    this.clearCandidate();
    if (this.transcriptTimer) clearTimeout(this.transcriptTimer);
    this.transcriptTimer = null;
    this.turn?.controller.abort();
    this.turn?.resolve(null);
    this.turn = null;
    this.generation += 1;
    if (this.activeResponse) this.deps.send({ type: "response.cancel", response_id: this.activeResponse });
    this.activeResponse = null;
    this.deps.send({ type: "output_audio_buffer.clear" });
  }
  speechStarted(itemId: string, route: string) {
    if (!itemId) return;
    this.clearCandidate();
    this.candidate = { itemId, route };
  }
  private clearCandidate() {
    if (this.candidateTimer) clearTimeout(this.candidateTimer);
    this.candidateTimer = null;
    this.candidate = null;
  }
  private discardCandidate() {
    const itemId = this.candidate?.itemId;
    this.clearCandidate();
    // Prevent an ignored noise item from influencing later model responses.
    if (itemId) this.deps.send({ type: "conversation.item.delete", item_id: itemId });
  }
  transcriptEvidence(itemId: string, text: string, complete = false): boolean {
    const candidate = this.candidate;
    if (!candidate || candidate.itemId !== itemId || !hasSpeechEvidence(text)) return false;
    // A partial token such as "sne" may still become a noise annotation. Short
    // interruption words are accepted without waiting for a trailing space.
    if (!complete && !/[\s.!?।]$/u.test(text) && !/^(stop|no|wait|बस|रुको|नहीं|बस करो)$/iu.test(text.trim())) return false;
    const route = candidate.route;
    const stopped = candidate.stopped;
    this.interrupt();
    let resolve: Turn["resolve"] = () => {};
    const registered = new Promise<Registration | null>((done) => { resolve = done; });
    this.turn = { generation: this.generation, itemId, route, controller: new AbortController(),
      registered, resolve, registrationStarted: false, attempts: 0 };
    if (stopped) this.speechStopped(itemId);
    return true;
  }
  responseCreated(responseId: string, metadata?: unknown) {
    if (!responseId) return;
    const greeting = metadata && typeof metadata === "object"
      ? (metadata as Record<string, unknown>).portal_greeting : null;
    if (this.greetingRequested && this.greetingGeneration === this.generation &&
        greeting === this.sessionId + "_" + this.generation && !this.turn) {
      this.greetingResponse = responseId;
      this.activeResponse = responseId;
      return;
    }
    // Bind delayed responses to their originating utterance, not newer speech.
    const owner = metadata && typeof metadata === "object"
      ? (metadata as Record<string, unknown>).portal_turn : null;
    if (!this.current(this.turn) || owner !== this.responseKey(this.turn)) {
      this.responses.set(responseId, null);
      this.deps.send({ type: "response.cancel", response_id: responseId });
      return;
    }
    this.responses.set(responseId, this.turn);
    this.activeResponse = responseId;
  }
  speechStopped(itemId: string) {
    if (this.candidate?.itemId === itemId) {
      this.candidate.stopped = true;
      if (this.candidateTimer) clearTimeout(this.candidateTimer);
      this.candidateTimer = setTimeout(() => {
        if (this.candidate?.itemId === itemId) this.discardCandidate();
      }, 15_000);
      return;
    }
    const turn = this.turn;
    if (!this.current(turn) || turn.itemId !== itemId || turn.registrationStarted) return;
    if (this.transcriptTimer) clearTimeout(this.transcriptTimer);
    this.transcriptTimer = setTimeout(() => {
      this.transcriptTimer = null;
      if (this.current(turn)) this.transcriptionFailed(itemId);
    }, 15_000);
  }
  private responseKey(turn: Turn) { return this.sessionId + "_" + turn.generation; }
  private requestResponse(turn: Turn, disableTools = false) {
    if (!this.current(turn)) return;
    this.deps.send({ type: "response.create", response: {
      metadata: { portal_turn: this.responseKey(turn) },
      ...(disableTools ? { tool_choice: "none" } : {}),
    } });
  }
  private reportRegistrationFailure(turn: Turn) {
    if (!this.current(turn) || !turn.registrationFailure) return;
    this.deps.onResult({ callId: this.responseKey(turn), status: "unavailable", contextVersion: "unavailable",
      message: turn.registrationFailure.message, error: { code: turn.registrationFailure.code, retryable: false } });
  }
  transcriptionFailed(itemId: string) {
    if (this.candidate?.itemId === itemId) { this.discardCandidate(); return; }
    const turn = this.turn;
    if (!this.current(turn) || turn.itemId !== itemId || turn.registrationStarted) return;
    if (this.transcriptTimer) clearTimeout(this.transcriptTimer);
    this.transcriptTimer = null;
    turn.registrationStarted = true;
    turn.registrationFailure = { code: "TRANSCRIPTION_FAILED", message: "Your speech could not be transcribed. Try again or use text chat; no action was taken." };
    turn.resolve(null);
    this.reportRegistrationFailure(turn);
  }
  acceptsResponse(responseId: unknown) {
    return typeof responseId !== "string" ||
      (responseId === this.greetingResponse && this.greetingGeneration === this.generation) ||
      this.current(this.responses.get(responseId) ?? null);
  }
  async transcriptCompleted(itemId: string, text: string) {
    // No synthetic substitute, partial caption or model argument is registered.
    // Only an observed candidate can replace a turn. Late transcripts after
    // cancellation/reconnection must not resurrect an abandoned utterance.
    if (this.candidate?.itemId === itemId && !hasSpeechEvidence(text)) {
      this.discardCandidate();
      return;
    }
    this.transcriptEvidence(itemId, text, true);
    const turn = this.turn;
    if (!this.current(turn) || (turn.itemId && itemId !== turn.itemId) || turn.registrationStarted) return;
    if (this.transcriptTimer) clearTimeout(this.transcriptTimer);
    this.transcriptTimer = null;
    turn.itemId = itemId;
    turn.registrationStarted = true;
    if (!text.trim() || text.length > 1000) {
      turn.registrationFailure = { code: "TRANSCRIPT_INVALID", message: "The transcript was empty or too long. Please repeat a shorter request; no tool was executed." };
      this.reportRegistrationFailure(turn);
      turn.resolve(null); return;
    }
    try {
      const registration = await assistantRequest<Registration>("/api/assistant/turns", {
        requestKey: this.sessionId + "_" + itemId, route: turn.route, text,
      }, AbortSignal.any([turn.controller.signal, AbortSignal.timeout(8_000)]));
      if (!this.current(turn)) return;
      const sent = this.deps.send({ type: "conversation.item.create", item: { type: "message", role: "system",
        content: [{ type: "input_text", text: "Portal trusted actual-user-turn registration (not model-authored consent): " +
          JSON.stringify(registration) }] } });
      if (!sent) throw new Error("Voice connection closed before turn context was delivered.");
      turn.resolve(registration);
      // Automatic VAD responses are disabled. The first response now has the
      // current actual-user registration, including any exact confirmation.
      this.requestResponse(turn);
    } catch (error) {
      if (!this.current(turn)) return;
      turn.registrationFailure = error instanceof AssistantRequestError
        ? { code: error.code ?? (error.status === 401 ? "AUTHENTICATION_REQUIRED" : "TRANSCRIPT_REGISTRATION_REJECTED"),
          message: error.status === 401
            ? "Your portal session has expired. Sign in again before using voice actions; no tool was executed."
            : "The portal rejected transcript registration. " + error.message + " No tool was executed." }
        : { code: "TRANSCRIPT_REGISTRATION_UNAVAILABLE", message: "The portal could not register your transcript. Check the connection and try again; no tool was executed." };
      turn.resolve(null);
      this.reportRegistrationFailure(turn);
    }
  }
  private async registration(turn: Turn): Promise<Registration | null> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const abort = () => turn.resolve(null);
    turn.controller.signal.addEventListener("abort", abort, { once: true });
    try {
      return await Promise.race([turn.registered, new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), 8_000);
      })]);
    } finally {
      if (timer) clearTimeout(timer);
      turn.controller.signal.removeEventListener("abort", abort);
    }
  }
  responseDone(response: ResponseEvent) {
    if (typeof response.id !== "string" || this.completedBatches.has(response.id)) return;
    const responseId = response.id;
    this.completedBatches.add(responseId);
    if (this.activeResponse === responseId) this.activeResponse = null;
    if (responseId === this.greetingResponse) return;
    if (response.status !== "completed") return;
    const turn = this.responses.get(responseId) ?? null;
    const calls: Call[] = (Array.isArray(response.output) ? response.output : []).flatMap((value) => {
      if (!value || typeof value !== "object") return [];
      const item = value as Record<string, unknown>;
      return item.type === "function_call" && typeof item.call_id === "string" &&
        typeof item.name === "string" && typeof item.arguments === "string"
        ? [{ call_id: item.call_id, name: item.name, arguments: item.arguments }] : [];
    });
    if (!calls.length || !this.current(turn)) return;
    this.queue = this.queue.then(async () => {
      if (!this.current(turn)) return;
      const registered = await this.registration(turn);
      if (!this.current(turn)) return;
      let sent = 0;
      let disableTools = !registered;
      for (const call of calls) {
        if (!this.current(turn)) return;
        const fingerprint = JSON.stringify([call.name, call.arguments]);
        const cached = this.calls.get(call.call_id);
        if (cached && cached.fingerprint !== fingerprint) {
          this.interrupt();
          this.deps.onResult({ callId: call.call_id, status: "failed", contextVersion: "unavailable",
            message: "A duplicate voice call changed arguments. Start a new user turn.", error: { code: "CALL_ID_REUSED", retryable: false } });
          return;
        }
        if (this.outputs.has(call.call_id)) continue;
        let work = cached?.result;
        if (!work) {
          turn.attempts += 1;
          rememberCall(call.call_id);
          work = registered ? executeVoiceTool({
            turnId: registered.turnId, callId: call.call_id, name: call.name, arguments: call.arguments,
          }, this.deps.observe, turn.controller.signal, this.deps.onResult)
            : Promise.resolve<ToolResult>({ callId: call.call_id, status: "unavailable", contextVersion: "unavailable",
              message: turn.registrationFailure?.message ?? "The actual user transcript was not registered in time. Ask the member to repeat; no tool was executed.",
              error: { code: turn.registrationFailure?.code ?? "TRUSTED_TURN_REQUIRED", retryable: false } });
          this.calls.set(call.call_id, { fingerprint, result: work });
        }
        const result = await work;
        if (!this.current(turn)) return;
        this.deps.onResult(result);
        disableTools ||= turn.attempts >= 8 || ["TURN_BUDGET_EXHAUSTED", "TURN_TIMEOUT"].includes(result.error?.code ?? "");
        if (!this.deps.send({ type: "conversation.item.create",
          item: { type: "function_call_output", call_id: call.call_id, output: JSON.stringify(result) } })) return;
        this.outputs.add(call.call_id);
        sent += 1;
      }
      // Exactly one continuation after every output in this completed batch.
      if (sent && this.current(turn)) this.requestResponse(turn, disableTools);
    }).catch(() => {
      if (this.current(turn)) this.interrupt();
    });
  }
  saveCaption(itemId: string, text: string, interrupted: boolean) {
    if (!text.trim() || this.captions.has(itemId) || this.captions.size >= 16) return;
    this.captions.add(itemId);
    void fetch("/api/assistant/captions", { method: "POST", keepalive: true,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: this.sessionId, itemId, text: text.slice(0, 2000), interrupted }),
    }).catch(() => {});
  }
  async recover() {
    // Reconnection only reads durable outcomes. Never replay old function calls,
    // provider response continuations or stale audio into the new connection.
    for (const id of [...this.calls.keys()].slice(-16)) this.deps.onResult(await recoverCall(id));
  }
}
