import { getPortalServiceGroups } from "./portal-services";
import { destinationRoutes, workflowRoutes, portalTargets } from "./portal-actions";

const pageSections: Record<string, string[]> = {
  "/overview": ["Priority account alerts", "Recommended next action", "Account records"],
  "/profile": ["Full identity record", "Individual KYC records", "Profile and account tools"],
  "/employment": ["Employment records", "Member-side Mark Exit"],
  "/employment/mark-exit": ["Employment exit date, reason and confirmation"],
  "/passbook": ["Contribution status", "Monthly contribution records"],
  "/claims": ["Eligibility checks", "Final-settlement confirmation requirements", "Full claim event history"],
  "/claims/advance": ["Account-basis checks", "Common Form 31 purpose rules", "Prototype boundary"],
  "/claims/pension-withdrawal": ["Form 10C readiness checks", "Form 10C outcomes", "Prototype boundary"],
  "/claims/pension": ["Form 10D readiness checks", "Pension categories", "Prototype boundary"],
  "/transfers": ["Transfer readiness checks", "Employment records for transfer", "Annexure K"],
  "/transfers/annexure-k": ["Annexure K status checks", "Records in the certificate", "Official route and prototype boundary"],
  "/nomination": ["Nomination status", "Fictional family allocation example", "Official e-Nomination steps"],
  "/pmvbry": ["Part A condition checks", "Evidence checkpoints", "Prototype boundary"],
  "/contact-details": ["Saved contact record", "Simulated mobile update", "Update-process safeguards"],
  "/basic-details": ["Current basic-details record", "Correction status progression", "Details to correct"],
  "/security": ["Session safeguards", "Security-review boundary"],
  "/uan-card": ["Printable masked demo UAN card"],
  "/onboarding": ["Identity", "Contact", "Employment", "KYC"],
  "/help": ["Responsible actor", "Issue guidance", "Official grievance route"],
  "/services": ["Withdraw money", "Plan pension", "Move service history", "Protect family", "Understand benefits and support"],
};

export const portalScreenCatalog = [
  { path: "/claims/advance", name: "PF advance", purpose: "Explain Form 31 purpose rules and account-basis checks.", officialTerm: "PF advance · Form 31 / Composite Claim Form" },
  { path: "/claims/pension-withdrawal", name: "Pension withdrawal or Scheme Certificate", purpose: "Explain the Form 10C service boundary and possible outcomes.", officialTerm: "Withdrawal benefit / Scheme Certificate · Form 10C" },
  { path: "/claims/pension", name: "Monthly pension readiness", purpose: "Explain Form 10D pension categories and readiness.", officialTerm: "Monthly pension · Form 10D" },
  { path: "/claims", name: "Final settlement", purpose: "Check, submit, or track the fictional full PF withdrawal journey.", officialTerm: "Final settlement · Form 19" },
  { path: "/employment/mark-exit", name: "Mark employment exit", purpose: "Record a fictional employment exit after checking the date, reason, authentication, and consequences.", officialTerm: "Member-side Mark Exit" },
  { path: "/employment", name: "Employment history", purpose: "Review service records and determine whether an exit-date update is needed.", officialTerm: "UAN-linked service records" },
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

/** Authored page structure, not evidence that a particular panel is open. */
export const portalSiteMap = portalScreenCatalog.map((page) => ({
  ...page,
  sections: pageSections[page.path] ?? [],
  targets: portalTargets.filter((target) => target.startsWith(
    (page.path === "/passbook" ? "contributions" : page.path.slice(1)) + ".")),
  navigation: {
    destination: Object.entries(destinationRoutes).find(([, route]) => route === page.path)?.[0] ?? null,
    workflow: Object.entries(workflowRoutes).find(([, value]) => value.route === page.path)?.[0] ?? null,
  },
  ...(page.path === "/services" ? { serviceGroups: getPortalServiceGroups() } : {}),
}));

export function portalPageForRoute(route: string) {
  const pathname = route.split(/[?#]/)[0];
  const exact = portalSiteMap.find((page) => pathname === page.path);
  if (exact) return exact;
  if (/^\/claims\/[^/]+$/.test(pathname)) return {
    path: pathname, name: "Claim details", purpose: "Review this claim's recorded status, timeline and payment events. Use current records for its actual outcome.",
    sections: ["Claim status", "Claim timeline", "Payment events"],
  };
  return null;
}
