import { getMemberSnapshot } from "@/server/repositories/member-repository";
import { processDefinitions } from "@/domain/process-definitions";
import { calculatePostedEpfBalance } from "@/domain/epf-balance";
import { getAssistantState } from "./assistant-store";

export interface AssistantContext {
  route: string;
  screen: {
    name: string;
    purpose: string;
    officialTerm?: string;
  };
  snapshot: Awaited<ReturnType<typeof getMemberSnapshot>>;
  findings: Awaited<ReturnType<typeof getMemberSnapshot>>["findings"];
  maskedModelSnapshot: Record<string, unknown>;
  activeProcess: null | { key: "ONBOARDING" | "FINAL_CLAIM"; title: string; questionCount: number };
  recentConversation: Array<{ role: "member" | "assistant"; text: string }>;
  allowedActions: string[];
}

const screenCatalog = [
  { path: "/claims/advance", name: "PF advance", purpose: "Explain Form 31 purpose rules and account-basis checks.", officialTerm: "PF advance · Form 31 / Composite Claim Form" },
  { path: "/claims/pension-withdrawal", name: "Pension withdrawal or Scheme Certificate", purpose: "Explain the Form 10C service boundary and possible outcomes.", officialTerm: "Withdrawal benefit / Scheme Certificate · Form 10C" },
  { path: "/claims/pension", name: "Monthly pension readiness", purpose: "Explain Form 10D pension categories and readiness.", officialTerm: "Monthly pension · Form 10D" },
  { path: "/claims", name: "Final settlement", purpose: "Check, submit, or track the fictional full PF withdrawal journey.", officialTerm: "Final settlement · Form 19" },
  { path: "/employment/mark-exit", name: "Mark employment exit", purpose: "Record a fictional employment exit after checking the date, reason, authentication, and consequences.", officialTerm: "Member-side Mark Exit" },
  { path: "/employment", name: "Employment history", purpose: "Review service records and resolve a missing exit date.", officialTerm: "UAN-linked service records" },
  { path: "/transfers/annexure-k", name: "Annexure K", purpose: "Explain the transfer certificate, its status, and the records it contains.", officialTerm: "Transfer Certificate · Annexure K" },
  { path: "/transfers", name: "Transfer service", purpose: "Check readiness to move previous EPF service into the current account.", officialTerm: "Transfer claim · Form 13 / auto-transfer" },
  { path: "/onboarding", name: "New-member setup", purpose: "Complete the four guided identity, contact, employment, and KYC sections.", officialTerm: "Simulated UMANG UAN return and Member Portal KYC review" },
  { path: "/passbook", name: "Contributions and passbook", purpose: "Review monthly contribution status, posted balances, and missing months.", officialTerm: "EPF passbook" },
  { path: "/profile", name: "Profile and KYC", purpose: "Review identity, PAN, bank verification, and the item needing attention.", officialTerm: "Member profile and Manage > KYC" },
  { path: "/uan-card", name: "UAN card", purpose: "Review or print the masked fictional UAN card.", officialTerm: "UAN card" },
  { path: "/contact-details", name: "Contact details", purpose: "Review the masked mobile record and simulated update process.", officialTerm: "UAN-linked mobile number" },
  { path: "/basic-details", name: "Basic details", purpose: "Explain name and date-of-birth correction requests.", officialTerm: "Basic details correction" },
  { path: "/security", name: "Account security", purpose: "Review session safeguards and the simulated security-review process." },
  { path: "/nomination", name: "e-Nomination", purpose: "Check nomination readiness and explain the fictional family-allocation example.", officialTerm: "e-Nomination · Form 2 and Aadhaar e-sign" },
  { path: "/pmvbry", name: "PMVBRY first-timer evidence", purpose: "Explain the deterministic Part A evidence checkpoints for this fictional member.", officialTerm: "PMVBRY Part A · First Timer" },
  { path: "/services", name: "Online services", purpose: "Help the member choose an EPF outcome before selecting the official form or service." },
  { path: "/help", name: "Help and grievances", purpose: "Explain who owns an EPF issue and when to use the official grievance channel.", officialTerm: "EPFiGMS" },
  { path: "/overview", name: "Overview", purpose: "Show the highest-priority account issue, current records, and the recommended next action." },
] as const;

function screenForRoute(route: string): AssistantContext["screen"] {
  const pathname = route.split("?")[0] || "/overview";
  const match = screenCatalog.find((screen) => pathname === screen.path || pathname.startsWith(`${screen.path}/`));
  return match ?? { name: "EPF member portal", purpose: "Help the member understand the current page and choose a safe next action." };
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
  const { amount, ...claimWithoutStoredAmount } = claim;
  return {
    ...claimWithoutStoredAmount,
    amountDisplayed: formatRupeesForDisplay(amount),
    currency: "INR",
  };
}

export async function buildAssistantContext({ demoRunId, route }: { demoRunId: string; route: string }): Promise<AssistantContext> {
  const snapshot = await getMemberSnapshot(demoRunId);
  const state = await getAssistantState(demoRunId);
  const processKey: "ONBOARDING" | "FINAL_CLAIM" | null = route.includes("onboarding") ? "ONBOARDING" : route.includes("claims") ? "FINAL_CLAIM" : null;
  const activeProcess = processKey ? {
    key: processKey,
    title: processDefinitions[processKey].title,
    questionCount: processDefinitions[processKey].questions.length,
  } : null;
  return {
    route,
    screen: screenForRoute(route),
    snapshot,
    findings: snapshot.findings,
    maskedModelSnapshot: {
      persona: snapshot.persona,
      profile: { uanMasked: snapshot.profile.uanMasked, onboardingComplete: snapshot.profile.onboardingComplete },
      kyc: snapshot.kyc.map((item) => ({ type: item.type, status: item.status, valueMasked: item.valueMasked })),
      employments: snapshot.employments.map((item) => ({
        memberIdMasked: item.memberIdMasked,
        establishmentName: item.establishmentName,
        joinedAt: item.joinedAt,
        exitedAt: item.exitedAt,
      })),
      activeClaim: claimForAssistant(snapshot.activeClaim),
      latestClaim: claimForAssistant(snapshot.latestClaim ?? null),
      claimEvents: snapshot.claimEvents.slice(0, 6),
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
      simulations: snapshot.simulations,
      scenarios: snapshot.scenarioRuns,
      nextAction: snapshot.nextAction,
    },
    activeProcess,
    recentConversation: state.messages.slice(-8).map(({ role, text }) => ({ role, text })),
    allowedActions: ["NAVIGATE", "REQUEST_EMPLOYER_CORRECTION", "EXTRACT_DOCUMENT", "PATCH_FORM", "APPLY_DEMO_CORRECTION"],
  };
}
