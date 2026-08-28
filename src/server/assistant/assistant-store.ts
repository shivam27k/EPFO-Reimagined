import { asc, eq } from "drizzle-orm";

import { ensureDatabaseReady, getDb } from "@/db/client";
import { conversationMessages } from "@/db/schema";
import type { AssistantActionProposal } from "./tools";
import type { FormFieldProposal } from "./form-copilot";

const ASSISTANT_PREFIX = "ASSISTANT_JSON:";
const DISMISSED_PREFIX = "DISMISSED_PROMPT:";
const DECISION_PREFIX = "PROPOSAL_DECISION:";
const FORM_PATCH_PREFIX = "FORM_PATCH_PROPOSAL:";
const FORM_PATCH_RESOLVED = "FORM_PATCH_RESOLVED";

export interface StoredAssistantMessage {
  role: "member" | "assistant";
  text: string;
  source?: "openai" | "fallback";
  actions?: AssistantActionProposal[];
}

async function insertMessage(
  demoRunId: string,
  role: "member" | "assistant" | "system",
  content: string,
) {
  await ensureDatabaseReady();
  await getDb().insert(conversationMessages).values({
    id: crypto.randomUUID(),
    demoRunId,
    role,
    content,
    createdAt: new Date().toISOString(),
  });
}

export async function storeAssistantExchange(
  demoRunId: string,
  memberText: string,
  reply: { text: string; usedFallback: boolean; actions: AssistantActionProposal[] },
) {
  await ensureDatabaseReady();
  const db = getDb();
  const createdAt = new Date().toISOString();
  await db.transaction(async (tx) => {
    await tx.insert(conversationMessages).values({
      id: crypto.randomUUID(), demoRunId, role: "member", content: memberText, createdAt,
    });
    await tx.insert(conversationMessages).values({
      id: crypto.randomUUID(),
      demoRunId,
      role: "assistant",
      content: `${ASSISTANT_PREFIX}${JSON.stringify({
        text: reply.text,
        source: reply.usedFallback ? "fallback" : "openai",
        actions: reply.actions,
      })}`,
      createdAt: new Date(Date.parse(createdAt) + 1).toISOString(),
    });
  });
}

export async function dismissProactivePrompt(demoRunId: string, promptKey: string) {
  await insertMessage(demoRunId, "system", `${DISMISSED_PREFIX}${promptKey}`);
}

export async function storeProposalDecision(
  demoRunId: string,
  proposalKey: string,
  decision: "CONFIRMED" | "REJECTED",
) {
  await insertMessage(demoRunId, "system", `${DECISION_PREFIX}${proposalKey}:${decision}`);
}

export async function storeFormPatchProposal(demoRunId: string, proposals: FormFieldProposal[]) {
  const safeProposals = proposals.map((proposal) => proposal.sensitive ? {
    ...proposal,
    proposedValue: `••••${proposal.proposedValue.replace(/[^a-zA-Z0-9]/g, "").slice(-4)}`,
    validation: "NEEDS_REVIEW" as const,
  } : proposal);
  await insertMessage(demoRunId, "system", `${FORM_PATCH_PREFIX}${JSON.stringify(safeProposals)}`);
}

export async function resolveFormPatchProposal(demoRunId: string) {
  await insertMessage(demoRunId, "system", FORM_PATCH_RESOLVED);
}

export async function getAssistantState(demoRunId: string) {
  await ensureDatabaseReady();
  const rows = await getDb()
    .select({ role: conversationMessages.role, content: conversationMessages.content })
    .from(conversationMessages)
    .where(eq(conversationMessages.demoRunId, demoRunId))
    .orderBy(asc(conversationMessages.createdAt));

  const messages: StoredAssistantMessage[] = [];
  const dismissedPromptKeys = new Set<string>();
  const decidedProposalKeys = new Set<string>();
  let formPatchProposal: FormFieldProposal[] = [];
  for (const row of rows) {
    if (row.role === "system") {
      if (row.content.startsWith(DISMISSED_PREFIX)) {
        dismissedPromptKeys.add(row.content.slice(DISMISSED_PREFIX.length));
      }
      if (row.content.startsWith(DECISION_PREFIX)) {
        const decision = row.content.slice(DECISION_PREFIX.length);
        decidedProposalKeys.add(decision.slice(0, decision.lastIndexOf(":")));
      }
      if (row.content.startsWith(FORM_PATCH_PREFIX)) {
        try { formPatchProposal = JSON.parse(row.content.slice(FORM_PATCH_PREFIX.length)) as FormFieldProposal[]; }
        catch { formPatchProposal = []; }
      }
      if (row.content === FORM_PATCH_RESOLVED) formPatchProposal = [];
      continue;
    }
    if (row.role === "member") {
      messages.push({ role: "member", text: row.content });
      continue;
    }
    if (!row.content.startsWith(ASSISTANT_PREFIX)) continue;
    try {
      const parsed = JSON.parse(row.content.slice(ASSISTANT_PREFIX.length)) as Omit<StoredAssistantMessage, "role">;
      messages.push({ role: "assistant", ...parsed });
    } catch {
      // Ignore legacy or malformed assistant rows instead of breaking the entire panel.
    }
  }
  const visibleMessages = messages.map((message) => ({
    ...message,
    // Legacy cards have no persisted proposal/consent binding. Do not surface
    // old mutation buttons as a bypass; Task 5 renders fresh action-store proposals.
    actions: message.actions?.filter((action) => action.type === "NAVIGATE" &&
      !decidedProposalKeys.has(`${action.type}-${action.label}`.slice(0, 120))),
  }));
  return { messages: visibleMessages.slice(-16), dismissedPromptKeys: [...dismissedPromptKeys], formPatchProposal: [],
    ...(formPatchProposal.length ? { formPatchNotice: "Prepare a fresh stored proposal to review these legacy fields again." } : {}) };
}

export function sanitizeMemberMessage(message: string) {
  return message
    .replace(/\b[A-Z]{5}\d{4}[A-Z]\b/gi, "[masked PAN-format value]")
    .replace(/\b\d{12,18}\b/g, "[masked account or identity number]")
    .replace(/\b\d{10}\b/g, "[masked mobile number]");
}
