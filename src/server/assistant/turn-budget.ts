export const MAX_TURN_TOOL_CALLS = 8;
const TURN_TIMEOUT_MS = 30_000;
export type TurnBudgetState = { deadline: number; calls: number; retried: boolean };

export class AssistantTurnInterrupted extends Error {
  constructor(public readonly code: "TURN_CANCELLED" | "TURN_TIMEOUT") {
    super(code);
    this.name = "AssistantTurnInterrupted";
  }
}

/** One deadline covers context reads, all provider rounds, tools, and retry. */
export class TurnBudget {
  private readonly controller = new AbortController();
  private readonly deadline: number;
  private readonly timer: ReturnType<typeof setTimeout>;
  private calls = 0;
  private retried = false;
  private readonly cancel = () => this.controller.abort(new AssistantTurnInterrupted("TURN_CANCELLED"));

  constructor(private readonly parentSignal?: AbortSignal, saved?: TurnBudgetState) {
    this.deadline = saved?.deadline ?? Date.now() + TURN_TIMEOUT_MS;
    this.calls = saved?.calls ?? 0;
    this.retried = saved?.retried ?? false;
    this.timer = setTimeout(() => this.controller.abort(new AssistantTurnInterrupted("TURN_TIMEOUT")), Math.max(0, this.deadline - Date.now()));
    parentSignal?.addEventListener("abort", this.cancel, { once: true });
    if (parentSignal?.aborted) this.cancel();
  }

  get signal() { return this.controller.signal; }
  get exhausted() { return this.calls >= MAX_TURN_TOOL_CALLS; }
  snapshot(): TurnBudgetState { return { deadline: this.deadline, calls: this.calls, retried: this.retried }; }

  check() {
    if (!this.signal.aborted && Date.now() >= this.deadline) {
      this.controller.abort(new AssistantTurnInterrupted("TURN_TIMEOUT"));
    }
    if (this.signal.aborted) throw this.signal.reason;
  }

  takeCall(): boolean {
    this.check();
    if (this.exhausted) return false;
    this.calls += 1;
    return true;
  }

  takeReadRetry(): boolean {
    this.check();
    if (this.retried || !this.takeCall()) return false;
    this.retried = true;
    return true;
  }

  async run<T>(operation: () => PromiseLike<T>): Promise<T> {
    this.check();
    let onAbort: () => void = () => {};
    const aborted = new Promise<never>((_, reject) => {
      onAbort = () => reject(this.signal.reason);
      this.signal.addEventListener("abort", onAbort, { once: true });
    });
    try {
      const value = await Promise.race([
        Promise.resolve().then(() => { this.check(); return operation(); }),
        aborted,
      ]);
      this.check();
      return value;
    } finally {
      this.signal.removeEventListener("abort", onAbort);
    }
  }

  dispose() {
    clearTimeout(this.timer);
    this.parentSignal?.removeEventListener("abort", this.cancel);
  }
}
