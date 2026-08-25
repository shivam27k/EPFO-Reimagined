import "server-only";

import { realtimePortalToolDefinitions } from "@/domain/portal-actions";
import { sanitizeMemberMessage } from "./assistant-store";
import { buildAssistantContext } from "./context";
import { assistantInstructions } from "./instructions";

const REALTIME_CALLS_URL = "https://api.openai.com/v1/realtime/calls";
const DEFAULT_REALTIME_MODEL = "gpt-realtime-2.1";
const DEFAULT_TRANSCRIPTION_MODEL = "gpt-transcribe";
const REALTIME_TRANSCRIPTION_PROMPT = [
  "Transcribe code-switched English and Hindi speech only.",
  "Write English in Latin script and Hindi in Devanagari; never use Urdu or Arabic script.",
  "EPF terms include EPF, EPS, EPFO, UAN, KYC, Aadhaar, passbook, contribution, employer, claim, Form 19, Form 31, Form 10C, Form 10D, and Annexure K.",
].join(" ");
const REALTIME_CONFIGURATION_ERROR = "Realtime voice service is not configured.";
const REALTIME_NEGOTIATION_ERROR = "Realtime call negotiation failed.";

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return typeof value === "object" && value !== null ? value as UnknownRecord : {};
}

function projectRecord(value: unknown, keys: readonly string[]): UnknownRecord {
  const source = asRecord(value);
  return Object.fromEntries(keys.flatMap((key) => key in source ? [[key, source[key]]] : []));
}

function projectRecords(value: unknown, keys: readonly string[]): UnknownRecord[] {
  return Array.isArray(value) ? value.map((item) => projectRecord(item, keys)) : [];
}

function redactRealtimeConversation(text: string, demoRunId: string): string {
  return sanitizeMemberMessage(text)
    .replace(/\b\d{4}[\s-]+\d{4}[\s-]+\d{4}\b/g, "[masked Aadhaar-format value]")
    .replace(/\b[A-Z]{5}\d{10,22}\b/gi, "[masked EPF member ID]")
    .split(demoRunId).join("[masked session identifier]");
}

function requireApiKey(): string {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error(REALTIME_CONFIGURATION_ERROR);
  return apiKey;
}

function extractCallId(location: string | null): string | undefined {
  if (!location) return undefined;
  try {
    const match = new URL(location, REALTIME_CALLS_URL).pathname.match(/\/realtime\/calls\/([^/]+)\/?$/);
    return match?.[1];
  } catch {
    return undefined;
  }
}

