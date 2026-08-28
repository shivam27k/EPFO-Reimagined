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
  constructor(private deps: Dependencies) {}

  private current(turn: Turn | null): turn is Turn {
    return !!turn && turn === this.turn && turn.generation === this.generation && !turn.controller.signal.aborted;
  }
  interrupt() {
    this.turn?.controller.abort();
    this.turn?.resolve(null);
    this.turn = null;
    this.generation += 1;
    if (this.activeResponse) this.deps.send({ type: "response.cancel", response_id: this.activeResponse });
    this.activeResponse = null;
    this.deps.send({ type: "output_audio_buffer.clear" });
  }
  speechStarted(itemId: string, route: string) {
    this.interrupt();
    let resolve: Turn["resolve"] = () => {};
    const registered = new Promise<Registration | null>((done) => { resolve = done; });
    this.turn = { generation: this.generation, itemId, route, controller: new AbortController(),
      registered, resolve, registrationStarted: false, attempts: 0 };
  }
  responseCreated(responseId: string) {
    if (!responseId) return;
    this.responses.set(responseId, this.turn);
    this.activeResponse = responseId;
  }
  acceptsResponse(responseId: unknown) {
    return typeof responseId !== "string" || this.current(this.responses.get(responseId) ?? null);
  }
  async transcriptCompleted(itemId: string, text: string, route: string) {
    // No synthetic substitute, partial caption or model argument is registered.
    // A missing speech_started may occur on an already committed audio item.
    if (!this.turn && !this.responses.size) this.speechStarted(itemId, route);
    const turn = this.turn;
    if (!this.current(turn) || (turn.itemId && itemId !== turn.itemId) || turn.registrationStarted) return;
    turn.itemId = itemId;
    turn.registrationStarted = true;
    if (!text.trim() || text.length > 1000) {
      turn.registrationFailure = { code: "TRANSCRIPT_INVALID", message: "The transcript was empty or too long. Please repeat a shorter request; no tool was executed." };
      turn.resolve(null); return;
    }
    try {
      const registration = await assistantRequest<Registration>("/api/assistant/turns", {
        requestKey: this.sessionId + "_" + itemId, route: turn.route, text,
      }, turn.controller.signal);
      if (!this.current(turn)) return;
      this.deps.send({ type: "conversation.item.create", item: { type: "message", role: "system",
        content: [{ type: "input_text", text: "Portal trusted actual-user-turn registration (not model-authored consent): " +
          JSON.stringify(registration) }] } });
      turn.resolve(registration);
    } catch (error) {
      if (!this.current(turn)) return;
      turn.registrationFailure = error instanceof AssistantRequestError
        ? { code: error.code ?? (error.status === 401 ? "AUTHENTICATION_REQUIRED" : "TRANSCRIPT_REGISTRATION_REJECTED"),
          message: error.status === 401
            ? "Your portal session has expired. Sign in again before using voice actions; no tool was executed."
            : "The portal rejected transcript registration. " + error.message + " No tool was executed." }
        : { code: "TRANSCRIPT_REGISTRATION_UNAVAILABLE", message: "The portal could not register your transcript. Check the connection and try again; no tool was executed." };
      turn.resolve(null);
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
      if (sent && this.current(turn)) this.deps.send({ type: "response.create",
        ...(disableTools ? { response: { tool_choice: "none" } } : {}) });
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
