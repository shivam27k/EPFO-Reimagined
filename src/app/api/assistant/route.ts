import { z, ZodError } from "zod";

import { AuthenticationError, requireCurrentRun } from "@/server/auth/session";
import { respondToMember } from "@/server/assistant/respond";
import {
  dismissProactivePrompt,
  getAssistantState,
  sanitizeMemberMessage,
  storeAssistantExchange,
  storeProposalDecision,
  resolveFormPatchProposal,
} from "@/server/assistant/assistant-store";

const assistantRequestSchema = z.object({
  message: z.string().min(1).max(1000),
  route: z.string().min(1).max(120),
});

const assistantStateSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("DISMISS_PROMPT"), promptKey: z.string().min(1).max(120) }),
  z.object({
    kind: z.literal("PROPOSAL_DECISION"),
    proposalKey: z.string().min(1).max(120),
    decision: z.enum(["CONFIRMED", "REJECTED"]),
  }),
  z.object({ kind: z.literal("DISMISS_FORM_PATCH") }),
]);

export async function GET() {
  try {
    const current = await requireCurrentRun();
    return Response.json(await getAssistantState(current.demoRun.id));
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return Response.json({ error: "Authentication required." }, { status: 401 });
    }
    return Response.json({ error: "Assistant history is temporarily unavailable. The member journey still works without it." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const current = await requireCurrentRun();
    const input = assistantRequestSchema.parse(await request.json());
    const safeMessage = sanitizeMemberMessage(input.message);
    const reply = await respondToMember({
      demoRunId: current.demoRun.id,
      route: input.route,
      message: safeMessage,
    });
    await storeAssistantExchange(current.demoRun.id, safeMessage, reply);
    return Response.json(reply);
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return Response.json({ error: "Authentication required." }, { status: 401 });
    }
    if (error instanceof ZodError) {
      return Response.json({ error: "Use a valid assistant message." }, { status: 422 });
    }
    if (error instanceof SyntaxError) {
      return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }
    return Response.json({ error: "The assistant is temporarily unavailable. Use the visible page actions to continue." }, { status: 500 });
  }
}


export async function PUT(request: Request) {
  try {
    const current = await requireCurrentRun();
    const input = assistantStateSchema.parse(await request.json());
    if (input.kind === "DISMISS_PROMPT") {
      await dismissProactivePrompt(current.demoRun.id, input.promptKey);
    } else if (input.kind === "PROPOSAL_DECISION") {
      await storeProposalDecision(current.demoRun.id, input.proposalKey, input.decision);
    } else {
      await resolveFormPatchProposal(current.demoRun.id);
    }
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return Response.json({ error: "Authentication required." }, { status: 401 });
    }
    if (error instanceof ZodError) {
      return Response.json({ error: "Use a valid assistant state update." }, { status: 422 });
    }
    if (error instanceof SyntaxError) {
      return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }
    return Response.json({ error: "The assistant state could not be saved. No member data changed." }, { status: 500 });
  }
}
