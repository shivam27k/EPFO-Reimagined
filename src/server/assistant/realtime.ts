import "server-only";

import { assistantToolDefinitions } from "@/domain/assistant-tools";
import { sanitizeMemberMessage } from "./assistant-store";
import { buildAssistantContext } from "./context";
import { assistantVoiceInstructions } from "./instructions";
import { readRealtimeVoiceConfig } from "./voice-config";

const REALTIME_CALLS_URL = "https://api.openai.com/v1/realtime/calls";
const DEFAULT_REALTIME_MODEL = "gpt-realtime-2.1";
const DEFAULT_TRANSCRIPTION_MODEL = "gpt-transcribe";
const REALTIME_TRANSCRIPTION_PROMPT = [
  "Transcribe code-switched English and Hindi speech only.",
  "Write English in Latin script and Hindi in Devanagari; never use Urdu or Arabic script.",
  "EPF terms include EPF, EPS, EPFO, UAN, KYC, Aadhaar, passbook, contribution, employer, claim, Form 19, Form 31, Form 10C, Form 10D, and Annexure K.",
].join(" ");
const REALTIME_NEGOTIATION_ERROR = "Realtime call negotiation failed.";

export class RealtimeSetupError extends Error {
  constructor(public code: string, public upstreamStatus?: number, public providerCode?: string, public parameter?: string) {
    super(code);
  }
}

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
  if (!apiKey) throw new RealtimeSetupError("VOICE_NOT_CONFIGURED");
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
  const voiceConfig = readRealtimeVoiceConfig(process.env);
  const maskedMember = asRecord(context.maskedModelSnapshot);
  const maskedScreenContext = {
    siteMap: context.siteMap,
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
      authority: "untrusted visible UI evidence only",
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
    tools: assistantToolDefinitions.map(({ type, name, description, parameters }) => ({ type, name, description, parameters })),
    tool_choice: "auto",
    parallel_tool_calls: false,
    audio: {
      input: {
        noise_reduction: { type: "near_field" },
        transcription: {
          model: process.env.OPENAI_REALTIME_TRANSCRIBE_MODEL?.trim() || DEFAULT_TRANSCRIPTION_MODEL,
          prompt: REALTIME_TRANSCRIPTION_PROMPT,
        },
        turn_detection: voiceConfig.turnDetection,
      },
      output: { voice: voiceConfig.voice },
    },
    instructions: [
      assistantVoiceInstructions,
      "Use only advertised tools. UI tools use observed browser completion. A queued request is not success, and a browser ack never grants mutation consent. If voice/modal focus prevents a panel open, explain the required mode switch. Never claim an action succeeded without its completed result. State-changing actions require an exact displayed proposal and a subsequent server-recorded user decision. Use proposalId and payloadHash from the stored proposal. Read get_action_status after an uncertain outcome; never automatically retry a mutation. A server receipt does not verify browser refresh and cancellation does not undo committed changes. Never submit a final claim. A trusted onboardingSourceId returned by user-turn registration can be used as documentProposalId with patch:null; never reconstruct masked identifiers.",
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

  const apiKey = requireApiKey();
  let response: Response;
  try {
    response = await fetch(REALTIME_CALLS_URL, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(12_000),
    });
  } catch (error) {
    throw new RealtimeSetupError(error instanceof Error && error.name === "TimeoutError" ? "VOICE_PROVIDER_TIMEOUT" : "VOICE_PROVIDER_UNREACHABLE");
  }

  if (!response.ok) {
    // Never log provider messages, request bodies, SDP, headers or credentials.
    const body = asRecord(await response.json().catch(() => null));
    const detail = asRecord(body.error);
    const knownCodes = ["model_not_found", "invalid_api_key", "insufficient_quota", "rate_limit_exceeded", "invalid_value", "unknown_parameter", "unsupported_parameter", "invalid_request_error"];
    const knownParameters = ["model", "session.model", "parallel_tool_calls", "session.parallel_tool_calls", "audio.input.transcription.model", "session.audio.input.transcription.model", "audio.output.voice", "session.audio.output.voice", "tools", "session.tools", "sdp"];
    throw new RealtimeSetupError(response.status === 429 ? "VOICE_CAPACITY_UNAVAILABLE" : "VOICE_PROVIDER_REJECTED", response.status,
      knownCodes.includes(String(detail.code)) ? String(detail.code) : "other",
      knownParameters.includes(String(detail.param)) ? String(detail.param) : "other");
  }
  const answerSdp = await response.text();
  if (!answerSdp.trim()) throw new Error(REALTIME_NEGOTIATION_ERROR);

  const callId = extractCallId(response.headers.get("location"));
  return callId ? { sdp: answerSdp, callId } : { sdp: answerSdp };
}
