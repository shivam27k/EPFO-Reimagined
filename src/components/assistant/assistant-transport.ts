import { toolResultSchema, type ToolResult } from "@/domain/assistant-tools";
import { isUiTool, uiRequestSchema, type UiObservation, type UiRequest } from "@/domain/assistant-ui";
import type { AssistantReply } from "@/server/assistant/respond";
import { captureVisibleScreenText } from "./visible-screen-context";

export type ObserveUi = (request: UiRequest, signal: AbortSignal) => Promise<UiObservation>;
export class AssistantRequestError extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message);
    this.name = "AssistantRequestError";
  }
}
export async function assistantRequest<T>(url: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { method: body === undefined ? "GET" : "POST", cache: "no-store",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body), signal });
  const value = await response.json() as T & { error?: string; code?: string; fieldErrors?: Record<string, string>; exclusions?: string[] };
  if (!response.ok) {
    const details = Object.entries(value.fieldErrors ?? {}).map(([key, message]) => key + ": " + message);
    if (value.exclusions?.length) details.push("Excluded: " + value.exclusions.join(", "));
    throw new AssistantRequestError([value.error ?? "The request could not be completed.", ...details].join(" "), response.status, value.code);
  }
  return value;
}
export function cancelUiContinuation(continuationId: string) {
  void fetch("/api/assistant/continue", { method: "DELETE", keepalive: true,
    headers: { "content-type": "application/json" }, body: JSON.stringify({ continuationId }) }).catch(() => {});
}
function parseUi(value: unknown): UiRequest {
  const parsed = uiRequestSchema.parse(value);
  if (!isUiTool(parsed.action)) throw new Error("Unsupported browser request.");
  return { ...parsed, action: parsed.action };
}
async function observeContinuation(id: string, value: unknown, observe: ObserveUi, signal: AbortSignal) {
  const cancel = () => cancelUiContinuation(id);
  signal.addEventListener("abort", cancel, { once: true });
  try {
    if (signal.aborted) { cancel(); throw new DOMException("Cancelled", "AbortError"); }
    const observation = await observe(parseUi(value), signal);
    if (observation.status === "completed" && observation.route === window.location.pathname) {
      observation.visibleScreenText = captureVisibleScreenText();
    }
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
    return await assistantRequest<unknown>("/api/assistant/continue", { continuationId: id, observation }, signal);
  } catch (error) { cancel(); throw error; }
  finally { signal.removeEventListener("abort", cancel); }
}
export async function finishTextContinuation(
  reply: AssistantReply, observe: ObserveUi, signal: AbortSignal, onProgress: (results: ToolResult[]) => void,
) {
  let current = reply;
  // The server enforces the original eight-call budget and deadline too.
  for (let round = 0; round <= 8; round += 1) {
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
    onProgress(current.actionProgress ?? []);
    if (!current.continuationId) return current;
    if (current.uiRequests?.length !== 1) {
      cancelUiContinuation(current.continuationId);
      throw new Error("The server did not supply one exact UI request.");
    }
    current = await observeContinuation(current.continuationId, current.uiRequests[0], observe, signal) as AssistantReply;
  }
  if (current.continuationId) cancelUiContinuation(current.continuationId);
  throw new Error("The UI continuation limit was reached.");
}
export async function executeVoiceTool(input: { turnId: string; callId: string; name: string; arguments: string },
  observe: ObserveUi, signal: AbortSignal, onResult: (result: ToolResult, current?: boolean) => void): Promise<ToolResult> {
  let result: ToolResult;
  try {
    result = toolResultSchema.parse(await assistantRequest("/api/assistant/tools", input, signal));
    onResult(result, !signal.aborted);
    if (result.status === "in_progress" && typeof result.data?.continuationId === "string") {
      result = toolResultSchema.parse(await observeContinuation(result.data.continuationId, result.data.uiRequest, observe, signal));
    }
  } catch {
    // A request may have committed even if its response was lost. Status only;
    // never retry the effect as a fresh call, including after reconnect.
    result = await recoverCall(input.callId);
  }
  onResult(result);
  return result;
}
export async function recoverCall(callId: string): Promise<ToolResult> {
  try {
    const result = toolResultSchema.parse(await assistantRequest("/api/assistant/actions?callId=" + encodeURIComponent(callId), undefined, AbortSignal.timeout(5000)));
    return { ...result, callId };
  } catch {
    return { callId, status: "unknown_outcome", contextVersion: "unavailable",
      message: "The result could not be recovered. Inspect persisted status before repeating a change.",
      error: { code: "STATUS_UNAVAILABLE", retryable: false } };
  }
}
