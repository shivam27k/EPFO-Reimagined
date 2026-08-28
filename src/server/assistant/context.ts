import { getMemberSnapshot, getMemberSnapshotWithVersion } from "@/server/repositories/member-repository";
import { processDefinitions } from "@/domain/process-definitions";
import { calculatePostedEpfBalance } from "@/domain/epf-balance";
import { getAssistantState } from "./assistant-store";
import { redactModelText } from "./model-text";
import { portalPageForRoute, portalSiteMap } from "@/domain/portal-site-map";
import { getPortalServiceGroups } from "@/domain/portal-services";

export interface AssistantContext {
  siteMap: typeof portalSiteMap;
  contextVersion: string;
  route: string;
  screen: {
    name: string;
    purpose: string;
    officialTerm?: string;
    currentState: string;
    visibleFacts: string[];
  };
  renderedScreen: null | { source: "current-rendered-page"; text: string };
  snapshot: Awaited<ReturnType<typeof getMemberSnapshot>>;
  findings: Awaited<ReturnType<typeof getMemberSnapshot>>["findings"];
  maskedModelSnapshot: Record<string, unknown>;
  activeProcess: null | { key: "ONBOARDING" | "FINAL_CLAIM"; title: string; questionCount: number };
  recentConversation: Array<{ role: "member" | "assistant"; text: string }>;
  allowedActions: string[];
}


function screenForRoute(
  route: string,
  snapshot: Awaited<ReturnType<typeof getMemberSnapshot>>,
): AssistantContext["screen"] {
  const pathname = route.split("?")[0] || "/overview";
  const match = portalPageForRoute(pathname);
  const base = match ?? { name: "EPF member portal", purpose: "Help the member understand the current page and choose a safe next action." };

  if (pathname === "/services") {
    const claimStatus = (snapshot.activeClaim ?? snapshot.latestClaim)?.status.replaceAll("_", " ").toLowerCase();
    const groups = getPortalServiceGroups(claimStatus);
    return { ...base, currentState: "Choose from nine services grouped by member outcome.",
      visibleFacts: groups.flatMap((group) => group.services.map((service) =>
        `${group.title}: ${service.title} — ${service.term}. ${service.description} Route: ${service.href}`)),
    };
  }

  if (pathname === "/employment") {
    const openEmployments = snapshot.employments.filter((employment) => !employment.exitedAt);
    const latest = snapshot.employments[0];
    const complete = snapshot.employments.length > 0 && openEmployments.length === 0;
    return {
      ...base,
      currentState: complete ? "Employment record complete" : "Exit update needed",
      visibleFacts: complete
        ? [
            "All employment records have a recorded exit date.",
            ...(latest?.exitedAt ? [`Exit date on the latest record: ${latest.exitedAt}.`] : []),
          ]
        : [
            `${openEmployments.length} employment record${openEmployments.length === 1 ? " has" : "s have"} no recorded exit date.`,
            "The page offers the member-side Mark Exit process when its conditions are met.",
          ],
    };
  }

  return {
    ...base,
    currentState: "Page structure is known. Use current rendered text and member records for dynamic status, not unrelated account alerts.",
    visibleFacts: (match?.sections ?? []).map((section) => `Page section: ${section}`),
  };
}

export function sanitizeRenderedScreenText(text: string | undefined): string | null {
  if (!text) return null;
  const normalized = redactModelText(text)
    .replace(/\b\d{4}[\s-]+\d{4}[\s-]+\d{4}\b/g, "[masked Aadhaar-format value]")
    .replace(/\b[A-Z]{5}\d{10,22}\b/gi, "[masked EPF member ID]")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n")
    .slice(0, 6000);
  return normalized || null;
}

function formatRupeesForDisplay(amountInPaise: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amountInPaise / 100);
}

function claimForAssistant(
  claim: Awaited<ReturnType<typeof getMemberSnapshot>>["activeClaim"],
) {
  if (!claim) return null;
  return {
    type: claim.type,
    status: claim.status,
    submittedAt: claim.submittedAt,
    amountDisplayed: formatRupeesForDisplay(claim.amount),
    currency: "INR",
  };
}

