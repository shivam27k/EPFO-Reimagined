import type { ResponseInputItemLike } from "openai/lib/responses/ResponseInputItems";
import type { ToolResult } from "@/domain/assistant-tools";
import type { AssistantIntent } from "./intent";
import type { TurnBudgetState } from "./turn-budget";

export type PendingProviderCall = { name: string; arguments: string; call_id: string };
/** Stored only in assistantContinuations; never a request/response DTO. */
export type TextTurnState = {
  turnId: string; route: string; message: string; intent: AssistantIntent;
  history: ResponseInputItemLike[]; progress: ToolResult[]; callIds: string[];
  pendingCalls: PendingProviderCall[]; round: number; contextVersion: string;
  budget: TurnBudgetState;
};