export async function buildRealtimeSessionConfig({
  demoRunId,
  route,
  visibleScreenText,
}: {
  demoRunId: string;
  route: string;
  visibleScreenText?: string;
}): Promise<Record<string, unknown>> {
  const context = await buildAssistantContext({ demoRunId, route, visibleScreenText });
  const maskedMember = asRecord(context.maskedModelSnapshot);
  const maskedScreenContext = {
    route: context.route,
    screen: {
      name: context.screen.name,
      purpose: context.screen.purpose,
      currentState: context.screen.currentState,
      visibleFacts: context.screen.visibleFacts,
      ...(context.screen.officialTerm ? { officialTerm: context.screen.officialTerm } : {}),
    },
    renderedScreen: context.renderedScreen ? {
      ...context.renderedScreen,
      authority: "authoritative current rendering",
    } : null,
    member: {
      persona: maskedMember.persona,
      profile: projectRecord(maskedMember.profile, ["uanMasked", "onboardingComplete"]),
      kyc: projectRecords(maskedMember.kyc, ["type", "status", "valueMasked"]),
      employments: projectRecords(maskedMember.employments, [
        "memberIdMasked", "establishmentName", "joinedAt", "exitedAt",
      ]),
      activeClaim: maskedMember.activeClaim === null ? null : projectRecord(maskedMember.activeClaim, [
        "type", "status", "submittedAt", "amountDisplayed", "currency",
      ]),
      latestClaim: maskedMember.latestClaim === null ? null : projectRecord(maskedMember.latestClaim, [
        "type", "status", "submittedAt", "amountDisplayed", "currency",
      ]),
      claimEvents: projectRecords(maskedMember.claimEvents, ["status", "actor", "explanation", "occurredAt"]),
      contributionSummary: projectRecord(maskedMember.contributionSummary, [
        "currency", "displayUnit", "postedEpfBalanceDisplayed",
      ]),
      contributions: projectRecords(maskedMember.contributions, [
        "wageMonth", "postingStatus", "employeeEpfDisplayed", "employerEpfDisplayed", "employerEpsDisplayed",
      ]),
      simulations: context.snapshot.simulations.map((simulation) => ({
        kind: simulation.kind,
        intervalStart: simulation.intervalStart,
        intervalEnd: simulation.intervalEnd,
        intervalLabel: simulation.intervalLabel,
        months: simulation.months,
        recordedAt: simulation.recordedAt,
      })),
      scenarios: context.snapshot.scenarioRuns.map((scenario) => ({
        scenarioKey: scenario.scenarioKey,
        stage: scenario.stage,
        updatedAt: scenario.updatedAt,
      })),
      nextAction: {
        label: context.snapshot.nextAction.label,
        href: context.snapshot.nextAction.href,
      },
    },
    findings: context.findings.map((finding) => ({
      code: finding.code,
      severity: finding.severity,
      owner: finding.owner,
      title: finding.title,
      explanation: finding.explanation,
      allowedActions: finding.allowedActions,
    })),
    activeProcess: context.activeProcess ? {
      key: context.activeProcess.key,
      title: context.activeProcess.title,
      questionCount: context.activeProcess.questionCount,
    } : null,
    recentConversation: context.recentConversation.map(({ role, text }) => ({
      role,
      text: redactRealtimeConversation(text, demoRunId),
    })),
  };

  return {
    type: "realtime",
    model: process.env.OPENAI_REALTIME_MODEL?.trim() || DEFAULT_REALTIME_MODEL,
    output_modalities: ["audio"],
    tools: realtimePortalToolDefinitions,
    tool_choice: "auto",
    parallel_tool_calls: false,
    audio: {
      input: {
        noise_reduction: { type: "near_field" },
        transcription: {
          model: process.env.OPENAI_REALTIME_TRANSCRIBE_MODEL?.trim() || DEFAULT_TRANSCRIPTION_MODEL,
          prompt: REALTIME_TRANSCRIPTION_PROMPT,
        },
        turn_detection: {
          type: "server_vad",
          create_response: true,
          interrupt_response: true,
          prefix_padding_ms: 300,
          silence_duration_ms: 1500,
        },
      },
      output: { voice: "coral" },
    },
    instructions: [
      assistantInstructions,
      "When the member asks you to navigate, scroll the page, open a workflow, reveal a section, focus a control, or run a supported demo action, use the matching function tool. Do not say you cannot navigate when an allowlisted tool applies. Never claim an action succeeded until its function output says completed. State-changing demo actions require explicit confirmation through the pending-action tools.",
      "Current masked portal context (synthetic data only):",
      JSON.stringify(maskedScreenContext),
    ].join("\n\n"),
  };
}

export async function createRealtimeCall({
  sdp,
  config,
}: {
  sdp: string;
  config: Record<string, unknown>;
}): Promise<{ sdp: string; callId?: string }> {
  const form = new FormData();
  form.set("sdp", sdp);
  form.set("session", JSON.stringify(config));

  const response = await fetch(REALTIME_CALLS_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${requireApiKey()}` },
    body: form,
  });

  if (!response.ok) throw new Error(REALTIME_NEGOTIATION_ERROR);
  const answerSdp = await response.text();
  if (!answerSdp.trim()) throw new Error(REALTIME_NEGOTIATION_ERROR);

  const callId = extractCallId(response.headers.get("location"));
  return callId ? { sdp: answerSdp, callId } : { sdp: answerSdp };
}
