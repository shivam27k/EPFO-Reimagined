import OpenAI from "openai";
import { createHash } from "node:crypto";

import { parsePortalToolCall, portalToolDefinitions, type PortalAction } from "@/domain/portal-actions";
import { buildAssistantContext } from "./context";
import { detectIntent, type AssistantIntent } from "./intent";
import { assistantInstructions } from "./instructions";
import type { AssistantActionProposal } from "./tools";

export interface AssistantReply {
  text: string;
  intent: AssistantIntent;
  actions: AssistantActionProposal[];
  usedFallback: boolean;
  portalActions: PortalAction[];
}

const LOW_CONFIDENCE_THRESHOLD = 0.7;
const DEVANAGARI_PATTERN = /[\u0900-\u097F]/u;

function lowConfidenceFallbackText(message: string) {
  return DEVANAGARI_PATTERN.test(message)
    ? "मुझे यक़ीन नहीं है कि आपको किस मदद की ज़रूरत है। आप इस पेज के बारे में क्या जानना चाहते हैं?"
    : "I’m not sure what you need help with. What would you like to know about this page?";
}

function fallbackText(context: Awaited<ReturnType<typeof buildAssistantContext>>) {
  const blockers = context.findings.filter((finding) => finding.severity === "BLOCKER");
  if (blockers.length === 0) {
    return `I do not see a deterministic blocker on this page. The safest visible next action is “${context.snapshot.nextAction.label}”.`;
  }
  const summary = blockers
    .map((finding) => `${finding.title} is owned by ${finding.owner.toLowerCase()}: ${finding.explanation}`)
    .join(" ");
  return `${summary} This is based on the stored synthetic member state.`;
}

function deterministicPortalAction(message: string): PortalAction | null {
  const value = message.toLowerCase();
  const asksToMove = /\b(open|go|take me|navigate|show me where|start|help me (?:add|update|correct))\b|खोल|ले चल|दिखा|जोड़|सुधार/u.test(value);
  if (!asksToMove) return null;
  if (/(correct|change|edit|सुधार).*(name|profile|नाम|प्रोफाइल)|(name|नाम).*(correct|change|सुधार)/u.test(value)) return { name: "start_workflow", arguments: { workflow: "profile_correction" } };
  if (/nomination|नामांकन|नॉमिनेशन/u.test(value)) return { name: "start_workflow", arguments: { workflow: "nomination_guidance" } };
  const destinations: Array<[RegExp, PortalAction]> = [
    [/profile|प्रोफाइल/u, { name: "navigate_to", arguments: { destination: "profile" } }],
    [/employment|job record|रोजगार/u, { name: "navigate_to", arguments: { destination: "employment" } }],
    [/contribution|passbook|पासबुक|योगदान/u, { name: "navigate_to", arguments: { destination: "contributions" } }],
    [/claim|withdraw|क्लेम|दावा|निकाल/u, { name: "navigate_to", arguments: { destination: "claims" } }],
    [/service|सेवा/u, { name: "navigate_to", arguments: { destination: "services" } }],
    [/transfer|ट्रांसफर/u, { name: "navigate_to", arguments: { destination: "transfers" } }],
    [/help|मदद/u, { name: "navigate_to", arguments: { destination: "help" } }],
    [/overview|home|होम/u, { name: "navigate_to", arguments: { destination: "overview" } }],
  ];
  return destinations.find(([pattern]) => pattern.test(value))?.[1] ?? null;
}

export async function respondToMember({
  demoRunId,
  route,
  message,
  visibleScreenText,
}: {
  demoRunId: string;
  route: string;
  message: string;
  visibleScreenText?: string;
}): Promise<AssistantReply> {
  const context = await buildAssistantContext({ demoRunId, route, visibleScreenText });
  const intent = detectIntent(message, route);
  const directAction = deterministicPortalAction(message);

  if (directAction) {
    return {
      text: "I’ll open the relevant place now.",
      intent,
      actions: [],
      portalActions: [directAction],
      usedFallback: false,
    };
  }

  if (intent.confidence < LOW_CONFIDENCE_THRESHOLD) {
    return {
      text: lowConfidenceFallbackText(message),
      intent,
      actions: [],
      portalActions: [],
      usedFallback: true,
    };
  }

  const actions: AssistantActionProposal[] = [];
  if (intent.intent === "START_CLAIM") {
    actions.push({
      type: "NAVIGATE",
      label: "Review final settlement claim",
      payload: { href: "/claims" },
      requiresConfirmation: true,
    });
  }
  if (intent.intent === "APPLY_CORRECTION") {
    if (context.findings.some((finding) => finding.code === "MISSING_EXIT_DATE") && context.snapshot.employments[0]) {
      actions.push({
        type: "APPLY_DEMO_CORRECTION",
        label: "Simulate the employer exit-date response",
        payload: { correction: "EMPLOYMENT_EXIT_DATE", employmentId: context.snapshot.employments[0].employmentKey },
        requiresConfirmation: true,
      });
    } else if (context.findings.some((finding) => finding.code === "BANK_NAME_MISMATCH")) {
      actions.push({
        type: "APPLY_DEMO_CORRECTION",
        label: "Simulate the bank-name correction",
        payload: { correction: "BANK_NAME" },
        requiresConfirmation: true,
      });
    }
  }

  if (!process.env.OPENAI_API_KEY) {
    return {
      text: fallbackText(context),
      intent,
      actions,
      portalActions: [],
      usedFallback: true,
    };
  }

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.responses.create({
      model: process.env.OPENAI_MODEL?.trim() || "gpt-5.4-mini",
      instructions: [
        assistantInstructions,
        "Answer in concise, plain language suitable for an EPF member.",
        "Use only facts present in the supplied JSON. If the JSON does not establish an answer, say so and point to the safest visible next action.",
        "Do not claim that a simulated event happened in a live EPFO, UMANG, Aadhaar, employer, or bank system.",
      ].join("\n"),
      input: JSON.stringify({
        memberQuestion: message,
        currentRoute: context.route,
        currentScreen: context.screen,
        currentlyRenderedScreen: context.renderedScreen,
        maskedSyntheticMemberState: context.maskedModelSnapshot,
        deterministicFindings: context.findings,
        activeProcess: context.activeProcess,
        recentConversation: context.recentConversation,
        allowedProposalTypes: context.allowedActions,
      }),
      store: false,
      tools: portalToolDefinitions,
      tool_choice: "auto",
      parallel_tool_calls: false,
      safety_identifier: createHash("sha256").update(demoRunId).digest("hex").slice(0, 64),
    });

    const text = response.output_text.trim();
    const portalActions = response.output.flatMap((item) => {
      if (item.type !== "function_call") return [];
      try { return [parsePortalToolCall(item.name, item.arguments)]; } catch { return []; }
    });
    return {
      text: text || (portalActions.length > 0 ? "I’ll do that now." : fallbackText(context)),
      intent,
      actions,
      portalActions,
      usedFallback: text.length === 0 && portalActions.length === 0,
    };
  } catch {
    return {
      text: `${fallbackText(context)} The OpenAI response was unavailable, so I used the built-in grounded explanation instead.`,
      intent,
      actions,
      portalActions: [],
      usedFallback: true,
    };
  }
}