export async function buildAssistantContext({
  demoRunId,
  route,
  visibleScreenText,
  signal,
}: {
  demoRunId: string;
  route: string;
  visibleScreenText?: string;
  signal?: AbortSignal;
}): Promise<AssistantContext> {
  signal?.throwIfAborted();
  const { snapshot, contextVersion } = await getMemberSnapshotWithVersion(demoRunId);
  signal?.throwIfAborted();
  const state = await getAssistantState(demoRunId);
  signal?.throwIfAborted();
  const safeText = (text: string) => redactModelText(text, demoRunId);
  const renderedScreenText = sanitizeRenderedScreenText(visibleScreenText ? safeText(visibleScreenText) : undefined);
  const screen = screenForRoute(route, snapshot);
  const findings = snapshot.findings.map((finding) => ({
    code: finding.code, severity: finding.severity, owner: finding.owner,
    title: safeText(finding.title), explanation: safeText(finding.explanation),
    allowedActions: finding.allowedActions.map((action) => action),
  }));
  const processKey: "ONBOARDING" | "FINAL_CLAIM" | null = route.includes("onboarding") ? "ONBOARDING" : route.includes("claims") ? "FINAL_CLAIM" : null;
  const activeProcess = processKey ? {
    key: processKey,
    title: processDefinitions[processKey].title,
    questionCount: processDefinitions[processKey].questions.length,
  } : null;
  return {
    contextVersion,
    siteMap: portalSiteMap,
    route: safeText(route.split(/[?#]/)[0]),
    screen: { ...screen, currentState: safeText(screen.currentState), visibleFacts: screen.visibleFacts.map(safeText) },
    renderedScreen: renderedScreenText
      ? { source: "current-rendered-page", text: renderedScreenText }
      : null,
    snapshot,
    findings,
    maskedModelSnapshot: {
      persona: snapshot.persona,
      profile: { uanMasked: snapshot.profile.uanMasked, onboardingComplete: snapshot.profile.onboardingComplete },
      kyc: snapshot.kyc.map((item) => ({ type: item.type, status: item.status, valueMasked: safeText(item.valueMasked) })),
      employments: snapshot.employments.map((item) => ({
        memberIdMasked: item.memberIdMasked,
        establishmentName: safeText(item.establishmentName),
        joinedAt: item.joinedAt,
        exitedAt: item.exitedAt,
      })),
      activeClaim: claimForAssistant(snapshot.activeClaim),
      latestClaim: claimForAssistant(snapshot.latestClaim ?? null),
      claimEvents: snapshot.claimEvents.slice(0, 6).map((event) => ({
        status: event.status, actor: event.actor, occurredAt: event.occurredAt,
        explanation: safeText(event.explanation),
      })),
      contributionSummary: {
        currency: "INR",
        displayUnit: "whole rupees",
        postedEpfBalanceDisplayed: formatRupeesForDisplay(calculatePostedEpfBalance(snapshot.contributions)),
      },
      contributions: snapshot.contributions.map((item) => ({
        wageMonth: item.wageMonth,
        postingStatus: item.postingStatus,
        employeeEpfDisplayed: formatRupeesForDisplay(item.employeeEpf),
        employerEpfDisplayed: formatRupeesForDisplay(item.employerEpf),
        employerEpsDisplayed: formatRupeesForDisplay(item.employerEps),
      })),
      simulations: snapshot.simulations.map((simulation) => ({
        kind: simulation.kind, intervalStart: simulation.intervalStart, intervalEnd: simulation.intervalEnd,
        intervalLabel: safeText(simulation.intervalLabel), months: simulation.months, recordedAt: simulation.recordedAt,
      })),
      scenarios: snapshot.scenarioRuns.map((scenario) => ({
        scenarioKey: scenario.scenarioKey, stage: scenario.stage, updatedAt: scenario.updatedAt,
      })),
      nextAction: { label: safeText(snapshot.nextAction.label), href: snapshot.nextAction.href },
    },
    activeProcess,
    recentConversation: state.messages.slice(-8).map(({ role, text }) => ({ role, text: safeText(text) })),
    allowedActions: ["NAVIGATE"],
  };
}
