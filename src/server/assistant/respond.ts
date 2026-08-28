import type { ToolResult } from "@/domain/assistant-tools";
import type { UiRequest } from "@/domain/assistant-ui";
import type { PortalAction } from "@/domain/portal-actions";
import type { AssistantIntent } from "./intent";
import type { AssistantActionProposal } from "./tools";
import { runAssistantTurn, type AssistantTurnInput } from "./turn-orchestrator";

export interface AssistantReply {
  text: string;
  intent: AssistantIntent;
  actions: AssistantActionProposal[];
  usedFallback: boolean;
  portalActions: PortalAction[];
  /** Opaque, run-scoped server-held provider continuation. */
  continuationId?: string;
  uiRequests?: UiRequest[];
  actionProgress?: ToolResult[];
}

export function respondToMember(input: AssistantTurnInput): Promise<AssistantReply> {
  return runAssistantTurn(input);
}
